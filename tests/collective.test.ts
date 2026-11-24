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
  COLLECTIVE_SOURCE,
  COLLECTIVE_THRESHOLD,
  buildCollectiveState,
  collectivePhase,
  collectiveSummary,
  containsRestrictedCollective,
  getCollectiveAuthorization,
  readCollectiveState,
  sessionMayReadCollective,
  withCollective,
  type CollectiveState,
  type MilestoneRead,
  type MilestoneReader,
} from "../src/lib/collective";
import {
  buildProviderMessages,
  collectiveSentence,
  companionContextSnapshot,
  listCompanionMessages,
  saveCompanionMessage,
  scriptedReply,
} from "../src/lib/companion";
import { getDb } from "../src/lib/db";
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

/* ------------------------------------------------------------------------- */
/* Session-scoped authorization (corrective pass R1)                          */
/* ------------------------------------------------------------------------- */

const liveAt = (erValue: number, baseValue = erValue): MilestoneReader => async () =>
  read({ erValue, baseValue });
const failingRead: MilestoneReader = async () => {
  throw new Error("getAccountInfo failed: the ER endpoint did not answer");
};
const VERIFIED_AT = "2026-11-24T10:00:00.000Z";

function startNinthCup() {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  return { campaign, run: playTo(campaign, NINTH_CUP.answers, "started", nextPlayer()) };
}

/** History that a route or provider request would send for this view. */
function historyFor(
  view: QuestView,
  messages = listCompanionMessages(view.sessionId, 40, { allowCollective: true }),
) {
  return messages.filter(
    (message) => sessionMayReadCollective(view.collective) || !containsRestrictedCollective(message.content),
  );
}

test("authorization: a new session with ER count 1 stays locked and records no grant", async () => {
  const { campaign, run } = startNinthCup();
  const state = await readCollectiveState(campaign, {
    sessionId: run.sessionId,
    reader: liveAt(1),
  });
  assert.equal(state.phase, "first");
  assert.equal(state.count, 1);
  assert.equal(state.evidence, null);
  assert.equal(state.authority, "none");
  assert.equal(sessionMayReadCollective(state), false);
  assert.equal(collectiveSummary(state)?.locked, true);
  assert.equal(getCollectiveAuthorization(run.sessionId, campaign.id), null);
});

test("authorization: a new session with ER count 2 unlocks and records its own grant", async () => {
  const { campaign, run } = startNinthCup();
  const state = await readCollectiveState(campaign, {
    sessionId: run.sessionId,
    reader: liveAt(2),
    now: () => new Date(VERIFIED_AT),
  });
  assert.equal(state.phase, "unlocked");
  assert.equal(state.authority, "live");
  assert.equal(state.lastVerifiedAt, VERIFIED_AT);
  assert.equal(state.evidence?.text, EVIDENCE.text);
  assert.equal(sessionMayReadCollective(state), true);

  const grant = getCollectiveAuthorization(run.sessionId, campaign.id);
  assert.equal(grant?.campaignId, campaign.id);
  assert.equal(grant?.sessionId, run.sessionId);
  assert.equal(grant?.verifiedCount, 2);
  assert.equal(grant?.verificationSource, "er-live");
  assert.equal(grant?.unlockedAt, VERIFIED_AT);
  assert.equal(grant?.lastVerifiedAt, VERIFIED_AT);
});

test("authorization: the grant survives a server restart", async () => {
  const { campaign, run } = startNinthCup();
  await readCollectiveState(campaign, { sessionId: run.sessionId, reader: liveAt(2) });

  // Simulate a restart: close the SQLite handle and drop the process-wide cache
  // so the next read opens the same file from scratch.
  getDb().close();
  delete (globalThis as { __argMerchantDb?: unknown }).__argMerchantDb;

  const grant = getCollectiveAuthorization(run.sessionId, campaign.id);
  assert.equal(grant?.verifiedCount, 2, "the grant must be on disk, not in memory");

  const retained = await readCollectiveState(campaign, {
    sessionId: run.sessionId,
    reader: failingRead,
  });
  assert.equal(retained.phase, "unlocked");
  assert.equal(retained.authority, "previously_verified");
  assert.equal(retained.evidence?.text, EVIDENCE.text);
});

