#!/usr/bin/env node
/**
 * Secure provider-capture proxy for demo evidence.
 *
 * Point the app at this process instead of the real provider:
 *
 *   ARG_UPSTREAM_AI_BASE_URL=https://api.anthropic.com/v1 \
 *   ARG_AI_API_KEY=... CAPTURE_PORT=8891 \
 *   node scripts/demo/provider-capture.mjs
 *
 *   ARG_AI_BASE_URL=http://127.0.0.1:8891/v1 ARG_AI_MODEL=claude-opus-5-5 npm run dev
 *
 * The proxy forwards every chat-completions request unchanged and appends one
 * JSON line per request to a local, gitignored capture file: request messages,
 * response text, upstream status, elapsed time, token usage and the header names
 * forwarded. Header values, and any occurrence of the key inside a body, are
 * never written; a key found in a body is replaced with "[redacted]".
 *
 * Modes:
 *   (default)             forward and record one completion per app request
 *   --models              list the model ids this key can reach (GET /models)
 *   --cost [days]         print the organization cost report for the last days
 *
 * `--cost` needs an organization Admin API key (ARG_ANTHROPIC_ADMIN_KEY); the
 * promotional credit balance itself is only shown in Console → Billing.
 *
 * Bound to 127.0.0.1 on purpose: it holds the key in memory and must not be
 * reachable from the preview network.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

const upstream = (process.env.ARG_UPSTREAM_AI_BASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.ARG_AI_API_KEY ?? "";
const adminKey = process.env.ARG_ANTHROPIC_ADMIN_KEY ?? "";
const anthropicVersion = process.env.ARG_AI_VERSION || "2023-06-01";
const workspaceId = process.env.ARG_AI_WORKSPACE_ID ?? "";
const port = Number(process.env.CAPTURE_PORT ?? 8891);
const outFile = process.env.CAPTURE_OUT ?? path.join(".data", "demo", "provider-capture.jsonl");
const args = process.argv.slice(2);
const wantModels = args.includes("--models");
const costFlag = args.indexOf("--cost");
const wantCost = costFlag !== -1;
const costDays = wantCost ? Number(args[costFlag + 1] ?? 7) || 7 : 7;

const isAnthropic = upstream.includes("anthropic.com");

const redact = (value) => (key ? String(value).split(key).join("[redacted]") : String(value));

function record(entry) {
  mkdirSync(path.dirname(outFile), { recursive: true });
  appendFileSync(outFile, `${redact(JSON.stringify(entry))}\n`);
}

/** Auth headers this proxy sends upstream; only names are ever recorded. */
function authHeaders() {
  const headers = { Authorization: `Bearer ${key}` };
  if (isAnthropic) {
    headers["anthropic-version"] = anthropicVersion;
    if (workspaceId) headers["anthropic-workspace-id"] = workspaceId;
  }
  return headers;
}

/** `upstream` already ends in /v1, and the app posts to /v1/chat/completions. */
function joinUrl(pathname) {
  if (upstream.endsWith("/v1") && pathname.startsWith("/v1/")) return `${upstream}${pathname.slice(3)}`;
  return `${upstream}${pathname}`;
}

