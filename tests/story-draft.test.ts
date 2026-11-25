// Imported first: it seeds a throwaway database before any store call below.
import "./helpers";

import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptToCampaignDraft } from "../src/lib/story-draft";
import { generateStoryIdeas } from "../src/lib/story-lab";
import type { StoryConcept, StoryLabInput } from "../src/lib/story-lab";
import { isPlaceholderText, validateCampaignInput } from "../src/lib/validation";
import { createCampaign, getDemoMerchant, submitCampaignForReview } from "../src/lib/store";

const concept: StoryConcept = {
  title: "The Bell That Wasn't Rung",
  premise: "A bell above the door rings only for people who never arrive.",
  onlineClues: [
    "A 2018 post shows the bell missing from the door.",
    "The about page lists two bells, but only one is visible.",
    "A review mentions hearing a bell at closing time.",
  ],
  instoreObservation: "The second bell hangs behind the counter, wrapped in paper.",
  productClue: "The paper says: SUBTRACT THE MISSING BELL FROM THE YEAR ON THE POST.",
  basicPuzzle: "How many bells were listed?",
  hiddenEnding: "The bell was rung once, for the owner's partner, and then wrapped up.",
};

const input: StoryLabInput = {
  businessName: "Paper Moon Books",
  location: "Mangwon-dong, Seoul",
  history: "Opened in 2016.",
  product: "A wrapped pocket book",
  season: "winter",
  props: "A printed bookmark",
  atmosphere: "quiet",
};

test("Story Lab maps a concept into the existing campaign form, not a new schema", () => {
  const draft = conceptToCampaignDraft(concept, input, "Demo Merchant");
  assert.equal(draft.title, concept.title);
  assert.equal(draft.shopName, "Paper Moon Books");
  assert.equal(draft.shopArea, "Mangwon-dong, Seoul");
  assert.equal(draft.optionalMode, "product_clue");
  assert.equal(draft.productName, "A wrapped pocket book");
  assert.equal(draft.productProp, "A printed bookmark");
  assert.equal(draft.productClue, concept.productClue);
  assert.match(draft.endingBody, /bell was rung once/);
  assert.equal(draft.onlineClues.length, 3);
  assert.equal(draft.instoreClues.length, 1);
});

test("Story Lab never invents a verified address, counter answer or final answer", () => {
  const draft = conceptToCampaignDraft(concept, input, "Demo Merchant");
  assert.equal(draft.shopAddress, "");
  assert.equal(draft.answer, "");
  assert.equal(draft.extAnswer, "");
  assert.equal(draft.finalAnswer, "");
  assert.match(draft.targetObject, /^INCOMPLETE —/);
  assert.match(draft.targetObjectHint, /^INCOMPLETE —/);
  assert.match(draft.answerQuestion, /^INCOMPLETE —/);
  assert.match(draft.finalQuestion, /^INCOMPLETE —/);
  assert.match(draft.productPriceLabel, /^INCOMPLETE —/);
  assert.match(draft.story, /fiction/i);
});

test("local Story Lab drafts do not duplicate a leading article in the product", async () => {
  const result = await generateStoryIdeas({ ...input, product: "the burnt-honey syrup jar" });
  assert.equal(result.mode, "local-draft");
  const text = result.concepts.map((item) => Object.values(item).flat().join(" ")).join(" ");
  assert.ok(!/\bthe the\b/i.test(text), text);
  assert.equal(result.concepts[0].title, "The Burnt-Honey Syrup Jar That Was Never Served");
});

test("Story Lab mapping is campaign-specific and does not inherit Ninth Cup wording", () => {
  const draft = conceptToCampaignDraft(concept, input, "Demo Merchant");
  const text = JSON.stringify(draft);
  assert.ok(!/ninth cup|ninth-clue|umbra|sleeve/i.test(text), text);
});

/** The same draft with every placeholder replaced by merchant copy. */
function completedDraft(): Record<string, unknown> {
  return {
    ...conceptToCampaignDraft(concept, input, "Demo Merchant"),
    shopAddress: "12 Fictional-ro, Mapo-gu (fictional)",
    targetObject: "The second bell wrapped in paper",
    targetObjectHint: "Behind the till, wrapped in paper next to the register.",
    answerQuestion: "How many bells were listed on the page?",
    answer: "2",
    hint1: "Count the bells the shop's own page lists.",
    hint2: "Two bells were listed; only one still hangs on the door.",
    extQuestion: "How many bells hang on the door today?",
    extAnswer: "1",
    extHint: "One on the door, one wrapped behind the counter.",
    productPriceLabel: "₩9,500 (demo simulation)",
    finalQuestion: "What number does the wrapping paper give?",
    finalAnswer: "19",
    finalHint: "Subtract the missing bell from the year on the post.",
  };
}

