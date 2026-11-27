import { test } from "node:test";
import assert from "node:assert/strict";
import { NINTH_CUP, campaignBySlug, finalAnswer, playTo } from "./helpers";
import { advanceExtended, getCompletion, listPlayerAchievements } from "../src/lib/quest-store";
import { handoffProductClaim } from "../src/lib/product-claims";
import { getCouponBySessionId, redeemCoupon } from "../src/lib/coupons";
import { createCampaign, getDemoMerchant, reviewCampaign, submitCampaignForReview } from "../src/lib/store";
import { validateCampaignInput } from "../src/lib/validation";

let player = 100;
const nextPlayer = () => `plr_00000000-0000-4000-8000-${String(++player).padStart(12, "0")}`;

test("documented Ninth Cup walkthrough answers (5, 11, 19) work on a fresh seed; 2 is rejected", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  assert.equal(campaign.optionalMode, "product_clue");
  const run = playTo(campaign, NINTH_CUP.answers, "verified", nextPlayer());
  for (let step = 0; step < 3; step += 1) assert.ok(advanceExtended(run.session(), campaign, "read").ok);
  const booth = advanceExtended(run.session(), campaign, "answer", "2");
  assert.equal(booth.ok, false, "2 must not be accepted as the extended answer");
  assert.ok(advanceExtended(run.session(), campaign, "answer", "11").ok);
});

test("free reward is recorded before and independently of the optional product", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const run = playTo(campaign, NINTH_CUP.answers, "verified", nextPlayer());
  const completion = getCompletion(run.sessionId);
  assert.ok(completion, "verified completion exists without any product step");
  assert.equal(completion?.rewardAmount, 100);
  assert.equal(run.view().optional.claim, null);
});

test("unreleased clue never reaches the player view; one handoff only; final answer gated", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const run = playTo(campaign, NINTH_CUP.answers, "requested", nextPlayer());
  const before = JSON.stringify(run.view());
  assert.ok(!before.includes(campaign.productClue));
  assert.ok(!before.includes(campaign.finalHint));
  assert.ok(!before.includes(campaign.endingBody));
  assert.equal(finalAnswer(campaign, run.sessionId, NINTH_CUP.final).ok, false, "final answer before handoff");

  const reference = run.reference as string;
  const first = handoffProductClaim({ reference, staffName: "Staff A", handoffConfirmed: true });
  const second = handoffProductClaim({ reference, staffName: "Staff B", handoffConfirmed: true });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.status, 409);

  assert.equal(run.view().optional.clue?.text, campaign.productClue);
  const wrong = finalAnswer(campaign, run.sessionId, "18");
  assert.equal(wrong.ok, false);
  assert.ok(finalAnswer(campaign, run.sessionId, NINTH_CUP.final).ok);
  const codes = listPlayerAchievements(run.playerId).map((a) => a.code);
  assert.ok(codes.includes("hidden_ending"), `achievements: ${codes.join(",")}`);
});

test("legacy coupon mode: one coupon after the extended solve, redeemed once", () => {
  const parsed = validateCampaignInput({
    title: "The Brass Key",
    shopName: "Umbra Coffee Roasters",
    shopArea: "Seongsu-dong",
    shopAddress: "24 Fictional-gil, Seoul (fictional)",
    teaser: "A brass key hangs where nobody looks.",
    story:
      "The founder hid a brass key somewhere in the shop. Follow the posts and find it; everyone gets the same fixed reward, and nobody races.",
    targetObject: "Brass key on a red ribbon",
    targetObjectHint: "Under the window bench plant shelf, tied with red ribbon.",
    answerQuestion: "How many teeth does the key have?",
    answer: "7",
    extSocialClue: "A 2020 post says the key opened a box of seven letters.",
    extWebClue: "The about page says three letters were never sent.",
    extInstoreClue: "The box by the till holds the letters that were sent.",
    extQuestion: "How many letters were sent?",
    extAnswer: "4",
    extHint: "Seven letters, three never sent.",
    rewardAmount: 100,
    couponItem: "Brass Key cold brew (demo secret menu)",
    couponMinSpend: 12000,
    couponValidDays: 3,
    couponNotes: "Demo only.",
    optionalMode: "coupon",
    onlineClues: [{ title: "Pinned post", body: "The pinned post shows a key with seven teeth." }],
    instoreClues: [{ title: "Window bench", body: "Look under the greenest leaf on the bench." }],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const merchant = getDemoMerchant();
  const created = createCampaign(parsed.value, merchant.id);
  assert.ok(submitCampaignForReview(created.id, merchant.id).ok);
  const approved = reviewCampaign(created.id, "approve", "");
  if (!approved.ok) throw new Error(approved.error);
  const campaign = approved.campaign;

  const run = playTo(campaign, { basic: "7", extended: "4" }, "verified", nextPlayer());
  assert.equal(getCouponBySessionId(run.sessionId), null, "no coupon before the extended solve");
  for (let step = 0; step < 3; step += 1) assert.ok(advanceExtended(run.session(), campaign, "read").ok);
  assert.ok(advanceExtended(run.session(), campaign, "answer", "4").ok);
  const coupon = getCouponBySessionId(run.sessionId);
  assert.ok(coupon, "coupon issued");
  assert.equal(coupon?.couponMinSpend, 12000);

  const redeemed = redeemCoupon({ code: coupon!.code, staffName: "Mina", purchaseConfirmed: true });
  assert.equal(redeemed.ok, true);
  const again = redeemCoupon({ code: coupon!.code, staffName: "Mina", purchaseConfirmed: true });
  assert.equal(again.ok, false);
});
