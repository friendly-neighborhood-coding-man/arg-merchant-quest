import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db";
import type { Campaign } from "./types";

/**
 * P1 product-clue claims.
 *
 * The optional mystery no longer ends in a coupon for product-clue campaigns.
 * After the pre-order deduction, the player requests the merchant's signature
 * product and receives an order reference. A staff member confirms the
 * fictional handoff, which unlocks the final clue for that player. Nothing here
 * processes a payment, and no real purchase is claimed.
 */

export type ClaimStatus = "requested" | "handed_off";

export interface ProductClaim {
  id: string;
  reference: string;
  completionId: string;
  sessionId: string;
  campaignId: string;
  playerId: string;
  productName: string;
  priceLabel: string;
  status: ClaimStatus;
  requestedAt: string;
  handedOffAt: string | null;
  handedOffBy: string | null;
  handoffNote: string | null;
  chainStatus: string | null;
  chainCounterAccount: string | null;
  chainProgramId: string | null;
  chainCreateSignature: string | null;
  chainDelegateSignature: string | null;
  chainIncrementSignature: string | null;
  chainCommitSignature: string | null;
  chainCounterValue: number | null;
  chainCommittedValue: number | null;
  chainErEndpoint: string | null;
  chainUpdatedAt: string | null;
  chainError: string | null;
  createdAt: string;
}

interface ClaimRow {
  id: string;
  reference: string;
  completion_id: string;
  session_id: string;
  campaign_id: string;
  player_id: string;
  product_name: string;
  price_label: string;
  status: ClaimStatus;
  requested_at: string;
  handed_off_at: string | null;
  handed_off_by: string | null;
  handoff_note: string | null;
  chain_status: string | null;
  chain_counter_account: string | null;
  chain_program_id: string | null;
  chain_create_signature: string | null;
  chain_delegate_signature: string | null;
  chain_increment_signature: string | null;
  chain_commit_signature: string | null;
  chain_counter_value: number | null;
  chain_committed_value: number | null;
  chain_er_endpoint: string | null;
  chain_updated_at: string | null;
  chain_error: string | null;
  created_at: string;
}

function toClaim(row: ClaimRow): ProductClaim {
  return {
    id: row.id,
    reference: row.reference,
    completionId: row.completion_id,
    sessionId: row.session_id,
    campaignId: row.campaign_id,
    playerId: row.player_id,
    productName: row.product_name,
    priceLabel: row.price_label,
    status: row.status,
    requestedAt: row.requested_at,
    handedOffAt: row.handed_off_at,
    handedOffBy: row.handed_off_by,
    handoffNote: row.handoff_note,
    chainStatus: row.chain_status,
    chainCounterAccount: row.chain_counter_account,
    chainProgramId: row.chain_program_id,
    chainCreateSignature: row.chain_create_signature,
    chainDelegateSignature: row.chain_delegate_signature,
    chainIncrementSignature: row.chain_increment_signature,
    chainCommitSignature: row.chain_commit_signature,
    chainCounterValue: row.chain_counter_value,
    chainCommittedValue: row.chain_committed_value,
    chainErEndpoint: row.chain_er_endpoint,
    chainUpdatedAt: row.chain_updated_at,
    chainError: row.chain_error,
    createdAt: row.created_at,
  };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function group(length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return value;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "at", "in"]);

function prefixFor(title: string): string {
  const word = title
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .find((part) => !STOPWORDS.has(part.toLowerCase()));
  const cleaned = (word ?? "CLUE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return cleaned.length >= 3 ? cleaned : "CLUE";
}

function uniqueReference(title: string): string {
  const db = getDb();
  const prefix = prefixFor(title);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const reference = `${prefix}-CLUE-${group(4)}`;
    if (!db.prepare("SELECT 1 AS found FROM product_claims WHERE reference = ?").get(reference)) {
      return reference;
    }
  }
  throw new Error("Could not generate a unique product-claim reference.");
}

