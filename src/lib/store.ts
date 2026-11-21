import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb, transaction } from "./db";
import type { Campaign, CampaignStatus, Clue, ClueKind, Merchant, OptionalMode } from "./types";
import type { CampaignInput } from "./validation";

interface CampaignRow {
  id: string;
  merchant_id: string;
  merchant_name: string;
  slug: string;
  title: string;
  shop_name: string;
  shop_area: string;
  shop_address: string;
  teaser: string;
  story: string;
  target_object: string;
  target_object_hint: string;
  reward_amount: number;
  coupon_item: string;
  coupon_min_spend: number;
  coupon_valid_days: number;
  coupon_notes: string;
  status: CampaignStatus;
  operator_note: string | null;
  last_rejection_note: string | null;
  last_rejection_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  answer_question: string;
  answer: string;
  hint_1: string;
  hint_2: string;
  ext_social_clue: string;
  ext_web_clue: string;
  ext_instore_clue: string;
  ext_answer: string;
  ext_hint: string;
  ext_question: string;
  chain_counter_account: string | null;
  optional_mode: OptionalMode;
  product_name: string;
  product_price_label: string;
  product_prop: string;
  product_clue: string;
  final_question: string;
  final_answer: string;
  final_hint: string;
  ending_title: string;
  ending_body: string;
  achievement_title: string;
  achievement_body: string;
}

interface ClueRow {
  id: string;
  campaign_id: string;
  kind: ClueKind;
  position: number;
  title: string;
  body: string;
  url: string | null;
}

interface MerchantRow {
  id: string;
  handle: string;
  name: string;
  contact_email: string;
  instagram: string | null;
  website: string | null;
}

const CAMPAIGN_SELECT = `
  SELECT c.*, m.name AS merchant_name
  FROM campaigns c
  JOIN merchants m ON m.id = c.merchant_id
`;

function toClue(row: ClueRow): Clue {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: row.kind,
    position: row.position,
    title: row.title,
    body: row.body,
    url: row.url,
  };
}

function toCampaign(row: CampaignRow, clues: Clue[]): Campaign {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    slug: row.slug,
    title: row.title,
    shopName: row.shop_name,
    shopArea: row.shop_area,
    shopAddress: row.shop_address,
    teaser: row.teaser,
    story: row.story,
    targetObject: row.target_object,
    targetObjectHint: row.target_object_hint,
    rewardAmount: row.reward_amount,
    couponItem: row.coupon_item,
    couponMinSpend: row.coupon_min_spend,
    couponValidDays: row.coupon_valid_days,
    couponNotes: row.coupon_notes,
    status: row.status,
    operatorNote: row.operator_note,
    lastRejectionNote: row.last_rejection_note,
    lastRejectionAt: row.last_rejection_at,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    answerQuestion: row.answer_question,
    answer: row.answer,
    hint1: row.hint_1,
    hint2: row.hint_2,
    extSocialClue: row.ext_social_clue,
    extWebClue: row.ext_web_clue,
    extInstoreClue: row.ext_instore_clue,
    extAnswer: row.ext_answer,
    extHint: row.ext_hint,
    extQuestion: row.ext_question,
    chainCounterAccount: row.chain_counter_account,
    optionalMode: row.optional_mode ?? "coupon",
    productName: row.product_name ?? "",
    productPriceLabel: row.product_price_label ?? "",
    productProp: row.product_prop ?? "",
    productClue: row.product_clue ?? "",
    finalQuestion: row.final_question ?? "",
    finalAnswer: row.final_answer ?? "",
    finalHint: row.final_hint ?? "",
    endingTitle: row.ending_title ?? "",
    endingBody: row.ending_body ?? "",
    achievementTitle: row.achievement_title ?? "",
    achievementBody: row.achievement_body ?? "",
    clues,
  };
}

