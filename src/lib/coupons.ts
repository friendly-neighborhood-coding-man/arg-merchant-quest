import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db";
import { getCampaignById, getMerchantById } from "./store";

/**
 * P0.4 demo coupons.
 *
 * A coupon is a fictional entitlement issued to one verified completion that
 * also solved the optional extended mystery. It is not a token, has no cash
 * value, and cannot be used at a real business. The conditions come from the
 * merchant's own campaign terms at issue time.
 *
 * One completion can produce at most one coupon: `completion_id` is UNIQUE and
 * redemption is a single conditional UPDATE, so a second redemption cannot
 * silently succeed.
 */

export type CouponStatus = "issued" | "redeemed" | "expired";

export interface Coupon {
  id: string;
  code: string;
  completionId: string;
  sessionId: string;
  campaignId: string;
  merchantId: string;
  playerId: string;
  merchantName: string;
  shopName: string;
  shopArea: string;
  shopAddress: string;
  couponItem: string;
  couponMinSpend: number;
  couponValidDays: number;
  couponNotes: string;
  issuedAt: string;
  expiresAt: string;
  /** Stored lifecycle. "expired" is derived from `expiresAt` on read. */
  status: "issued" | "redeemed";
  redeemedAt: string | null;
  redeemedBy: string | null;
  redemptionNote: string | null;
  createdAt: string;
}

export interface CouponView extends Coupon {
  displayStatus: CouponStatus;
  isExpired: boolean;
  isRedeemed: boolean;
}

interface CouponRow {
  id: string;
  code: string;
  completion_id: string;
  session_id: string;
  campaign_id: string;
  merchant_id: string;
  player_id: string;
  merchant_name: string;
  shop_name: string;
  shop_area: string;
  shop_address: string;
  coupon_item: string;
  coupon_min_spend: number;
  coupon_valid_days: number;
  coupon_notes: string;
  issued_at: string;
  expires_at: string;
  status: "issued" | "redeemed";
  redeemed_at: string | null;
  redeemed_by: string | null;
  redemption_note: string | null;
  created_at: string;
}

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    completionId: row.completion_id,
    sessionId: row.session_id,
    campaignId: row.campaign_id,
    merchantId: row.merchant_id,
    playerId: row.player_id,
    merchantName: row.merchant_name,
    shopName: row.shop_name,
    shopArea: row.shop_area,
    shopAddress: row.shop_address,
    couponItem: row.coupon_item,
    couponMinSpend: row.coupon_min_spend,
    couponValidDays: row.coupon_valid_days,
    couponNotes: row.coupon_notes,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    status: row.status,
    redeemedAt: row.redeemed_at,
    redeemedBy: row.redeemed_by,
    redemptionNote: row.redemption_note,
    createdAt: row.created_at,
  };
}

export function couponView(coupon: Coupon): CouponView {
  const expired =
    coupon.status === "issued" && new Date(coupon.expiresAt).getTime() <= Date.now();
  return {
    ...coupon,
    displayStatus: coupon.status === "redeemed" ? "redeemed" : expired ? "expired" : "issued",
    isExpired: expired,
    isRedeemed: coupon.status === "redeemed",
  };
}

/** Normalise what a staff member types: case, spaces and the dashes we print. */
export function normaliseCouponCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function codeGroup(length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return value;
}

const CODE_STOPWORDS = new Set(["the", "a", "an", "of", "and", "at", "in"]);

function codePrefix(title: string): string {
  const word = title
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .find((part) => !CODE_STOPWORDS.has(part.toLowerCase()));
  const cleaned = (word ?? "ARG").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return cleaned.length >= 3 ? cleaned : "ARG";
}

function uniqueCouponCode(title: string): string {
  const db = getDb();
  const prefix = codePrefix(title);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `${prefix}-${codeGroup(4)}-${codeGroup(4)}`;
    const existing = db.prepare("SELECT 1 AS found FROM coupons WHERE code = ?").get(code);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique demo coupon code.");
}

export function getCouponByCompletionId(completionId: string): Coupon | null {
  const row = getDb()
    .prepare("SELECT * FROM coupons WHERE completion_id = ?")
    .get(completionId) as unknown as CouponRow | undefined;
  return row ? toCoupon(row) : null;
}

export function getCouponBySessionId(sessionId: string): Coupon | null {
  const row = getDb()
    .prepare("SELECT * FROM coupons WHERE session_id = ?")
    .get(sessionId) as unknown as CouponRow | undefined;
  return row ? toCoupon(row) : null;
}

