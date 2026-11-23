import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptToCampaignDraft } from "../src/lib/story-draft";
import { generateStoryIdeas } from "../src/lib/story-lab";
import type { StoryConcept, StoryLabInput } from "../src/lib/story-lab";

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