test("authorization: an authorized session keeps access through an ER outage, labelled previously verified", async () => {
  const { campaign, run } = startNinthCup();
  await readCollectiveState(campaign, {
    sessionId: run.sessionId,
    reader: liveAt(2),
    now: () => new Date(VERIFIED_AT),
  });

  const retained = await readCollectiveState(campaign, {
    sessionId: run.sessionId,
    reader: failingRead,
  });
  assert.equal(retained.phase, "unlocked");
  assert.equal(retained.authority, "previously_verified");
  assert.equal(retained.count, 2);
  assert.equal(retained.countSource, "stored");
  assert.equal(retained.erLive, null);
  assert.equal(retained.lastVerifiedAt, VERIFIED_AT);
  assert.match(retained.error ?? "", /getAccountInfo failed/);
  assert.equal(retained.evidence?.text, EVIDENCE.text);

  const summary = collectiveSummary(retained);
  assert.equal(summary?.locked, false);
  assert.equal(summary?.authority, "previously_verified");
  assert.equal(summary?.lastVerifiedAt, VERIFIED_AT);

  const view = withCollective(run.view(), retained);
  const sentence = collectiveSentence(view);
  assert.match(sentence, /previously|earlier verification/);
  assert.match(sentence, /current Ephemeral Rollup read is unavailable/);
  const revisited = scriptedReply(view, "Revisit my earlier theories with the shared evidence").reply;
  assert.ok(revisited.includes(EVIDENCE.text));
});

test("authorization: a different session stays locked during the same outage", async () => {
  const { campaign, run } = startNinthCup();
  await readCollectiveState(campaign, { sessionId: run.sessionId, reader: liveAt(2) });

  const other = playTo(campaign, NINTH_CUP.answers, "started", nextPlayer());
  const state = await readCollectiveState(campaign, {
    sessionId: other.sessionId,
    reader: failingRead,
  });
  assert.equal(state.phase, "unavailable");
  assert.equal(state.evidence, null);
  assert.equal(state.authority, "none");
  assert.equal(sessionMayReadCollective(state), false);
  assert.equal(collectiveSummary(state)?.locked, true);
  assert.equal(getCollectiveAuthorization(other.sessionId, campaign.id), null);
  assert.match(scriptedReply(withCollective(other.view(), state), "What can the other investigators add?").reply, /could not be read/i);
});

test("authorization: stored history cannot reintroduce the fragment without a grant", async () => {
  const { campaign, run } = startNinthCup();
  // A pre-patch transcript can contain the old or the current fragment text.
  saveCompanionMessage(run.sessionId, "assistant", `The shop's record says: “${EVIDENCE.text}”`, "scripted");
  saveCompanionMessage(
    run.sessionId,
    "assistant",
    "Two verified handoffs came back to the counter with the same correction. Both readers wrote the same word.",
    "scripted",
  );
  // A live model may quote one sentence instead of the whole fragment.
  saveCompanionMessage(
    run.sessionId,
    "assistant",
    "A page torn from the roastery's old order ledger, kept flat behind the register.",
    "live",
  );

  const locked = await readCollectiveState(campaign, { sessionId: run.sessionId, reader: liveAt(1) });
  const lockedView = withCollective(run.view(), locked);
  assert.equal(sessionMayReadCollective(locked), false);

  const visible = historyFor(lockedView);
  assert.ok(!JSON.stringify(visible).includes(EVIDENCE.text));
  assert.ok(!JSON.stringify(visible).includes("Two verified handoffs came back"));
  assert.equal(visible.length, 0, "only restricted history existed, so nothing is sent");

  const prompt = JSON.stringify(
    buildProviderMessages(companionContextSnapshot(lockedView, visible), lockedView, "Revisit my earlier theories"),
  );
  assert.ok(!prompt.includes(EVIDENCE.text));
  assert.ok(!prompt.includes("Two verified handoffs came back"));

  // The same transcript is legitimate history for a session with its own grant.
  const authorized = await readCollectiveState(campaign, { sessionId: run.sessionId, reader: liveAt(2) });
  const authorizedView = withCollective(run.view(), authorized);
  assert.equal(sessionMayReadCollective(authorized), true);
  const kept = historyFor(authorizedView);
  assert.equal(kept.length, 3);
  assert.ok(JSON.stringify(kept).includes(EVIDENCE.text));
});