export function getCouponByCode(codeInput: string): Coupon | null {
  const code = normaliseCouponCode(codeInput);
  if (!code) return null;
  const row = getDb()
    .prepare("SELECT * FROM coupons WHERE code = ?")
    .get(code) as unknown as CouponRow | undefined;
  return row ? toCoupon(row) : null;
}

/**
 * Issue (or return) the coupon for one completion. Returns null when the
 * completion does not exist or has not solved the optional extended mystery —
 * the basic verifiable reward and the coupon are separate features.
 */
export function issueCouponForCompletion(sessionId: string): Coupon | null {
  const db = getDb();
  const completion = db
    .prepare(
      "SELECT id, session_id, campaign_id, player_id, extended_solved FROM quest_completions WHERE session_id = ?",
    )
    .get(sessionId) as unknown as
    | {
        id: string;
        session_id: string;
        campaign_id: string;
        player_id: string;
        extended_solved: number;
      }
    | undefined;

  if (!completion || completion.extended_solved !== 1) return null;

  const existing = getCouponByCompletionId(completion.id);
  if (existing) return existing;

  const campaign = getCampaignById(completion.campaign_id);
  if (!campaign) return null;
  const merchant = getMerchantById(campaign.merchantId);

  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + Math.max(1, campaign.couponValidDays) * 24 * 60 * 60 * 1000,
  );
  const id = `cpn_${randomUUID()}`;
  const code = uniqueCouponCode(campaign.title);

  transaction(db, () => {
    db.prepare(
      `INSERT INTO coupons (
         id, code, completion_id, session_id, campaign_id, merchant_id, player_id,
         merchant_name, shop_name, shop_area, shop_address,
         coupon_item, coupon_min_spend, coupon_valid_days, coupon_notes,
         issued_at, expires_at, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`,
    ).run(
      id,
      code,
      completion.id,
      completion.session_id,
      campaign.id,
      campaign.merchantId,
      completion.player_id,
      merchant?.name ?? campaign.merchantName,
      campaign.shopName,
      campaign.shopArea,
      campaign.shopAddress,
      campaign.couponItem,
      campaign.couponMinSpend,
      campaign.couponValidDays,
      campaign.couponNotes,
      issuedAt.toISOString(),
      expiresAt.toISOString(),
      issuedAt.toISOString(),
    );
  });

  // A concurrent request may have won the UNIQUE(completion_id) race; either
  // way the caller gets the single coupon that exists.
  return getCouponByCompletionId(completion.id);
}

/** Used by the quest view so an older completion still shows its coupon. */
export function ensureCouponForSession(sessionId: string): Coupon | null {
  return issueCouponForCompletion(sessionId);
}

export function listPlayerCoupons(playerId: string): CouponView[] {
  const rows = getDb()
    .prepare("SELECT * FROM coupons WHERE player_id = ? ORDER BY issued_at DESC")
    .all(playerId) as unknown as CouponRow[];
  return rows.map((row) => couponView(toCoupon(row)));
}

export interface RedemptionInput {
  code: string;
  staffName: string;
  /** The staff member confirms the fictional purchase condition for this demo. */
  purchaseConfirmed: boolean;
  note?: string;
}

export type RedemptionResult =
  | { ok: true; coupon: CouponView }
  | { ok: false; status: number; error: string };