function cluesForCampaigns(campaignIds: string[]): Map<string, Clue[]> {
  const map = new Map<string, Clue[]>();
  if (campaignIds.length === 0) return map;
  const db = getDb();
  const placeholders = campaignIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM clues WHERE campaign_id IN (${placeholders})
       ORDER BY kind ASC, position ASC`,
    )
    .all(...campaignIds) as unknown as ClueRow[];
  for (const row of rows) {
    const list = map.get(row.campaign_id) ?? [];
    list.push(toClue(row));
    map.set(row.campaign_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "online" ? -1 : 1;
      return a.position - b.position;
    });
  }
  return map;
}

function hydrate(rows: CampaignRow[]): Campaign[] {
  const clues = cluesForCampaigns(rows.map((row) => row.id));
  return rows.map((row) => toCampaign(row, clues.get(row.id) ?? []));
}

export function listAllCampaigns(): Campaign[] {
  const rows = getDb()
    .prepare(`${CAMPAIGN_SELECT} ORDER BY c.updated_at DESC`)
    .all() as unknown as CampaignRow[];
  return hydrate(rows);
}

export function listCampaignsByStatus(status: CampaignStatus): Campaign[] {
  const rows = getDb()
    .prepare(`${CAMPAIGN_SELECT} WHERE c.status = ? ORDER BY c.updated_at ASC`)
    .all(status) as unknown as CampaignRow[];
  return hydrate(rows);
}

export function listMerchantCampaigns(merchantId: string): Campaign[] {
  const rows = getDb()
    .prepare(`${CAMPAIGN_SELECT} WHERE c.merchant_id = ? ORDER BY c.updated_at DESC`)
    .all(merchantId) as unknown as CampaignRow[];
  return hydrate(rows);
}

export function getCampaignById(id: string): Campaign | null {
  const row = getDb().prepare(`${CAMPAIGN_SELECT} WHERE c.id = ?`).get(id) as unknown as
    | CampaignRow
    | undefined;
  if (!row) return null;
  return hydrate([row])[0] ?? null;
}

export function getCampaignBySlug(slug: string): Campaign | null {
  const row = getDb().prepare(`${CAMPAIGN_SELECT} WHERE c.slug = ?`).get(slug) as unknown as
    | CampaignRow
    | undefined;
  if (!row) return null;
  return hydrate([row])[0] ?? null;
}

export function getMerchantById(id: string): Merchant | null {
  const row = getDb().prepare("SELECT * FROM merchants WHERE id = ?").get(id) as unknown as
    | MerchantRow
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    contactEmail: row.contact_email,
    instagram: row.instagram,
    website: row.website,
  };
}

/**
 * The merchant studio runs as one seeded demo merchant so the reviewer can
 * create campaigns without an auth system. Real sign-in is out of scope for P0.
 */
export function getDemoMerchant(): Merchant {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM merchants WHERE handle = 'umbra-coffee'")
    .get() as unknown as MerchantRow | undefined;
  const fallback =
    row ??
    (db.prepare("SELECT * FROM merchants ORDER BY created_at ASC LIMIT 1").get() as unknown as
      | MerchantRow
      | undefined);
  if (!fallback) {
    throw new Error("No demo merchant seeded in the database.");
  }
  return {
    id: fallback.id,
    name: fallback.name,
    contactEmail: fallback.contact_email,
    instagram: fallback.instagram,
    website: fallback.website,
  };
}

export function platformStats() {
  const db = getDb();
  const published = db
    .prepare("SELECT COUNT(*) AS count FROM campaigns WHERE status = 'published'")
    .get() as { count: number };
  const pending = db
    .prepare("SELECT COUNT(*) AS count FROM campaigns WHERE status = 'pending'")
    .get() as { count: number };
  const clues = db.prepare("SELECT COUNT(*) AS count FROM clues").get() as { count: number };
  const merchants = db.prepare("SELECT COUNT(*) AS count FROM merchants").get() as {
    count: number;
  };
  return {
    published: published.count,
    pending: pending.count,
    clues: clues.count,
    merchants: merchants.count,
  };
}

export function merchantStats(merchantId: string): Record<CampaignStatus, number> {
  const rows = getDb()
    .prepare(
      `SELECT status, COUNT(*) AS count FROM campaigns WHERE merchant_id = ? GROUP BY status`,
    )
    .all(merchantId) as unknown as Array<{ status: CampaignStatus; count: number }>;
  const stats: Record<CampaignStatus, number> = {
    draft: 0,
    pending: 0,
    published: 0,
    rejected: 0,
  };
  for (const row of rows) stats[row.status] = row.count;
  return stats;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "quest"
  );
}

function uniqueSlug(base: string): string {
  const db = getDb();
  let candidate = base;
  let attempt = 0;
  while (
    db.prepare("SELECT 1 AS found FROM campaigns WHERE slug = ?").get(candidate) !== undefined
  ) {
    attempt += 1;
    candidate = `${base}-${attempt + 1}`;
  }
  return candidate;
}

export function createCampaign(input: CampaignInput, merchantId: string): Campaign {
  const db = getDb();
  const id = `cmp_${randomUUID()}`;
  const slug = uniqueSlug(slugify(input.title));
  const now = new Date().toISOString();

  transaction(db, () => {
    db.prepare(
      `INSERT INTO campaigns (
         id, merchant_id, slug, title, shop_name, shop_area, shop_address, teaser, story,
         target_object, target_object_hint, reward_amount, coupon_item, coupon_min_spend,
         coupon_valid_days, coupon_notes, status, submitted_at, created_at, updated_at,
         answer_question, answer, hint_1, hint_2,
         ext_social_clue, ext_web_clue, ext_instore_clue, ext_answer, ext_hint, ext_question,
         optional_mode, product_name, product_price_label, product_prop, product_clue,
         final_question, final_answer, final_hint,
         ending_title, ending_body, achievement_title, achievement_body
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      merchantId,
      slug,
      input.title,
      input.shopName,
      input.shopArea,
      input.shopAddress,
      input.teaser,
      input.story,
      input.targetObject,
      input.targetObjectHint,
      input.rewardAmount,
      input.couponItem,
      input.couponMinSpend,
      input.couponValidDays,
      input.couponNotes,
      now,
      now,
      input.answerQuestion,
      input.answer,
      input.hint1,
      input.hint2,
      input.extSocialClue,
      input.extWebClue,
      input.extInstoreClue,
      input.extAnswer,
      input.extHint,
      input.extQuestion,
      input.optionalMode,
      input.productName,
      input.productPriceLabel,
      input.productProp,
      input.productClue,
      input.finalQuestion,
      input.finalAnswer,
      input.finalHint,
      input.endingTitle,
      input.endingBody,
      input.achievementTitle,
      input.achievementBody,
    );

    const insertClue = db.prepare(
      `INSERT INTO clues (id, campaign_id, kind, position, title, body, url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    input.onlineClues.forEach((clue, index) => {
      insertClue.run(`clu_${randomUUID()}`, id, "online", index, clue.title, clue.body, clue.url ?? null);
    });
    input.instoreClues.forEach((clue, index) => {
      insertClue.run(`clu_${randomUUID()}`, id, "instore", index, clue.title, clue.body, null);
    });
  });

  const created = getCampaignById(id);
  if (!created) throw new Error("Campaign insert failed.");
  return created;
}

export type MutationResult =
  | { ok: true; campaign: Campaign }
  | { ok: false; status: number; error: string };

function replaceClues(db: DatabaseSync, campaignId: string, input: CampaignInput) {
  db.prepare("DELETE FROM clues WHERE campaign_id = ?").run(campaignId);
  const insertClue = db.prepare(
    `INSERT INTO clues (id, campaign_id, kind, position, title, body, url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  input.onlineClues.forEach((clue, index) => {
    insertClue.run(
      `clu_${randomUUID()}`,
      campaignId,
      "online",
      index,
      clue.title,
      clue.body,
      clue.url ?? null,
    );
  });
  input.instoreClues.forEach((clue, index) => {
    insertClue.run(
      `clu_${randomUUID()}`,
      campaignId,
      "instore",
      index,
      clue.title,
      clue.body,
      null,
    );
  });
}

/**
 * Merchants may correct a campaign only while it is a private draft or after an
 * operator sends it back. Pending and published campaigns are locked.
 */
export function updateCampaign(
  id: string,
  merchantId: string,
  input: CampaignInput,
): MutationResult {
  const db = getDb();
  const campaign = getCampaignById(id);
  if (!campaign) return { ok: false, status: 404, error: "Campaign not found." };
  if (campaign.merchantId !== merchantId) {
    return { ok: false, status: 403, error: "This campaign belongs to another merchant." };
  }
  if (campaign.status !== "draft" && campaign.status !== "rejected") {
    return {
      ok: false,
      status: 409,
      error:
        campaign.status === "pending"
          ? "This campaign is waiting for operator review and cannot be edited."
          : "A published campaign cannot be edited.",
    };
  }

  const now = new Date().toISOString();
  transaction(db, () => {
    db.prepare(
      `UPDATE campaigns
       SET title = ?, shop_name = ?, shop_area = ?, shop_address = ?, teaser = ?, story = ?,
           target_object = ?, target_object_hint = ?, reward_amount = ?, coupon_item = ?,
           coupon_min_spend = ?, coupon_valid_days = ?, coupon_notes = ?, updated_at = ?,
           answer_question = ?, answer = ?, hint_1 = ?, hint_2 = ?,
           ext_social_clue = ?, ext_web_clue = ?, ext_instore_clue = ?, ext_answer = ?, ext_hint = ?,
           ext_question = ?, optional_mode = ?, product_name = ?, product_price_label = ?,
           product_prop = ?, product_clue = ?, final_question = ?, final_answer = ?, final_hint = ?,
           ending_title = ?, ending_body = ?, achievement_title = ?, achievement_body = ?
       WHERE id = ?`,
    ).run(
      input.title,
      input.shopName,
      input.shopArea,
      input.shopAddress,
      input.teaser,
      input.story,
      input.targetObject,
      input.targetObjectHint,
      input.rewardAmount,
      input.couponItem,
      input.couponMinSpend,
      input.couponValidDays,
      input.couponNotes,
      now,
      input.answerQuestion,
      input.answer,
      input.hint1,
      input.hint2,
      input.extSocialClue,
      input.extWebClue,
      input.extInstoreClue,
      input.extAnswer,
      input.extHint,
      input.extQuestion,
      input.optionalMode,
      input.productName,
      input.productPriceLabel,
      input.productProp,
      input.productClue,
      input.finalQuestion,
      input.finalAnswer,
      input.finalHint,
      input.endingTitle,
      input.endingBody,
      input.achievementTitle,
      input.achievementBody,
      id,
    );
    replaceClues(db, id, input);
  });

  const updated = getCampaignById(id);
  if (!updated) return { ok: false, status: 500, error: "Campaign could not be updated." };
  return { ok: true, campaign: updated };
}

export function submitCampaignForReview(id: string, merchantId: string): MutationResult {
  const db = getDb();
  const campaign = getCampaignById(id);
  if (!campaign) return { ok: false, status: 404, error: "Campaign not found." };
  if (campaign.merchantId !== merchantId) {
    return { ok: false, status: 403, error: "This campaign belongs to another merchant." };
  }
  if (campaign.status !== "draft" && campaign.status !== "rejected") {
    return {
      ok: false,
      status: 409,
      error:
        campaign.status === "pending"
          ? "This campaign is already waiting for operator review."
          : "This campaign is already live.",
    };
  }
  if (!campaign.answer.trim() || !campaign.answerQuestion.trim()) {
    return {
      ok: false,
      status: 409,
      error:
        "Add the counter question and its answer before submitting. Players solve that answer to unlock evidence, so the trail is not playable without it.",
    };
  }
  if (campaign.optionalMode === "product_clue") {
    if (!campaign.extAnswer.trim()) {
      return {
        ok: false,
        status: 409,
        error:
          "A product-clue mystery needs the pre-order deduction answer before it can be submitted.",
      };
    }
    if (
      !campaign.productName.trim() ||
      !campaign.productClue.trim() ||
      !campaign.finalQuestion.trim() ||
      !campaign.finalAnswer.trim()
    ) {
      return {
        ok: false,
        status: 409,
        error:
          "Add the signature product, the product clue, the final question and its answer before submitting.",
      };
    }
  }

  const now = new Date().toISOString();
  // last_rejection_note / last_rejection_at are deliberately kept: the operator
  // must still see the feedback this revision was written against.
  db.prepare(
    `UPDATE campaigns
     SET status = 'pending', operator_note = NULL, submitted_at = ?, reviewed_at = NULL,
         reviewed_by = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(now, now, id);

  const updated = getCampaignById(id);
  if (!updated) return { ok: false, status: 500, error: "Campaign could not be updated." };
  return { ok: true, campaign: updated };
}

export function reviewCampaign(
  id: string,
  decision: "approve" | "reject",
  note: string,
  reviewer = "operator.demo",
): MutationResult {
  const db = getDb();
  const campaign = getCampaignById(id);
  if (!campaign) return { ok: false, status: 404, error: "Campaign not found." };
  if (campaign.status !== "pending") {
    return { ok: false, status: 409, error: "Only campaigns awaiting review can be reviewed." };
  }
  if (decision === "approve" && (!campaign.answer.trim() || !campaign.answerQuestion.trim())) {
    return {
      ok: false,
      status: 409,
      error: "Send this back: it has no counter answer, so players could not complete it.",
    };
  }
  if (
    decision === "approve" &&
    campaign.optionalMode === "product_clue" &&
    (!campaign.productName.trim() || !campaign.productClue.trim() || !campaign.finalAnswer.trim())
  ) {
    return {
      ok: false,
      status: 409,
      error: "Send this back: its product-clue mystery is missing a clue or a final answer.",
    };
  }

  const now = new Date().toISOString();
  if (decision === "approve") {
    db.prepare(
      `UPDATE campaigns
       SET status = 'published', operator_note = ?, reviewed_at = ?, reviewed_by = ?,
           published_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(note || null, now, reviewer, now, now, id);
  } else {
    db.prepare(
      `UPDATE campaigns
       SET status = 'rejected', operator_note = ?, last_rejection_note = ?,
           last_rejection_at = ?, reviewed_at = ?, reviewed_by = ?, published_at = NULL,
           updated_at = ?
       WHERE id = ?`,
    ).run(note, note, now, now, reviewer, now, id);
  }

  const updated = getCampaignById(id);
  if (!updated) return { ok: false, status: 500, error: "Campaign could not be updated." };
  return { ok: true, campaign: updated };
}
