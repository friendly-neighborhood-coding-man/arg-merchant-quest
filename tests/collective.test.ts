import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NINTH_CUP,
  campaignBySlug,
  createSecondBooth,
  finalAnswer,
  playTo,
} from "./helpers";
import {
  COLLECTIVE_EVIDENCE,
  COLLECTIVE_THRESHOLD,
  buildCollectiveState,
  collectivePhase,
  collectiveSummary,
  readCollectiveState,
  withCollective,
  type MilestoneRead,
} from "../src/lib/collective";
import {
  buildProviderMessages,
  collectiveSentence,
  companionContextSnapshot,
  scriptedReply,
} from "../src/lib/companion";
import { getQuestView, type QuestView } from "../src/lib/quest-store";
import type { Campaign } from "../src/lib/types";

const COUNTER = "UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt";
const ENDPOINT = "https://devnet-as.magicblock.app/";
const EVIDENCE = COLLECTIVE_EVIDENCE["the-ninth-cup"];

function read(partial: Partial<MilestoneRead> = {}): MilestoneRead {
  return {
    counterAccount: COUNTER,
    erValue: null,
    baseValue: null,
    delegated: true,
    erEndpoint: ENDPOINT,
    ...partial,
  };
}

let player = 0;
const nextPlayer = () => `plr_00000000-0000-4000-8000-${String(++player).padStart(12, "0")}`;

const QUESTION_SET = [
  "What can the other investigators add?",
  "Revisit my earlier theories with the shared evidence",
  "Give me a hint",
  "What have we discovered?",
  "What should I inspect next?",
  "Tell me about MagicBlock",
  "What is the answer?",
];

const answerTokens = (text: string) => (text.match(/\b(?:5|11|19)\b/g) ?? []);

test("phase mapping: 0 none, 1 first, 2+ unlocked, no count unavailable", () => {
  assert.equal(collectivePhase(null), "unavailable");
  assert.equal(collectivePhase(0), "none");
  assert.equal(collectivePhase(1), "first");
  assert.equal(collectivePhase(COLLECTIVE_THRESHOLD), "unlocked");
  assert.equal(collectivePhase(3), "unlocked");
});

test("0 / 1 / 2+ ER states: the shared fragment appears only at the 2+ gate", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);

  const zero = buildCollectiveState(campaign, read({ erValue: 0, baseValue: 0 }));
  assert.equal(zero.phase, "none");
  assert.equal(zero.count, 0);
  assert.equal(zero.countSource, "er");
  assert.equal(zero.evidence, null);
  assert.equal(collectiveSummary(zero)?.locked, true);
  assert.equal(collectiveSummary(zero)?.evidence, null);

  const one = buildCollectiveState(campaign, read({ erValue: 1, baseValue: 1 }));
  assert.equal(one.phase, "first");
  assert.equal(one.count, 1);
  assert.equal(one.evidence, null);

  const two = buildCollectiveState(campaign, read({ erValue: 2, baseValue: 2 }));
  assert.equal(two.phase, "unlocked");
  assert.equal(two.count, 2);
  assert.equal(two.evidence?.text, EVIDENCE.text);
  assert.equal(collectiveSummary(two)?.locked, false);
  assert.equal(collectiveSummary(two)?.evidence?.text, EVIDENCE.text);

  const three = buildCollectiveState(campaign, read({ erValue: 3, baseValue: 3 }));
  assert.equal(three.phase, "unlocked");
  assert.equal(three.count, 3);
});

test("malformed ER reads never unlock: non-integers, negatives and non-numbers are unavailable", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  for (const erValue of [1.5, -1, Number.NaN, "2" as unknown as number, Infinity]) {
    const state = buildCollectiveState(campaign, read({ erValue: erValue as number, baseValue: 2 }));
    assert.equal(state.phase, "unavailable", `erValue ${String(erValue)}`);
    assert.equal(state.count, null, `erValue ${String(erValue)}`);
    assert.equal(state.evidence, null, `erValue ${String(erValue)}`);
  }
});

test("an unreadable ER is unavailable even when a committed base value is visible", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const state = buildCollectiveState(campaign, read({ erValue: null, baseValue: 3, delegated: false }));
  assert.equal(state.phase, "unavailable");
  assert.equal(state.committed, 3);
  assert.equal(state.evidence, null);
  assert.match(state.error ?? "", /could not be read/i);
});

