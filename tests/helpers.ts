/**
 * Shared setup for the P1 regression tests. Each test file gets its own
 * throwaway SQLite database (seeded exactly like a fresh `npm run db:reset`),
 * so no test touches `.data/` or any chain, wallet or AI credential.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arg-test-"));
process.env.ARG_DATA_DIR = dir;
process.env.ARG_DB_PATH = path.join(dir, "arg.db");
// Chain, payout and AI configuration must never leak into the tests.
for (const key of [
  "ARG_AI_API_KEY",
  "ARG_AI_MODEL",
  "ARG_AI_BASE_URL",
  "ARG_TREASURY_KEYPAIR",
  "ARG_REWARD_MINT",
  "ARG_COUNTER_PROGRAM_ID",
]) {
  delete process.env[key];
}

/* eslint-disable @typescript-eslint/no-require-imports */
import { getCampaignBySlug, createCampaign, getDemoMerchant, reviewCampaign, submitCampaignForReview } from "../src/lib/store";
import {
  advanceExtended,
  advanceQuest,
  getQuestView,
  getSessionById,
  reviewEvidence,
  startQuest,
  submitEvidence,
  submitFinalAnswer,
  submitQuestAnswer,
  type QuestView,
} from "../src/lib/quest-store";
import { handoffProductClaim, requestProductClaim } from "../src/lib/product-claims";
import { validateCampaignInput } from "../src/lib/validation";
import type { Campaign } from "../src/lib/types";

export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

export interface Answers {
  basic: string;
  extended: string;
}

export const NINTH_CUP = { slug: "the-ninth-cup", answers: { basic: "5", extended: "11" }, final: "19" };

/** A merchant-made product-clue campaign with no Ninth Cup wording. */
export function createSecondBooth(): Campaign {
  const parsed = validateCampaignInput({
    title: "The Second Booth",
    shopName: "Mangwon Records",
    shopArea: "Mangwon-dong",
    shopAddress: "12 Fictional-ro, Mapo-gu (fictional)",
    teaser: "One booth is for listening. The other is for remembering.",
    story:
      "The cousins built the second booth from an old pew. Follow the posts, count the tags, and find the record nobody prices; the reward is fixed for everyone.",
    targetObject: "Unnumbered 7-inch record in booth two",
    targetObjectHint: "Second booth, price-tag wall, the only blank tag.",
    answerQuestion: "How many booths are there?",
    answer: "2",
    extSocialClue: "A 2004 post shows three records on the pew.",
    extWebClue: "The about page says one record was never sold.",
    extInstoreClue: "The pew holds the records that were sold.",
    extQuestion: "How many records were sold?",
    extAnswer: "2",
    extHint: "Three on the pew, one never sold.",
    rewardAmount: 100,
    couponItem: "Midnight session (demo)",
    couponMinSpend: 0,
    couponValidDays: 14,
    couponNotes: "Demo only.",
    optionalMode: "product_clue",
    productName: "Midnight listening session",
    productPriceLabel: "₩8,000 (demo simulation)",
    productProp: "A printed record insert",
    productClue: "Inside the insert: DOUBLE THE BOOTHS, THEN ADD THE SOLD RECORDS.",
    finalQuestion: "What number does the insert give?",
    finalAnswer: "6",
    finalHint: "Two booths doubled, plus the records that were sold.",
    endingTitle: "The Unpriced Record",
    endingBody: "The cousins kept the last record for whoever counted carefully enough to ask about it.",
    achievementTitle: "Keeper of the Unpriced Record",
    achievementBody: "You followed the insert to the hidden ending.",
    onlineClues: [{ title: "Pinned post", body: "The pinned post shows two booths in the back.", url: "https://example.com/post" }],
    instoreClues: [{ title: "Back room", body: "Count the booths behind the counter." }],
  });
  if (!parsed.ok) throw new Error(`Second Booth input invalid: ${JSON.stringify(parsed.errors)}`);
  const merchant = getDemoMerchant();
  const created = createCampaign(parsed.value, merchant.id);
  const submitted = submitCampaignForReview(created.id, merchant.id);
  if (!submitted.ok) throw new Error(submitted.error);
  const approved = reviewCampaign(created.id, "approve", "");
  if (!approved.ok) throw new Error(approved.error);
  return approved.campaign;
}

export function campaignBySlug(slug: string): Campaign {
  const campaign = getCampaignBySlug(slug);
  if (!campaign) throw new Error(`No campaign ${slug}`);
  return campaign;
}

export type Stage = "started" | "verified" | "requested" | "released";

/**
 * Play a campaign as a fresh player up to `stage`, using the same store
 * functions the API routes call. Returns the player id and a view loader.
 */
export function playTo(campaign: Campaign, answers: Answers, stage: Stage, playerId: string) {
  const started = startQuest(playerId, campaign);
  if (!started.ok) throw new Error(started.error);
  const sessionId = started.session.id;
  const session = () => {
    const value = getSessionById(sessionId);
    if (!value) throw new Error("session vanished");
    return value;
  };
  const view = (): QuestView => {
    const value = getQuestView(playerId, campaign);
    if (!value) throw new Error("no view");
    return value;
  };
  if (stage === "started") return { playerId, sessionId, session, view };

  for (const clue of campaign.clues) {
    const result = advanceQuest(session(), campaign, clue.kind === "online" ? "read-online" : "read-instore");
    if (!result.ok) throw new Error(result.error);
  }
  const answered = submitQuestAnswer(session(), campaign, answers.basic);
  if (!answered.ok) throw new Error(answered.error);
  const evidence = submitEvidence({
    session: session(),
    campaign,
    kind: "upload",
    mime: "image/png",
    bytes: PNG,
    capturedAt: new Date().toISOString(),
    location: null,
  });
  if (!evidence.ok) throw new Error(evidence.error);
  const reviewed = reviewEvidence(evidence.evidence.id, "approve", "");
  if (!reviewed.ok) throw new Error(reviewed.error);
  if (stage === "verified") return { playerId, sessionId, session, view };

  for (let step = 0; step < 3; step += 1) {
    const read = advanceExtended(session(), campaign, "read");
    if (!read.ok) throw new Error(read.error);
  }
  const solved = advanceExtended(session(), campaign, "answer", answers.extended);
  if (!solved.ok) throw new Error(solved.error);
  const claim = requestProductClaim(sessionId, campaign);
  if (!claim.ok) throw new Error(claim.error);
  if (stage === "requested") return { playerId, sessionId, session, view, reference: claim.claim.reference };

  const handed = handoffProductClaim({
    reference: claim.claim.reference,
    staffName: "Test staff",
    handoffConfirmed: true,
  });
  if (!handed.ok) throw new Error(handed.error);
  return { playerId, sessionId, session, view, reference: claim.claim.reference, claimId: handed.claim.id };
}

export function finalAnswer(campaign: Campaign, sessionId: string, answer: string) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("session vanished");
  return submitFinalAnswer(session, campaign, answer);
}
