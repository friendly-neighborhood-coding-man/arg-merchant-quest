import { getDb } from "./db";

/**
 * Abuse and cost guards for the public demo deployment.
 *
 * Two different things live here:
 *
 * 1. **In-process rate limits.** A fixed-window counter per client address. The
 *    demo runs as exactly one Node process against one SQLite file
 *    (docs/DEPLOYMENT.md), so process memory is the whole deployment. A restart
 *    clears the counters; that is acceptable for abuse throttling, not for
 *    billing.
 * 2. **Spending caps derived from the database.** The Devnet payout budget and
 *    the live-AI reply budget are counted from stored rows over the last 24
 *    hours, so they survive a restart and cannot be bypassed by a new cookie.
 *    A stored count alone is not enough: the work between the check and the
 *    write is asynchronous (a model call, a Devnet transfer), so a burst of
 *    concurrent requests would all read the same count and each spend it. The
 *    reservation helpers below claim the unit synchronously first, which is
 *    what makes the caps hold under concurrency in this single process.
 *
 * Neither is a security boundary. The admin passphrase in `src/proxy.ts` is the
 * only access control, and every value here is a demo-protection default.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
const MAX_TRACKED_WINDOWS = 2000;

export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

/**
 * Count one hit against `key`. The window starts with the first hit and does
 * not slide, so a client that is refused keeps its reset time.
 */
export function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (limit <= 0) return { ok: false, retryAfterSeconds: Math.ceil(windowMs / 1000), remaining: 0 };

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    pruneWindows(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - 1) };
  }
  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  existing.count += 1;
  return { ok: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - existing.count) };
}

/** Rate limit one request in the scope of a named route. */
export function checkRateLimit(
  request: Request,
  name: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  return takeRateLimit(`${name}:${clientAddress(request.headers)}`, limit, windowMs);
}

function pruneWindows(now: number) {
  if (windows.size < MAX_TRACKED_WINDOWS) return;
  for (const [key, value] of windows) {
    if (value.resetAt <= now) windows.delete(key);
  }
}

/** Test hook: forget every in-process window. */
export function resetRateLimits() {
  windows.clear();
}

/** The two daily budgets and the one-per-completion payout lock. */
export type SpendingKind = "payout" | "ai_reply";

const inFlight: Record<SpendingKind, number> = { payout: 0, ai_reply: 0 };
const activePayouts = new Set<string>();

/**
 * Claim one unit of a daily budget before doing the metered work.
 *
 * `used` is read by the caller in the same synchronous step as this call, so
 * no other request can interleave between reading the count and incrementing
 * the in-flight reservation. The caller must pair a `true` with
 * `releaseSpendingSlot` in a `finally`, and must release only after the row
 * that `used` counts has been written; the stored row then covers the unit and
 * the reservation can go.
 *
 * This holds for one process, which is the documented deployment (one server,
 * one SQLite file). A second process would have its own counters.
 */
export function reserveSpendingSlot(kind: SpendingKind, cap: number, used: number): boolean {
  if (cap <= 0) return false;
  if (used + inFlight[kind] >= cap) return false;
  inFlight[kind] += 1;
  return true;
}

export function releaseSpendingSlot(kind: SpendingKind): void {
  inFlight[kind] = Math.max(0, inFlight[kind] - 1);
}

/**
 * One payout per completion, even for simultaneous claims.
 *
 * `beginPayout` marks the row `processing`, but two requests that already read
 * the same `pending` snapshot both pass that check and both sign a transfer.
 * The stored row is a single row, so the second transfer would spend treasury
 * tokens without adding to the capped count.
 */
export function reservePayoutForCompletion(completionId: string): boolean {
  if (activePayouts.has(completionId)) return false;
  activePayouts.add(completionId);
  return true;
}

export function releasePayoutForCompletion(completionId: string): void {
  activePayouts.delete(completionId);
}

/** Test hook: forget every reservation and payout lock. */
export function resetSpendingReservations() {
  inFlight.payout = 0;
  inFlight.ai_reply = 0;
  activePayouts.clear();
}

export function inFlightReservations(kind: SpendingKind): number {
  return inFlight[kind];
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isoHoursAgo(hours: number, now: Date): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * The daily cap on confirmed Devnet reward payouts. One reward is 1.00 tUSDC of
 * a valueless demo token, so the cap protects the treasury balance and the
 * demo's credibility rather than real money.
 */
export function dailyPayoutCap(): number {
  return positiveInt(process.env.ARG_DAILY_PAYOUT_CAP, 25);
}

export function payoutsInLastDay(now = new Date()): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM quest_completions
       WHERE payout_status = 'paid' AND payout_confirmed_at >= ?`,
    )
    .get(isoHoursAgo(24, now)) as { count: number };
  return row.count;
}

/** The daily cap on stored companion replies, live or scripted. */
export function dailyAiReplyCap(): number {
  return positiveInt(process.env.ARG_AI_DAILY_REPLY_CAP, 300);
}

export function aiRepliesInLastDay(now = new Date()): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM companion_messages
       WHERE role = 'assistant' AND created_at >= ?`,
    )
    .get(isoHoursAgo(24, now)) as { count: number };
  return row.count;
}