test("authorization: GET /companion and the outbound provider request agree with the current policy", async () => {
  const { campaign, run } = startNinthCup();
  saveCompanionMessage(run.sessionId, "assistant", `Story: ${EVIDENCE.text}`, "scripted");

  const live = await readCollectiveState(campaign, { sessionId: run.sessionId, reader: liveAt(2) });
  await readCollectiveState(campaign, { sessionId: run.sessionId, reader: failingRead }).then((retained) => {
    assert.equal(retained.authority, "previously_verified");
  });
  const locked = await readCollectiveState(campaign, {
    sessionId: playTo(campaign, NINTH_CUP.answers, "started", nextPlayer()).sessionId,
    reader: failingRead,
  });

  for (const state of [live, locked] as CollectiveState[]) {
    const allow = sessionMayReadCollective(state);
    const summary = collectiveSummary(state);
    assert.equal(summary?.locked, !allow);
    assert.equal(summary?.evidence === null, !allow);
    const messages = listCompanionMessages(run.sessionId, 40, { allowCollective: allow });
    assert.equal(
      messages.some((message) => containsRestrictedCollective(message.content)),
      allow,
      `history policy disagrees with the gate (${state.phase}/${state.authority})`,
    );
  }
});

test("authorization: a grant for one campaign never unlocks another", async () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const booth = createSecondBooth();
  const run = playTo(campaign, NINTH_CUP.answers, "started", nextPlayer());
  await readCollectiveState(campaign, { sessionId: run.sessionId, reader: liveAt(2) });
  assert.equal(getCollectiveAuthorization(run.sessionId, campaign.id)?.verifiedCount, 2);

  const other = await readCollectiveState(booth, {
    sessionId: run.sessionId,
    reader: failingRead,
  });
  assert.equal(other.phase, "unavailable");
  assert.equal(other.evidence, null);
  assert.equal(other.authority, "none");
  assert.equal(getCollectiveAuthorization(run.sessionId, booth.id), null);
});

test("provenance: the fragment is attributed as prewritten fiction, not player observations", () => {
  assert.equal(EVIDENCE.source, COLLECTIVE_SOURCE);
  assert.equal(
    EVIDENCE.source,
    "Prewritten story fragment · unlocked when the campaign's MagicBlock milestone reaches 2.",
  );
  const text = `${EVIDENCE.title} ${EVIDENCE.text} ${EVIDENCE.source}`;
  assert.match(text, /ledger/i);
  assert.doesNotMatch(text, /two verified handoffs came back|both readers|compiled from/i);
  assert.doesNotMatch(text, /players? (wrote|observed|reported|counted)/i);
  assert.doesNotMatch(text, /\b(?:5|11|19)\b/);
  assert.doesNotMatch(text, /not arithmetic|non-arithmetic|stops looking like arithmetic/i);
  assert.equal(collectiveSummary(buildCollectiveState(campaignBySlug(NINTH_CUP.slug), read({ erValue: 2, baseValue: 2 })))?.evidence?.source, COLLECTIVE_SOURCE);
});

test("authorization: a collective grant never releases this player's own product clue", async () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const requested = playTo(campaign, NINTH_CUP.answers, "requested", nextPlayer());
  const unlocked = withCollective(
    requested.view(),
    await readCollectiveState(campaign, { sessionId: requested.sessionId, reader: liveAt(2) }),
  );
  assert.equal(unlocked.collective?.phase, "unlocked");
  assert.equal(unlocked.optional.claim?.status, "requested");
  assert.equal(unlocked.optional.clue, null);
  assert.equal(unlocked.optional.final.question, "");

  const stranger = playTo(campaign, NINTH_CUP.answers, "started", nextPlayer());
  const strangerView = withCollective(
    stranger.view(),
    await readCollectiveState(campaign, { sessionId: stranger.sessionId, reader: liveAt(2) }),
  );
  assert.equal(strangerView.collective?.phase, "unlocked");
  assert.equal(strangerView.optional.claim, null, "another session's claim must not appear here");
  assert.equal(strangerView.optional.clue, null);
});