const PLACEHOLDER_FIELDS = [
  "targetObject",
  "targetObjectHint",
  "answerQuestion",
  "hint1",
  "hint2",
  "extQuestion",
  "extHint",
  "productPriceLabel",
  "finalQuestion",
  "finalHint",
] as const;

test("unfinished Story Lab placeholders are rejected by server-side validation", () => {
  const draft = conceptToCampaignDraft(concept, input, "Demo Merchant");
  const parsed = validateCampaignInput({
    ...draft,
    shopAddress: "12 Fictional-ro, Mapo-gu (fictional)",
  });
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  for (const field of PLACEHOLDER_FIELDS) {
    assert.match(
      parsed.errors[field] ?? "",
      /Story Lab placeholder/,
      `${field} was not reported: ${parsed.errors[field]}`,
    );
  }
});

test("placeholder rejection covers coupon mode and nested clue content", () => {
  const completed = completedDraft();
  const coupon = validateCampaignInput({
    ...completed,
    optionalMode: "coupon",
    couponItem: "Bell-ring cold brew (demo)",
    hint2: "INCOMPLETE — write the stronger five-minute nudge.",
  });
  assert.equal(coupon.ok, false);
  if (!coupon.ok) assert.match(coupon.errors.hint2 ?? "", /Story Lab placeholder/);

  const nested = validateCampaignInput({
    ...completed,
    onlineClues: [
      {
        title: "Pinned post",
        body: "INCOMPLETE — add the real clue text.",
        url: "https://example.com/post",
      },
    ],
  });
  assert.equal(nested.ok, false);
  if (!nested.ok) {
    assert.match(nested.errors["onlineClues.0.body"] ?? "", /Online clue 1 text/);
  }
});

test("ordinary merchant prose that mentions incompleteness is still accepted", () => {
  const parsed = validateCampaignInput({
    ...completedDraft(),
    hint1: "Incomplete notes on the door are the clue; count the complete ones.",
  });
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.errors));
  assert.equal(isPlaceholderText("Incomplete notes on the door are the clue."), false);
  assert.equal(isPlaceholderText("  INCOMPLETE — decide the final question.  "), true);
});

test("an incomplete concept cannot enter the review queue, a completed one can", () => {
  const parsed = validateCampaignInput(completedDraft());
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const merchant = getDemoMerchant();

  const unfinished = createCampaign(
    {
      ...parsed.value,
      title: "The Bell That Was Never Hung",
      finalQuestion: "INCOMPLETE — decide the final question after the product clue.",
    },
    merchant.id,
  );
  const blocked = submitCampaignForReview(unfinished.id, merchant.id);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.status, 409);
    assert.match(blocked.error, /Final question/);
  }

  const finished = createCampaign(
    { ...parsed.value, title: "The Bell That Was Rung Once" },
    merchant.id,
  );
  const submitted = submitCampaignForReview(finished.id, merchant.id);
  assert.equal(submitted.ok, true, submitted.ok ? "" : submitted.error);
});

test("Story Lab retries once when a newer model rejects max_tokens", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const realFetch = globalThis.fetch;
  process.env.ARG_AI_API_KEY = "test-key-not-real";
  process.env.ARG_AI_MODEL = "newer-model";
  process.env.ARG_AI_BASE_URL = "http://provider.invalid/v1";
  let call = 0;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    call += 1;
    if (call === 1) {
      return new Response("Unsupported parameter: 'max_tokens' is not supported with this model.", { status: 400 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ concepts: [concept] }) } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const result = await generateStoryIdeas(input);
    assert.equal(result.mode, "live");
    assert.equal(result.model, "newer-model");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].max_tokens, 4000);
    assert.equal(bodies[1].max_tokens, undefined);
    assert.equal(bodies[1].max_completion_tokens, 4000);
    assert.equal(result.concepts[0]?.title, concept.title);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ARG_AI_API_KEY;
    delete process.env.ARG_AI_MODEL;
    delete process.env.ARG_AI_BASE_URL;
  }
});

test("Story Lab keeps its narrative temperature on Claude 4.6 and omits it on 4.7+", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  process.env.ARG_AI_API_KEY = "test-key-not-real";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ concepts: [concept] }) } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    process.env.ARG_AI_MODEL = "claude-opus-4-6";
    const older = await generateStoryIdeas(input);
    process.env.ARG_AI_MODEL = "claude-opus-5-5";
    const newer = await generateStoryIdeas(input);

    assert.equal(older.mode, "live");
    assert.equal(newer.mode, "live");
    assert.equal(urls[0], "https://api.anthropic.com/v1/chat/completions");
    assert.equal(bodies[0].temperature, 0.8);
    assert.equal(bodies[0].max_tokens, 4000);
    assert.equal(bodies[1].temperature, undefined);
    assert.equal(bodies[1].max_tokens, 4000);
    assert.equal(newer.concepts[0]?.title, concept.title);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ARG_AI_API_KEY;
    delete process.env.ARG_AI_MODEL;
  }
});