export function redeemCoupon(input: RedemptionInput): RedemptionResult {
  const code = normaliseCouponCode(input.code);
  if (!code) return { ok: false, status: 400, error: "Enter the coupon code first." };

  const staffName = input.staffName.trim().slice(0, 80);
  if (staffName.length < 2) {
    return {
      ok: false,
      status: 400,
      error: "Record who is redeeming the coupon (at least 2 characters).",
    };
  }
  if (!input.purchaseConfirmed) {
    return {
      ok: false,
      status: 400,
      error:
        "Confirm that the demo purchase condition has been met. Nothing is charged here — this is a staff confirmation for the demonstration.",
    };
  }

  const coupon = getCouponByCode(code);
  if (!coupon) {
    return {
      ok: false,
      status: 404,
      error: "No demo coupon matches that code. Check the code with the player and try again.",
    };
  }
  if (coupon.status === "redeemed") {
    return {
      ok: false,
      status: 409,
      error: `This coupon was already redeemed${coupon.redeemedAt ? ` on ${new Date(coupon.redeemedAt).toLocaleString("en-GB")}` : ""}${coupon.redeemedBy ? ` by ${coupon.redeemedBy}` : ""}. A demo coupon can only be used once.`,
    };
  }
  const view = couponView(coupon);
  if (view.isExpired) {
    return {
      ok: false,
      status: 410,
      error: `This coupon expired on ${new Date(coupon.expiresAt).toLocaleString("en-GB")}. It can no longer be redeemed.`,
    };
  }

  const now = new Date().toISOString();
  // Single-use state change at the database level: only an issued, unexpired
  // coupon at this exact id can move to redeemed, exactly once.
  const result = getDb()
    .prepare(
      `UPDATE coupons
       SET status = 'redeemed', redeemed_at = ?, redeemed_by = ?, redemption_note = ?
       WHERE id = ? AND status = 'issued' AND expires_at > ?`,
    )
    .run(now, staffName, input.note?.trim().slice(0, 200) || null, coupon.id, now);

  if (Number(result.changes) !== 1) {
    const current = getCouponByCode(code);
    if (current?.status === "redeemed") {
      return {
        ok: false,
        status: 409,
        error: "This coupon was redeemed a moment ago and cannot be used twice.",
      };
    }
    return {
      ok: false,
      status: 409,
      error: "This coupon can no longer be redeemed. Check its status and expiry.",
    };
  }

  const updated = getCouponByCode(code);
  if (!updated) return { ok: false, status: 500, error: "The redemption could not be recorded." };
  return { ok: true, coupon: couponView(updated) };
}

export interface CouponStats {
  total: number;
  issued: number;
  redeemed: number;
  expired: number;
}

export function couponStats(): CouponStats {
  const db = getDb();
  const now = new Date().toISOString();
  const total = db.prepare("SELECT COUNT(*) AS count FROM coupons").get() as { count: number };
  const redeemed = db
    .prepare("SELECT COUNT(*) AS count FROM coupons WHERE status = 'redeemed'")
    .get() as { count: number };
  const expired = db
    .prepare(
      "SELECT COUNT(*) AS count FROM coupons WHERE status = 'issued' AND expires_at <= ?",
    )
    .get(now) as { count: number };
  return {
    total: total.count,
    redeemed: redeemed.count,
    expired: expired.count,
    issued: total.count - redeemed.count - expired.count,
  };
}

export interface RedemptionRow {
  code: string;
  couponItem: string;
  shopName: string;
  redeemedAt: string;
  redeemedBy: string;
}

