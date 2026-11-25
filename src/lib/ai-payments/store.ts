/**
 * SQLite accounting for token-funded inference.
 *
 * Correctness rules the schema enforces:
 * - `reference` and `signature` are UNIQUE: one chain payment can settle at
 *   most one intent, and one intent can settle at most once.
 * - `ai_inference_charges.intent_id` is UNIQUE: an intent can start at most one
 *   inference, so a duplicate request cannot be charged twice.
 * - the transition `quoted → paid` and `paid → consumed` are conditional
 *   UPDATEs, so two concurrent requests cannot both win.
 * - refunds are recorded as server credits (a replacement, no-cost intent),
 *   never as an automatic chain transfer.
 */

import { randomUUID } from "node:crypto";
import { getDb } from "../db";

export type IntentStatus =
  | "quoted"
  | "paid"
  | "consumed"
  | "refund_owed"
  | "refunded"
  | "failed"
  | "expired";

export interface AiIntent {
  id: string;
  sessionId: string;
  campaignId: string;
  reference: string;
  mint: string;
  receiver: string;
  receiverAta: string;
  amountBaseUnits: number;
  requestHash: string;
  question: string;
  status: IntentStatus;
  createdAt: string;
  expiresAt: string;
  signature: string | null;
  payer: string | null;
  paidAt: string | null;
  chargeId: string | null;
  fundedByGrant: string | null;
  /** "er" for a MagicBlock Ephemeral Rollup payment, "base" for Solana Pay. */
  settlement: "er" | "base";
  depositSignature: string | null;
  validator: string | null;
  erEndpoint: string | null;
  payerBalanceBefore: number | null;
  payerBalanceAfter: number | null;
  receiverBalanceBefore: number | null;
  receiverBalanceAfter: number | null;
}