export function normaliseReference(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function getClaimByReference(input: string): ProductClaim | null {
  const reference = normaliseReference(input);
  if (!reference) return null;
  const row = getDb()
    .prepare("SELECT * FROM product_claims WHERE reference = ?")
    .get(reference) as unknown as ClaimRow | undefined;
  return row ? toClaim(row) : null;
}

export function getClaimBySession(sessionId: string): ProductClaim | null {
  const row = getDb()
    .prepare("SELECT * FROM product_claims WHERE session_id = ?")
    .get(sessionId) as unknown as ClaimRow | undefined;
  return row ? toClaim(row) : null;
}

export function getClaimByCompletion(completionId: string): ProductClaim | null {
  const row = getDb()
    .prepare("SELECT * FROM product_claims WHERE completion_id = ?")
    .get(completionId) as unknown as ClaimRow | undefined;
  return row ? toClaim(row) : null;
}

/**
 * Request the signature product. Idempotent: the same completion always gets
 * the one claim it already has.
 */
export function requestProductClaim(
  sessionId: string,
  campaign: Campaign,
): { ok: true; claim: ProductClaim } | { ok: false; status: number; error: string } {
  if (campaign.optionalMode !== "product_clue") {
    return { ok: false, status: 409, error: "This trail does not have a product-clue mystery." };
  }
  const db = getDb();
  const completion = db
    .prepare(
      "SELECT id, extended_solved, final_solved_at FROM quest_completions WHERE session_id = ?",
    )
    .get(sessionId) as unknown as
    | { id: string; extended_solved: number; final_solved_at: string | null }
    | undefined;
  if (!completion) {
    return {
      ok: false,
      status: 409,
      error: "Finish the free trail and have your evidence verified first.",
    };
  }
  if (completion.extended_solved !== 1) {
    return {
      ok: false,
      status: 409,
      error: "Solve the pre-order deduction before requesting the product clue.",
    };
  }

  const existing = getClaimByCompletion(completion.id);
  if (existing) return { ok: true, claim: existing };

  const now = new Date().toISOString();
  const id = `pcl_${randomUUID()}`;
  const reference = uniqueReference(campaign.title);
  transaction(db, () => {
    db.prepare(
      `INSERT INTO product_claims (
         id, reference, completion_id, session_id, campaign_id, player_id,
         product_name, price_label, status, requested_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
    ).run(
      id,
      reference,
      completion.id,
      sessionId,
      campaign.id,
      (db.prepare("SELECT player_id FROM quest_sessions WHERE id = ?").get(sessionId) as {
        player_id: string;
      }).player_id,
      campaign.productName,
      campaign.productPriceLabel,
      now,
      now,
    );
  });

  const claim = getClaimByCompletion(completion.id);
  if (!claim) return { ok: false, status: 500, error: "The product claim could not be stored." };
  return { ok: true, claim };
}

export interface HandoffInput {
  reference: string;
  staffName: string;
  /** The staff member confirms the fictional serving condition for the demo. */
  handoffConfirmed: boolean;
  note?: string;
}

export type HandoffResult =
  | { ok: true; claim: ProductClaim }
  | { ok: false; status: number; error: string };

/**
 * Confirm the one-time clue handoff. A conditional UPDATE makes a second
 * handoff of the same reference fail even under concurrent requests.
 */
export function handoffProductClaim(input: HandoffInput): HandoffResult {
  const reference = normaliseReference(input.reference);
  if (!reference) return { ok: false, status: 400, error: "Enter the player's order reference." };
  const staffName = input.staffName.trim().slice(0, 80);
  if (staffName.length < 2) {
    return {
      ok: false,
      status: 400,
      error: "Record who handed over the product clue (at least 2 characters).",
    };
  }
  if (!input.handoffConfirmed) {
    return {
      ok: false,
      status: 400,
      error:
        "Confirm that the fictional signature-product order or serving condition has been met. Nothing is charged here — this is a staff confirmation for the demonstration.",
    };
  }

  const claim = getClaimByReference(reference);
  if (!claim) {
    return {
      ok: false,
      status: 404,
      error: "No demo product claim matches that reference. Check it with the player.",
    };
  }
  if (claim.status === "handed_off") {
    return {
      ok: false,
      status: 409,
      error: `This clue was already handed over${claim.handedOffAt ? ` on ${new Date(claim.handedOffAt).toISOString()}` : ""}${claim.handedOffBy ? ` by ${claim.handedOffBy}` : ""}. The final clue can only be released once.`,
    };
  }

  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `UPDATE product_claims
       SET status = 'handed_off', handed_off_at = ?, handed_off_by = ?, handoff_note = ?
       WHERE id = ? AND status = 'requested'`,
    )
    .run(now, staffName, input.note?.trim().slice(0, 200) || null, claim.id);
  if (Number(result.changes) !== 1) {
    return {
      ok: false,
      status: 409,
      error: "This clue was released a moment ago and cannot be handed over twice.",
    };
  }
  const updated = getClaimByReference(reference);
  if (!updated) return { ok: false, status: 500, error: "The handoff could not be recorded." };
  return { ok: true, claim: updated };
}

export interface ClaimChainInput {
  status: "committed" | "failed";
  counterAccount: string;
  programId: string;
  createSignature: string | null;
  delegateSignature: string | null;
  incrementSignature: string | null;
  commitSignature: string | null;
  counterValue: number | null;
  committedValue: number | null;
  erEndpoint: string;
  error: string | null;
}

/** Store the real ER milestone evidence for the clue handoff. */
export function saveClaimChainEvidence(claimId: string, evidence: ClaimChainInput): void {
  getDb()
    .prepare(
      `UPDATE product_claims
       SET chain_status = ?, chain_counter_account = ?, chain_program_id = ?,
           chain_create_signature = ?, chain_delegate_signature = ?,
           chain_increment_signature = ?, chain_commit_signature = ?,
           chain_counter_value = ?, chain_committed_value = ?,
           chain_er_endpoint = ?, chain_updated_at = ?, chain_error = ?
       WHERE id = ?`,
    )
    .run(
      evidence.status,
      evidence.counterAccount,
      evidence.programId,
      evidence.createSignature,
      evidence.delegateSignature,
      evidence.incrementSignature,
      evidence.commitSignature,
      evidence.counterValue,
      evidence.committedValue,
      evidence.erEndpoint,
      new Date().toISOString(),
      evidence.error,
      claimId,
    );
}

export interface ClaimStats {
  total: number;
  handedOff: number;
  awaitingHandoff: number;
}

export function claimStats(): ClaimStats {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) AS count FROM product_claims").get() as {
    count: number;
  };
  const handedOff = db
    .prepare("SELECT COUNT(*) AS count FROM product_claims WHERE status = 'handed_off'")
    .get() as { count: number };
  return {
    total: total.count,
    handedOff: handedOff.count,
    awaitingHandoff: total.count - handedOff.count,
  };
}

export interface RecentClaimRow {
  reference: string;
  productName: string;
  shopName: string;
  status: ClaimStatus;
  requestedAt: string;
  handedOffAt: string | null;
  handedOffBy: string | null;
}

export function listRecentClaims(limit = 8): RecentClaimRow[] {
  const rows = getDb()
    .prepare(
      `SELECT pc.reference, pc.product_name, c.shop_name, pc.status, pc.requested_at,
              pc.handed_off_at, pc.handed_off_by
       FROM product_claims pc
       JOIN campaigns c ON c.id = pc.campaign_id
       ORDER BY pc.requested_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as Array<{
    reference: string;
    product_name: string;
    shop_name: string;
    status: ClaimStatus;
    requested_at: string;
    handed_off_at: string | null;
    handed_off_by: string | null;
  }>;
  return rows.map((row) => ({
    reference: row.reference,
    productName: row.product_name,
    shopName: row.shop_name,
    status: row.status,
    requestedAt: row.requested_at,
    handedOffAt: row.handed_off_at,
    handedOffBy: row.handed_off_by,
  }));
}