test("a live ER behind the committed base value is stale: the committed count wins", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const state = buildCollectiveState(campaign, read({ erValue: 1, baseValue: 2 }), null, "2026-11-24T00:00:00.000Z");
  assert.equal(state.phase, "unlocked");
  assert.equal(state.count, 2);
  assert.equal(state.countSource, "base");
  assert.equal(state.stale, true);
  assert.equal(state.erLive, 1);
  assert.equal(state.committed, 2);
  assert.equal(state.readAt, "2026-11-24T00:00:00.000Z");
});

test("an unreachable or timed-out read is unavailable and generates no evidence", async () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);

  const thrown = await readCollectiveState(campaign, {
    reader: async () => {
      throw new Error("getAccountInfo failed");
    },
  });
  assert.equal(thrown.phase, "unavailable");
  assert.equal(thrown.evidence, null);
  assert.match(thrown.error ?? "", /getAccountInfo failed/);

  const stalled = await readCollectiveState(campaign, {
    reader: () => new Promise<MilestoneRead>(() => {}),
    timeoutMs: 10,
  });
  assert.equal(stalled.phase, "unavailable");
  assert.equal(stalled.evidence, null);
  assert.match(stalled.error ?? "", /did not answer/);
});

test("campaign isolation: the count is this campaign's, and another campaign gets no Ninth Cup fragment", async () => {
  const ninth = campaignBySlug(NINTH_CUP.slug);
  const booth = createSecondBooth();

  const ninthState = await readCollectiveState(ninth, { reader: async () => read({ erValue: 2, baseValue: 2 }) });
  const boothState = await readCollectiveState(booth, { reader: async () => read({ erValue: 2, baseValue: 2 }) });

  assert.equal(ninthState.campaignId, ninth.id);
  assert.equal(boothState.campaignId, booth.id);
  assert.notEqual(ninth.id, booth.id);
  assert.equal(ninthState.evidence?.text, EVIDENCE.text);
  assert.equal(boothState.phase, "unlocked");
  assert.equal(boothState.evidence, null, "the Ninth Cup fragment must not be served to another campaign");

  const boothView = withCollective(
    playTo(booth, { basic: "2", extended: "2" }, "released", nextPlayer()).view(),
    boothState,
  );
  assert.ok(!JSON.stringify(boothView).includes(EVIDENCE.text));
  assert.match(scriptedReply(boothView, "What can the other investigators add?").reply, /no shared evidence fragment/i);
});

test("locked gate: no fragment in the view payload, provider messages, scripted replies or API summary", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const run = playTo(campaign, NINTH_CUP.answers, "released", nextPlayer());
  const state = buildCollectiveState(campaign, read({ erValue: 1, baseValue: 1 }));
  const view = withCollective(run.view(), state);

  assert.equal(view.optional.clue?.text, campaign.productClue, "the player's own released clue stays available");
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes(EVIDENCE.text), "locked page payload leaked the shared fragment");
  assert.ok(!serialized.includes(EVIDENCE.title), "locked page payload leaked the shared title");

  const snapshot = companionContextSnapshot(view);
  assert.equal(snapshot.collective?.phase, "first");
  assert.equal(snapshot.collective?.evidence, null);

  const system = buildProviderMessages(snapshot, view, "Revisit my earlier theories")[0].content;
  assert.ok(!system.includes(EVIDENCE.text), "locked provider prompt leaked the shared fragment");
  assert.match(system, /SHARED EVIDENCE: locked or unavailable/);

  for (const question of QUESTION_SET) {
    const text = scriptedReply(view, question).reply;
    assert.ok(!text.includes(EVIDENCE.text), `locked scripted reply leaked the fragment: ${question}`);
    assert.deepEqual(answerTokens(text), [], `locked scripted reply mentioned an answer: ${question}`);
  }

  assert.equal(collectiveSummary(state)?.evidence, null);
  assert.match(scriptedReply(view, "What can the other investigators add?").reply, /second verified handoff/i);
});

