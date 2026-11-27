import { NextResponse, type NextRequest } from "next/server";

/**
 * Public-demo edge guard.
 *
 * The prototype has no accounts, so the merchant and operator consoles would
 * otherwise be open to anyone with the URL. One shared passphrase, supplied by
 * the deployment (`ARG_ADMIN_PASSWORD`), gates every administrative page and
 * mutation. Players never see it: the journey from `/quests` to the reward and
 * the staff redemption lookup stay public.
 *
 * - `ARG_ADMIN_PASSWORD` set: HTTP Basic auth is required on admin surfaces.
 * - Unset outside production: allowed, so local development and tests work.
 * - Unset in production (`APP_ENV=production`): admin surfaces return 503
 *   instead of silently opening. A public demo must never start unprotected by
 *   accident.
 *
 * The same file applies a coarse per-address rate limit to the JSON API. The
 * route handlers add tighter limits and the spending caps in `src/lib/limits.ts`.
 */

const ADMIN_PAGE_PREFIXES = ["/merchant", "/operator", "/staff"];
const ADMIN_API_PREFIXES = [
  "/api/merchant",
  "/api/evidence",
  "/api/coupons",
  "/api/product-claims/handoff",
];

/** Create/edit/review campaign APIs. The published listing stays public. */
const CAMPAIGN_API = "/api/campaigns";

const API_LIMIT = 300;
const API_WINDOW_MS = 60_000;
const AUTH_FAILURE_LIMIT = 20;
const AUTH_FAILURE_WINDOW_MS = 10 * 60_000;

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

function take(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (buckets.size > 5000) {
      for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

function address(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Length-safe comparison so a wrong passphrase does not leak its prefix. */
function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index += 1) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function passphraseFrom(header: string | null): string | null {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

function isAdminSurface(pathname: string, method: string): boolean {
  if (ADMIN_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  if (ADMIN_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  if (pathname === CAMPAIGN_API || pathname.startsWith(`${CAMPAIGN_API}/`)) {
    // Reading the public published listing is the only open campaign API.
    return !(method === "GET" && pathname === CAMPAIGN_API);
  }
  return false;
}

function challenge(message: string, json: boolean): NextResponse {
  const headers = {
    "WWW-Authenticate": 'Basic realm="ARG Merchant Quest demo", charset="UTF-8"',
    "Cache-Control": "no-store",
  };
  if (json) return NextResponse.json({ error: message }, { status: 401, headers });
  return new NextResponse(message, {
    status: 401,
    headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ip = address(request.headers);

  if (pathname.startsWith("/api/") && !take(`api:${ip}`, API_LIMIT, API_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many requests from this address. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
    );
  }

  if (!isAdminSurface(pathname, method)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const expected = process.env.ARG_ADMIN_PASSWORD;

  if (!expected) {
    if (process.env.APP_ENV === "production") {
      return NextResponse.json(
        {
          error:
            "Administrative access is not configured on this deployment. Set ARG_ADMIN_PASSWORD before exposing the demo publicly.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.next();
  }

  const given = passphraseFrom(request.headers.get("authorization"));
  if (given && sameSecret(given, expected)) return NextResponse.next();

  // Throttle guessing on the shared passphrase.
  if (!take(`auth:${ip}`, AUTH_FAILURE_LIMIT, AUTH_FAILURE_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many failed administrator attempts. Wait ten minutes." },
      { status: 429, headers: { "Retry-After": "600", "Cache-Control": "no-store" } },
    );
  }

  return challenge(
    isApi
      ? "This endpoint requires the demo administrator passphrase."
      : "The merchant and operator consoles require the demo administrator passphrase.",
    isApi,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