if (wantCost) {
  if (!adminKey) {
    console.error(
      "Set ARG_ANTHROPIC_ADMIN_KEY (an organization Admin API key) to read the cost report.\n" +
        "The promotional credit balance and its expiry are shown only in Console → Billing.",
    );
    process.exit(2);
  }
  const ending = new Date();
  const starting = new Date(ending.getTime() - costDays * 86_400_000);
  const url =
    "https://api.anthropic.com/v1/organizations/cost_report" +
    `?starting_at=${encodeURIComponent(starting.toISOString())}` +
    `&ending_at=${encodeURIComponent(ending.toISOString())}` +
    "&bucket_width=1d&group_by[]=description";
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${adminKey}`, "anthropic-version": anthropicVersion },
  });
  const text = await response.text();
  console.log(`GET cost_report (${costDays}d) -> HTTP ${response.status}`);
  if (!response.ok) {
    console.log(text.slice(0, 800));
    process.exit(1);
  }
  const body = JSON.parse(text);
  for (const bucket of body.data ?? []) {
    const items = bucket.results ?? [];
    const total = items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    console.log(
      `${bucket.starting_at} .. ${bucket.ending_at}: ${total.toFixed(4)} ${items[0]?.currency ?? "USD"} (${items.length} line item(s))`,
    );
    for (const item of items) {
      console.log(`  ${item.model ?? item.cost_type ?? "?"}: ${item.amount} ${item.currency ?? "USD"} ${item.description ?? ""}`.trimEnd());
    }
  }
  if (!body.data?.length) console.log("No cost buckets returned for that window.");
  console.log(
    "Amounts are printed exactly as the Cost API reports them. The promotional credit balance and which credit it is drawn from are shown in Console → Billing.",
  );
  process.exit(0);
}

if (!upstream || !key) {
  console.error(
    "Set ARG_UPSTREAM_AI_BASE_URL (for example https://api.anthropic.com/v1) and ARG_AI_API_KEY.",
  );
  process.exit(1);
}

if (wantModels) {
  const response = await fetch(`${upstream}/models`, { headers: authHeaders() });
  const text = await response.text();
  let ids = [];
  try {
    const parsed = JSON.parse(text);
    ids = (parsed.data ?? []).map((model) => model.id).filter(Boolean).sort();
  } catch {
    ids = [];
  }
  console.log(`GET ${upstream}/models -> HTTP ${response.status}; ${ids.length} model id(s).`);
  if (!ids.length) console.log(redact(text.slice(0, 600)));
  for (const id of ids) console.log(`  ${id}`);
  process.exit(response.ok ? 0 : 1);
}

const server = createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "text/plain" }).end("POST only");
    return;
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", async () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    let body = null;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = null;
    }
    const startedAt = Date.now();
    const target = joinUrl(request.url ?? "/v1/chat/completions");
    // Pass the app's own provider headers through (anthropic-version and
    // anthropic-beta matter for the request shape) but never the credentials.
    const forwarded = {};
    for (const [name, value] of Object.entries(request.headers)) {
      const lower = name.toLowerCase();
      if (["authorization", "x-api-key", "host", "content-length", "connection"].includes(lower)) continue;
      if (typeof value === "string") forwarded[lower] = value;
    }
    const headers = { ...forwarded, ...authHeaders() };
    try {
      const upstreamResponse = await fetch(target, {
        method: "POST",
        headers,
        body: bodyText,
      });
      const responseText = await upstreamResponse.text();
      const elapsedMs = Date.now() - startedAt;
      let usage = null;
      try {
        usage = JSON.parse(responseText)?.usage ?? null;
      } catch {
        usage = null;
      }
      record({
        at: new Date().toISOString(),
        path: request.url,
        upstreamTarget: target,
        model: body?.model ?? null,
        status: upstreamResponse.status,
        elapsedMs,
        messages: body?.messages ?? null,
        parameters: body
          ? Object.fromEntries(Object.entries(body).filter(([field]) => field !== "messages"))
          : null,
        headerNames: Object.keys(headers).sort(),
        usage,
        response: responseText.slice(0, 8000),
      });
      console.log(
        `POST ${request.url} ${upstreamResponse.status} ${elapsedMs}ms model=${body?.model ?? "?"} messages=${body?.messages?.length ?? 0} usage=${usage ? JSON.stringify(usage) : "none"}`,
      );
      response.writeHead(upstreamResponse.status, {
        "content-type": upstreamResponse.headers.get("content-type") ?? "application/json",
      });
      response.end(responseText);
    } catch (error) {
      record({
        at: new Date().toISOString(),
        path: request.url,
        upstreamTarget: target,
        model: body?.model ?? null,
        status: 0,
        elapsedMs: Date.now() - startedAt,
        messages: body?.messages ?? null,
        headerNames: Object.keys(headers).sort(),
        error: String(error?.message ?? error),
      });
      console.log(`POST ${request.url} transport error: ${error?.message ?? error}`);
      response.writeHead(502, { "content-type": "application/json" }).end(
        JSON.stringify({ error: { message: `capture proxy transport error: ${error?.message ?? error}` } }),
      );
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Provider capture proxy on http://127.0.0.1:${port} -> ${upstream}`);
  console.log(`Capture file: ${outFile} (gitignored, key redacted)`);
});