test("unlocked gate: fragment reaches the view, provider context, scripted reply and summary — without answers", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const run = playTo(campaign, NINTH_CUP.answers, "released", nextPlayer());
  const state = buildCollectiveState(campaign, read({ erValue: 2, baseValue: 2 }));
  const view = withCollective(run.view(), state);

  assert.ok(JSON.stringify(view).includes(EVIDENCE.text));

  const snapshot = companionContextSnapshot(view);
  assert.equal(snapshot.collective?.phase, "unlocked");
  assert.equal(snapshot.collective?.evidence?.text, EVIDENCE.text);
  assert.equal(snapshot.collective?.erLive, 2);
  assert.equal(snapshot.collective?.committed, 2);

  const system = buildProviderMessages(snapshot, view, "Revisit my earlier theories")[0].content;
  assert.ok(system.includes(EVIDENCE.text));
  assert.match(system, /SHARED EVIDENCE \(unlocked\)/);
  assert.match(system, /eligible handoffs, not unique people/);
  // The style rule "2-5 short sentences" contains a 5, so check the two real
  // hidden numbers and that no answer is stated as an answer.
  assert.doesNotMatch(system, /\b19\b/);
  assert.doesNotMatch(system, /\b11\b/);
  assert.doesNotMatch(system, /the answer is/i);

  const revisited = scriptedReply(view, "Revisit my earlier theories with the shared evidence").reply;
  assert.ok(revisited.includes(EVIDENCE.text));
  assert.match(revisited, /Compare that with/);
  assert.match(revisited, /\?/, "the reply should ask a specific investigative question");
  assert.deepEqual(answerTokens(revisited), []);
  assert.deepEqual(answerTokens(collectiveSentence(view)), []);

  assert.equal(collectiveSummary(state)?.evidence?.title, EVIDENCE.title);
  assert.deepEqual(answerTokens(EVIDENCE.text), []);
});

test("individual claim and collective count are separate: an unlocked campaign does not release a player's own clue", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);

  const unclaimed = playTo(campaign, NINTH_CUP.answers, "started", nextPlayer());
  const unlocked = withCollective(
    unclaimed.view(),
    buildCollectiveState(campaign, read({ erValue: 2, baseValue: 2 })),
  );
  assert.equal(unlocked.collective?.phase, "unlocked");
  assert.equal(unlocked.optional.claim, null);
  assert.equal(unlocked.optional.clue, null);
  assert.equal(unlocked.optional.final.question, "");
  assert.equal(unlocked.completion, null);

  const requested = playTo(campaign, NINTH_CUP.answers, "requested", nextPlayer());
  const stillHeld = withCollective(
    requested.view(),
    buildCollectiveState(campaign, read({ erValue: 2, baseValue: 2 })),
  );
  assert.equal(stillHeld.collective?.phase, "unlocked");
  assert.equal(stillHeld.optional.claim?.status, "requested");
  assert.equal(stillHeld.optional.clue, null, "collective evidence must not release this player's product clue");
  assert.equal(stillHeld.optional.final.question, "");
  assert.equal(stillHeld.optional.claim?.reference, requested.reference);
});

test("unavailable ER keeps free gameplay and scripted guidance working, and never fabricates progress", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const run = playTo(campaign, NINTH_CUP.answers, "released", nextPlayer());
  const view: QuestView = withCollective(
    run.view(),
    buildCollectiveState(campaign, null, "The MagicBlock milestone read failed."),
  );

  assert.equal(view.collective?.phase, "unavailable");
  assert.equal(view.collective?.count, null);
  assert.equal(view.collective?.evidence, null);
  assert.match(scriptedReply(view, "What can the other investigators add?").reply, /could not be read/i);
  assert.match(scriptedReply(view, "Give me a hint").reply, /product clue|sleeve|number/i);

  const solved = finalAnswer(campaign, run.sessionId, NINTH_CUP.final);
  assert.equal(solved.ok, true, "the hidden ending must still be playable");
  const after = withCollective(getFreshView(campaign, run.playerId), view.collective!);
  assert.equal(after.optional.final.solved, true);
  assert.equal(after.completion?.rewardAmount, campaign.rewardAmount);
  assert.equal(after.optional.final.achievementTitle, campaign.achievementTitle);
});

test("unlocked collective state does not change the fixed reward or the hidden ending", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const run = playTo(campaign, NINTH_CUP.answers, "released", nextPlayer());
  const view = withCollective(
    run.view(),
    buildCollectiveState(campaign, read({ erValue: 2, baseValue: 2 })),
  );

  const solved = finalAnswer(campaign, run.sessionId, NINTH_CUP.final);
  assert.equal(solved.ok, true);
  const after = withCollective(getFreshView(campaign, run.playerId), view.collective!);
  assert.equal(after.completion?.rewardAmount, campaign.rewardAmount);
  assert.equal(after.completion?.payoutStatus, "pending");
  assert.equal(after.optional.final.solved, true);
  assert.equal(after.optional.final.endingTitle, campaign.endingTitle);
  assert.equal(after.completion?.couponEligible, false, "product-clue mode never issues a coupon");
});

function getFreshView(campaign: Campaign, playerId: string): QuestView {
  const view = getQuestView(playerId, campaign);
  if (!view) throw new Error("no view for player");
  return view;
}