export function listRecentRedemptions(limit = 8): RedemptionRow[] {
  const rows = getDb()
    .prepare(
      `SELECT code, coupon_item, shop_name, redeemed_at, redeemed_by
       FROM coupons WHERE status = 'redeemed' ORDER BY redeemed_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as Array<{
    code: string;
    coupon_item: string;
    shop_name: string;
    redeemed_at: string;
    redeemed_by: string;
  }>;
  return rows.map((row) => ({
    code: row.code,
    couponItem: row.coupon_item,
    shopName: row.shop_name,
    redeemedAt: row.redeemed_at,
    redeemedBy: row.redeemed_by,
  }));
}

export interface CampaignActivity {
  campaignId: string;
  slug: string;
  title: string;
  status: string;
  verifiedCompletions: number;
  payoutsPaid: number;
  payoutsPending: number;
  payoutsFailed: number;
  extendedSolved: number;
  couponsIssued: number;
  couponsRedeemed: number;
}

export type MerchantActivityEvent =
  | {
      kind: "completion";
      at: string;
      campaignTitle: string;
      campaignSlug: string;
      rewardAmount: number;
      payoutStatus: string;
    }
  | {
      kind: "coupon_issued" | "coupon_redeemed";
      at: string;
      campaignTitle: string;
      campaignSlug: string;
      code: string;
      redeemedBy?: string | null;
    };

export interface MerchantActivity {
  campaigns: CampaignActivity[];
  totals: Omit<
    CampaignActivity,
    "campaignId" | "slug" | "title" | "status"
  >;
  recent: MerchantActivityEvent[];
}

interface ActivityRow {
  campaign_id: string;
  slug: string;
  title: string;
  status: string;
  verified_completions: number;
  payouts_paid: number;
  payouts_pending: number;
  payouts_failed: number;
  extended_solved: number;
  coupons_issued: number;
  coupons_redeemed: number;
}

export function merchantActivity(merchantId: string): MerchantActivity {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id AS campaign_id, c.slug, c.title, c.status,
              COALESCE(qc.verified, 0) AS verified_completions,
              COALESCE(qc.paid, 0) AS payouts_paid,
              COALESCE(qc.pending, 0) AS payouts_pending,
              COALESCE(qc.failed, 0) AS payouts_failed,
              COALESCE(qc.extended, 0) AS extended_solved,
              COALESCE(cp.issued, 0) AS coupons_issued,
              COALESCE(cp.redeemed, 0) AS coupons_redeemed
       FROM campaigns c
       LEFT JOIN (
         SELECT campaign_id,
                COUNT(*) AS verified,
                SUM(CASE WHEN payout_status = 'paid' THEN 1 ELSE 0 END) AS paid,
                SUM(CASE WHEN payout_status IN ('pending', 'processing') THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN payout_status = 'failed' THEN 1 ELSE 0 END) AS failed,
                SUM(extended_solved) AS extended
         FROM quest_completions GROUP BY campaign_id
       ) qc ON qc.campaign_id = c.id
       LEFT JOIN (
         SELECT campaign_id,
                COUNT(*) AS issued,
                SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed
         FROM coupons GROUP BY campaign_id
       ) cp ON cp.campaign_id = c.id
       WHERE c.merchant_id = ?
       ORDER BY c.updated_at DESC`,
    )
    .all(merchantId) as unknown as ActivityRow[];

  const campaigns: CampaignActivity[] = rows.map((row) => ({
    campaignId: row.campaign_id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    verifiedCompletions: Number(row.verified_completions),
    payoutsPaid: Number(row.payouts_paid),
    payoutsPending: Number(row.payouts_pending),
    payoutsFailed: Number(row.payouts_failed),
    extendedSolved: Number(row.extended_solved),
    couponsIssued: Number(row.coupons_issued),
    couponsRedeemed: Number(row.coupons_redeemed),
  }));

  const totals = campaigns.reduce(
    (sum, item) => ({
      verifiedCompletions: sum.verifiedCompletions + item.verifiedCompletions,
      payoutsPaid: sum.payoutsPaid + item.payoutsPaid,
      payoutsPending: sum.payoutsPending + item.payoutsPending,
      payoutsFailed: sum.payoutsFailed + item.payoutsFailed,
      extendedSolved: sum.extendedSolved + item.extendedSolved,
      couponsIssued: sum.couponsIssued + item.couponsIssued,
      couponsRedeemed: sum.couponsRedeemed + item.couponsRedeemed,
    }),
    {
      verifiedCompletions: 0,
      payoutsPaid: 0,
      payoutsPending: 0,
      payoutsFailed: 0,
      extendedSolved: 0,
      couponsIssued: 0,
      couponsRedeemed: 0,
    },
  );

  const completions = db
    .prepare(
      `SELECT qc.verified_at, qc.reward_amount, qc.payout_status, c.title, c.slug
       FROM quest_completions qc
       JOIN campaigns c ON c.id = qc.campaign_id
       WHERE c.merchant_id = ?
       ORDER BY qc.verified_at DESC LIMIT 12`,
    )
    .all(merchantId) as unknown as Array<{
    verified_at: string;
    reward_amount: number;
    payout_status: string;
    title: string;
    slug: string;
  }>;

  const coupons = db
    .prepare(
      `SELECT cp.code, cp.issued_at, cp.redeemed_at, cp.redeemed_by, c.title, c.slug
       FROM coupons cp
       JOIN campaigns c ON c.id = cp.campaign_id
       WHERE c.merchant_id = ?
       ORDER BY cp.issued_at DESC LIMIT 12`,
    )
    .all(merchantId) as unknown as Array<{
    code: string;
    issued_at: string;
    redeemed_at: string | null;
    redeemed_by: string | null;
    title: string;
    slug: string;
  }>;

  const events: MerchantActivityEvent[] = [];
  for (const row of completions) {
    events.push({
      kind: "completion",
      at: row.verified_at,
      campaignTitle: row.title,
      campaignSlug: row.slug,
      rewardAmount: row.reward_amount,
      payoutStatus: row.payout_status,
    });
  }
  for (const row of coupons) {
    events.push({
      kind: "coupon_issued",
      at: row.issued_at,
      campaignTitle: row.title,
      campaignSlug: row.slug,
      code: row.code,
    });
    if (row.redeemed_at) {
      events.push({
        kind: "coupon_redeemed",
        at: row.redeemed_at,
        campaignTitle: row.title,
        campaignSlug: row.slug,
        code: row.code,
        redeemedBy: row.redeemed_by,
      });
    }
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return { campaigns, totals, recent: events.slice(0, 12) };
}