export interface AiCharge {
  id: string;
  intentId: string;
  sessionId: string;
  status: "running" | "ok" | "failed";
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  reply: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

let ensured = false;

function ensureTables(): void {
  if (ensured) return;
  const db = getDb();
  db.prepare(
    `CREATE TABLE IF NOT EXISTS ai_payment_intents (
       id TEXT PRIMARY KEY,
       session_id TEXT NOT NULL,
       campaign_id TEXT NOT NULL,
       reference TEXT NOT NULL UNIQUE,
       mint TEXT NOT NULL,
       receiver TEXT NOT NULL,
       receiver_ata TEXT NOT NULL,
       amount_base_units INTEGER NOT NULL,
       request_hash TEXT NOT NULL,
       question TEXT NOT NULL,
       status TEXT NOT NULL,
       created_at TEXT NOT NULL,
       expires_at TEXT NOT NULL,
       signature TEXT UNIQUE,
       payer TEXT,
       paid_at TEXT,
       charge_id TEXT,
       funded_by_grant TEXT
     )`,
  ).run();
  db.prepare(
    `CREATE TABLE IF NOT EXISTS ai_inference_charges (
       id TEXT PRIMARY KEY,
       intent_id TEXT NOT NULL UNIQUE,
       session_id TEXT NOT NULL,
       status TEXT NOT NULL,
       model TEXT,
       input_tokens INTEGER,
       output_tokens INTEGER,
       cost_usd REAL,
       reply TEXT,
       error TEXT,
       started_at TEXT NOT NULL,
       finished_at TEXT
     )`,
  ).run();
  db.prepare(
    `CREATE TABLE IF NOT EXISTS ai_credit_grants (
       id TEXT PRIMARY KEY,
       session_id TEXT NOT NULL,
       intent_id TEXT NOT NULL UNIQUE,
       amount_base_units INTEGER NOT NULL,
       reason TEXT NOT NULL,
       status TEXT NOT NULL,
       created_at TEXT NOT NULL,
       used_at TEXT
     )`,
  ).run();
  migrateIntentColumns();
  ensured = true;
}

/**
 * Additive migration for databases created before the native rollup path. The
 * columns are nullable, so an existing local database keeps working unchanged.
 */
function migrateIntentColumns(): void {
  const db = getDb();
  const existing = new Set(
    (db.prepare("PRAGMA table_info(ai_payment_intents)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  const additions: Array<[string, string]> = [
    ["settlement", "TEXT NOT NULL DEFAULT 'base'"],
    ["deposit_signature", "TEXT"],
    ["validator", "TEXT"],
    ["er_endpoint", "TEXT"],
    ["payer_balance_before", "INTEGER"],
    ["payer_balance_after", "INTEGER"],
    ["receiver_balance_before", "INTEGER"],
    ["receiver_balance_after", "INTEGER"],
  ];
  for (const [name, type] of additions) {
    if (existing.has(name)) continue;
    db.prepare(`ALTER TABLE ai_payment_intents ADD COLUMN ${name} ${type}`).run();
  }
}

interface IntentRow {
  id: string;
  session_id: string;
  campaign_id: string;
  reference: string;
  mint: string;
  receiver: string;
  receiver_ata: string;
  amount_base_units: number;
  request_hash: string;
  question: string;
  status: IntentStatus;
  created_at: string;
  expires_at: string;
  signature: string | null;
  payer: string | null;
  paid_at: string | null;
  charge_id: string | null;
  funded_by_grant: string | null;
  settlement: "er" | "base" | null;
  deposit_signature: string | null;
  validator: string | null;
  er_endpoint: string | null;
  payer_balance_before: number | null;
  payer_balance_after: number | null;
  receiver_balance_before: number | null;
  receiver_balance_after: number | null;
}

function toIntent(row: IntentRow): AiIntent {
  return {
    id: row.id,
    sessionId: row.session_id,
    campaignId: row.campaign_id,
    reference: row.reference,
    mint: row.mint,
    receiver: row.receiver,
    receiverAta: row.receiver_ata,
    amountBaseUnits: row.amount_base_units,
    requestHash: row.request_hash,
    question: row.question,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    signature: row.signature,
    payer: row.payer,
    paidAt: row.paid_at,
    chargeId: row.charge_id,
    fundedByGrant: row.funded_by_grant,
    settlement: row.settlement === "er" ? "er" : "base",
    depositSignature: row.deposit_signature ?? null,
    validator: row.validator ?? null,
    erEndpoint: row.er_endpoint ?? null,
    payerBalanceBefore: row.payer_balance_before ?? null,
    payerBalanceAfter: row.payer_balance_after ?? null,
    receiverBalanceBefore: row.receiver_balance_before ?? null,
    receiverBalanceAfter: row.receiver_balance_after ?? null,
  };
}

export function createIntent(input: {
  sessionId: string;
  campaignId: string;
  reference: string;
  mint: string;
  receiver: string;
  receiverAta: string;
  amountBaseUnits: number;
  requestHash: string;
  question: string;
  ttlMs: number;
  now?: Date;
  status?: "quoted" | "paid";
  fundedByGrant?: string | null;
  settlement?: "er" | "base";
  validator?: string | null;
  erEndpoint?: string | null;
}): AiIntent {
  ensureTables();
  const now = input.now ?? new Date();
  const id = `aipi_${randomUUID()}`;
  getDb()
    .prepare(
      `INSERT INTO ai_payment_intents
         (id, session_id, campaign_id, reference, mint, receiver, receiver_ata, amount_base_units,
          request_hash, question, status, created_at, expires_at, signature, payer, paid_at, charge_id,
          funded_by_grant, settlement, validator, er_endpoint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.sessionId,
      input.campaignId,
      input.reference,
      input.mint,
      input.receiver,
      input.receiverAta,
      input.amountBaseUnits,
      input.requestHash,
      input.question,
      input.status ?? "quoted",
      now.toISOString(),
      new Date(now.getTime() + input.ttlMs).toISOString(),
      input.status === "paid" ? now.toISOString() : null,
      input.fundedByGrant ?? null,
      input.settlement ?? "base",
      input.validator ?? null,
      input.erEndpoint ?? null,
    );
  const created = getIntent(id);
  if (!created) throw new Error("The AI payment intent was not stored.");
  return created;
}

export function getIntent(id: string): AiIntent | null {
  ensureTables();
  const row = getDb().prepare("SELECT * FROM ai_payment_intents WHERE id = ?").get(id) as
    | IntentRow
    | undefined;
  return row ? toIntent(row) : null;
}

export function listIntents(sessionId: string, limit = 10): AiIntent[] {
  ensureTables();
  const rows = getDb()
    .prepare(
      `SELECT * FROM ai_payment_intents WHERE session_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(sessionId, limit) as unknown as IntentRow[];
  return rows.map(toIntent);
}

export function countPendingIntents(sessionId: string, now: Date = new Date()): number {
  ensureTables();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM ai_payment_intents
       WHERE session_id = ? AND status = 'quoted' AND expires_at > ?`,
    )
    .get(sessionId, now.toISOString()) as { count: number };
  return row.count;
}

export function countChargesToday(sessionId: string, now: Date = new Date()): number {
  ensureTables();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM ai_inference_charges
       WHERE session_id = ? AND started_at >= ?`,
    )
    .get(sessionId, utcDayStart(now)) as { count: number };
  return row.count;
}

export function sumCostToday(now: Date = new Date()): number {
  ensureTables();
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_inference_charges
       WHERE cost_usd IS NOT NULL AND started_at >= ?`,
    )
    .get(utcDayStart(now)) as { total: number };
  return row.total;
}

function utcDayStart(now: Date): string {
  return `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export type ClaimResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; code: "not_found" | "already_paid" | "expired" | "signature_replayed"; reason: string };

/** Bind one verified chain signature to one intent, exactly once. */
export interface ErClaimEvidence {
  depositSignature: string | null;
  validator: string | null;
  erEndpoint: string | null;
  payerBalanceBefore: number | null;
  payerBalanceAfter: number | null;
  receiverBalanceBefore: number | null;
  receiverBalanceAfter: number | null;
}

export function claimPayment(
  intentId: string,
  signature: string,
  payer: string,
  now: Date = new Date(),
  er?: ErClaimEvidence,
): ClaimResult {
  ensureTables();
  const db = getDb();
  const existing = db
    .prepare("SELECT id, status FROM ai_payment_intents WHERE id = ?")
    .get(intentId) as { id: string; status: IntentStatus } | undefined;
  if (!existing) return { ok: false, code: "not_found", reason: "That request does not exist." };
  if (existing.status === "paid" || existing.status === "consumed") {
    return { ok: false, code: "already_paid", reason: "That request has already been paid." };
  }
  const replay = db
    .prepare("SELECT id FROM ai_payment_intents WHERE signature = ? AND id <> ?")
    .get(signature, intentId) as { id: string } | undefined;
  if (replay) {
    return {
      ok: false,
      code: "signature_replayed",
      reason: "That transaction has already paid for another request.",
    };
  }
  const result = er
    ? db
        .prepare(
          `UPDATE ai_payment_intents
           SET status = 'paid', signature = ?, payer = ?, paid_at = ?, settlement = 'er',
               deposit_signature = ?, validator = ?, er_endpoint = ?,
               payer_balance_before = ?, payer_balance_after = ?,
               receiver_balance_before = ?, receiver_balance_after = ?
           WHERE id = ? AND status = 'quoted' AND expires_at > ?`,
        )
        .run(
          signature,
          payer,
          now.toISOString(),
          er.depositSignature,
          er.validator,
          er.erEndpoint,
          er.payerBalanceBefore,
          er.payerBalanceAfter,
          er.receiverBalanceBefore,
          er.receiverBalanceAfter,
          intentId,
          now.toISOString(),
        )
    : db
        .prepare(
          `UPDATE ai_payment_intents
           SET status = 'paid', signature = ?, payer = ?, paid_at = ?
           WHERE id = ? AND status = 'quoted' AND expires_at > ?`,
        )
        .run(signature, payer, now.toISOString(), intentId, now.toISOString());
  if (result.changes !== 1) {
    return {
      ok: false,
      code: "expired",
      reason: "That request expired before the payment was confirmed. Ask for a new quote.",
    };
  }
  const intent = getIntent(intentId);
  if (!intent) return { ok: false, code: "not_found", reason: "That request does not exist." };
  return { ok: true, intent };
}

/**
 * Persist the rollup transaction a native payment produced, before it is allowed
 * to count as paid. Settlement re-reads that exact signature from the rollup, so
 * a client can never supply its own "successful" signature.
 */
export function recordNativeSubmission(
  intentId: string,
  input: {
    signature: string;
    depositSignature: string | null;
    payer: string;
    validator: string;
    erEndpoint: string;
    payerBalanceBefore: number | null;
    payerBalanceAfter: number | null;
    receiverBalanceBefore: number | null;
    receiverBalanceAfter: number | null;
  },
): boolean {
  ensureTables();
  try {
    const result = getDb()
      .prepare(
      `UPDATE ai_payment_intents
       SET signature = ?, payer = ?, settlement = 'er', deposit_signature = ?, validator = ?,
           er_endpoint = ?, payer_balance_before = ?, payer_balance_after = ?,
           receiver_balance_before = ?, receiver_balance_after = ?
       WHERE id = ? AND status = 'quoted' AND (signature IS NULL OR signature = ?)`,
    )
    .run(
      input.signature,
      input.payer,
      input.depositSignature,
      input.validator,
      input.erEndpoint,
      input.payerBalanceBefore,
      input.payerBalanceAfter,
      input.receiverBalanceBefore,
      input.receiverBalanceAfter,
        intentId,
        input.signature,
      );
    return result.changes === 1;
  } catch {
    // A signature is UNIQUE: two quotes can never share one rollup payment.
    return false;
  }
}

export type ChargeStart =
  | { ok: true; charge: AiCharge }
  | { ok: false; code: "not_paid" | "duplicate" | "not_found"; reason: string };

/**
 * Move `paid → consumed` and open the single charge for this intent. A second
 * call returns the existing charge instead of starting another inference.
 */
export function beginCharge(intentId: string, sessionId: string, now: Date = new Date()): ChargeStart {
  ensureTables();
  const db = getDb();
  const intent = getIntent(intentId);
  if (!intent) return { ok: false, code: "not_found", reason: "That request does not exist." };

  const existing = getCharge(intentId);
  if (existing) {
    return { ok: false, code: "duplicate", reason: "This request already has an inference charge." };
  }

  const claimed = db
    .prepare(
      `UPDATE ai_payment_intents SET status = 'consumed', charge_id = ?
       WHERE id = ? AND status = 'paid'`,
    )
    .run("pending", intentId);
  if (claimed.changes !== 1) {
    const current = getIntent(intentId)?.status ?? "unknown";
    return {
      ok: false,
      code: "not_paid",
      reason:
        current === "consumed"
          ? "This request has already been used."
          : "That request is not paid yet.",
    };
  }

  const id = `aich_${randomUUID()}`;
  db.prepare(
    `INSERT INTO ai_inference_charges (id, intent_id, session_id, status, started_at)
     VALUES (?, ?, ?, 'running', ?)`,
  ).run(id, intentId, sessionId, now.toISOString());
  db.prepare("UPDATE ai_payment_intents SET charge_id = ? WHERE id = ?").run(id, intentId);
  const charge = getCharge(intentId);
  if (!charge) throw new Error("The inference charge was not stored.");
  return { ok: true, charge };
}

export function getCharge(intentId: string): AiCharge | null {
  ensureTables();
  const row = getDb()
    .prepare("SELECT * FROM ai_inference_charges WHERE intent_id = ?")
    .get(intentId) as
    | {
        id: string;
        intent_id: string;
        session_id: string;
        status: "running" | "ok" | "failed";
        model: string | null;
        input_tokens: number | null;
        output_tokens: number | null;
        cost_usd: number | null;
        reply: string | null;
        error: string | null;
        started_at: string;
        finished_at: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    intentId: row.intent_id,
    sessionId: row.session_id,
    status: row.status,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
    reply: row.reply,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function finishCharge(
  chargeId: string,
  patch: {
    status: "ok" | "failed";
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    costUsd?: number | null;
    reply?: string | null;
    error?: string | null;
    now?: Date;
  },
): void {
  ensureTables();
  const at = (patch.now ?? new Date()).toISOString();
  getDb()
    .prepare(
      `UPDATE ai_inference_charges
       SET status = ?, model = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?,
           reply = ?, error = ?, finished_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.status,
      patch.model ?? null,
      patch.inputTokens ?? null,
      patch.outputTokens ?? null,
      patch.costUsd ?? null,
      patch.reply ?? null,
      patch.error ?? null,
      at,
      chargeId,
    );
}

/**
 * After a paid inference fails, the same player gets one replacement request at
 * no cost. This restores the purchased service; it is not a chain refund.
 */
export function oweRefund(intentId: string, amountBaseUnits: number, reason: string, now = new Date()): void {
  ensureTables();
  const db = getDb();
  const intent = getIntent(intentId);
  if (!intent) return;
  db.prepare("UPDATE ai_payment_intents SET status = 'refund_owed' WHERE id = ? AND status = 'consumed'").run(
    intentId,
  );
  db.prepare(
    `INSERT OR IGNORE INTO ai_credit_grants
       (id, session_id, intent_id, amount_base_units, reason, status, created_at, used_at)
     VALUES (?, ?, ?, ?, ?, 'unused', ?, NULL)`,
  ).run(`aigr_${randomUUID()}`, intent.sessionId, intentId, amountBaseUnits, reason.slice(0, 300), now.toISOString());
}

/** Claim one unused refund credit of at least `amountBaseUnits`, if any. */
export function takeGrant(
  sessionId: string,
  amountBaseUnits: number,
  now: Date = new Date(),
): { id: string } | null {
  ensureTables();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM ai_credit_grants
       WHERE session_id = ? AND status = 'unused' AND amount_base_units >= ?
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get(sessionId, amountBaseUnits) as { id: string } | undefined;
  if (!row) return null;
  const used = db
    .prepare("UPDATE ai_credit_grants SET status = 'used', used_at = ? WHERE id = ? AND status = 'unused'")
    .run(now.toISOString(), row.id);
  return used.changes === 1 ? { id: row.id } : null;
}

export function countUnusedGrants(sessionId: string): number {
  ensureTables();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM ai_credit_grants WHERE session_id = ? AND status = 'unused'")
    .get(sessionId) as { count: number };
  return row.count;
}
