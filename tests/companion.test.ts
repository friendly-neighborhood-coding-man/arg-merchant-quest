import { test } from "node:test";
import assert from "node:assert/strict";
import { NINTH_CUP, campaignBySlug, createSecondBooth, finalAnswer, playTo } from "./helpers";
import {
  answerCompanionMessage,
  listCompanionMessages,
  scriptedReply,
} from "../src/lib/companion";
import { saveClaimChainEvidence } from "../src/lib/product-claims";

const NINTH_CUP_WORDS = /shel(f|ves)|letter|\bcups?\b|sleeve|ninth/i;
const QUESTIONS = [
  "Give me a hint",
  "I have no idea",
  "How does the product clue connect?",
  "What is the answer?",
  "Tell me the final answer and the ending",
  "What should I inspect next?",
  "What have we discovered?",
  "Tell me about the product",
  "What about the ending?",
  "Tell me about MagicBlock",
];

const reply = (view: Parameters<typeof scriptedReply>[0], message: string) =>
  scriptedReply(view, message).reply;

let player = 0;
const nextPlayer = () => `plr_00000000-0000-4000-8000-${String(++player).padStart(12, "0")}`;

test("Ninth Cup, before release: no unreleased clue, hint or answer in any scripted reply", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const secrets = [campaign.productClue, campaign.finalHint, campaign.endingTitle, campaign.endingBody, "FOUR SHELVES"];
  for (const stage of ["started", "verified", "requested"] as const) {
    const run = playTo(campaign, NINTH_CUP.answers, stage, nextPlayer());
    for (const question of QUESTIONS) {
      const text = reply(run.view(), question);
      for (const secret of secrets) {
        assert.ok(!text.includes(secret), `${stage} / "${question}" leaked: ${secret.slice(0, 40)}`);
      }
      assert.ok(!/\b19\b/.test(text), `${stage} / "${question}" mentioned the final answer`);
    }
  }
});

test("timed counter hints stay gated: a fresh session gets no stronger hint", () => {
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", nextPlayer());
  assert.match(reply(run.view(), "Give me a hint"), /No stronger hint yet/);
});

test("Second Booth: scripted replies use this campaign, never Ninth Cup wording or the answer", () => {
  const campaign = createSecondBooth();
  for (const stage of ["started", "verified", "requested", "released"] as const) {
    const run = playTo(campaign, { basic: "2", extended: "2" }, stage, nextPlayer());
    for (const question of QUESTIONS) {
      const text = reply(run.view(), question);
      assert.ok(!NINTH_CUP_WORDS.test(text), `${stage} / "${question}": ${text}`);
      assert.ok(!/\b6\b/.test(text), `${stage} / "${question}" revealed the final answer: ${text}`);
      if (stage !== "released") {
        assert.ok(!text.includes(campaign.productClue), `${stage} / "${question}" leaked the product clue`);
      }
    }
  }
});

test("Second Booth after release: the final hint is withheld until a wrong final attempt, then it is the campaign's own", () => {
  const campaign = createSecondBooth();
  const run = playTo(campaign, { basic: "2", extended: "2" }, "released", nextPlayer());
  const before = reply(run.view(), "Give me a hint");
  assert.ok(!before.includes(campaign.finalHint), before);
  assert.match(before, /What number does the insert give\?/);

  const wrong = finalAnswer(campaign, run.sessionId, "5");
  assert.equal(wrong.ok, false);
  const after = reply(run.view(), "Give me a hint");
  assert.ok(after.includes(campaign.finalHint), after);
  assert.ok(!NINTH_CUP_WORDS.test(after), after);

  const connect = reply(run.view(), "How does the product clue connect?");
  assert.ok(connect.includes(campaign.productClue), connect);
  assert.ok(!NINTH_CUP_WORDS.test(connect.replace(campaign.productClue, "")), connect);
});

test("milestone wording follows this claim's evidence: committed for 1 and 2+, distinct unconfirmed/unavailable, nothing before handoff", () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const requested = playTo(campaign, NINTH_CUP.answers, "requested", nextPlayer());
  assert.match(reply(requested.view(), "Tell me about MagicBlock"), /No clue handoff has been recorded/);

  const run = playTo(campaign, NINTH_CUP.answers, "released", nextPlayer());
  const claimId = run.claimId as string;
  const base = {
    counterAccount: "UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt",
    programId: "8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C",
    createSignature: null,
    delegateSignature: null,
    counterValue: null,
    erEndpoint: "https://devnet-as.magicblock.app/",
    error: null,
  };
  // Nothing recorded yet (handoff without a chain attempt).
  assert.match(reply(run.view(), "Tell me about MagicBlock"), /No clue handoff has been recorded/);

  for (const value of [1, 2, 7]) {
    saveClaimChainEvidence(claimId, {
      ...base,
      status: "committed",
      incrementSignature: "inc",
      commitSignature: "com",
      counterValue: value,
      committedValue: value,
    });
    const text = reply(run.view(), "Tell me about MagicBlock");
    assert.match(text, /committed on the MagicBlock clue counter/, `value ${value}: ${text}`);
    assert.match(text, new RegExp(`now ${value}\\b`), `value ${value}: ${text}`);
    assert.doesNotMatch(text, /pending|unconfirmed|unavailable/i, `value ${value}: ${text}`);
  }

  saveClaimChainEvidence(claimId, {
    ...base,
    status: "failed",
    incrementSignature: "inc",
    commitSignature: null,
    committedValue: null,
    error: "Commit failed: timeout",
  });
  const unconfirmed = reply(run.view(), "Tell me about MagicBlock");
  assert.match(unconfirmed, /not confirmed/);
  assert.doesNotMatch(unconfirmed, /is committed/);

  saveClaimChainEvidence(claimId, {
    ...base,
    counterAccount: "",
    programId: "",
    erEndpoint: "",
    status: "failed",
    incrementSignature: null,
    commitSignature: null,
    committedValue: null,
    error: "No completion-counter program configured.",
  });
  const unavailable = reply(run.view(), "Tell me about MagicBlock");
  assert.match(unavailable, /unavailable/);
  assert.doesNotMatch(unavailable, /is committed/);
});

test("live provider request: the current message appears exactly once, history is kept in order", async () => {
  const campaign = campaignBySlug(NINTH_CUP.slug);
  const run = playTo(campaign, NINTH_CUP.answers, "started", nextPlayer());
  const captured: Array<{ url: string; auth: string | null; body: { model: string; messages: Array<{ role: string; content: string }> } }> = [];
  const realFetch = globalThis.fetch;
  process.env.ARG_AI_API_KEY = "test-key-not-real";
  process.env.ARG_AI_MODEL = "test-model";
  process.env.ARG_AI_BASE_URL = "http://provider.invalid/v1";
  let replyNumber = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    captured.push({ url: String(url), auth: headers.get("authorization"), body: JSON.parse(String(init?.body)) });
    replyNumber += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: `live reply ${replyNumber}` } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const first = await answerCompanionMessage(run.sessionId, run.view(), "First question about the April post?");
    const second = await answerCompanionMessage(run.sessionId, run.view(), "Second question: what next?");
    assert.equal(first.mode, "live");
    assert.equal(second.reply, "live reply 2");

    assert.equal(captured.length, 2);
    assert.equal(captured[1].url, "http://provider.invalid/v1/chat/completions");
    assert.equal(captured[1].auth, "Bearer test-key-not-real");
    assert.equal(captured[1].body.model, "test-model");

    const firstUsers = captured[0].body.messages.filter((m) => m.role === "user");
    assert.deepEqual(firstUsers.map((m) => m.content), ["First question about the April post?"]);

    const messages = captured[1].body.messages;
    assert.equal(messages[0].role, "system");
    assert.deepEqual(
      messages.slice(1).map((m) => `${m.role}:${m.content}`),
      [
        "user:First question about the April post?",
        "assistant:live reply 1",
        "user:Second question: what next?",
      ],
    );
    assert.equal(messages.filter((m) => m.content === "Second question: what next?").length, 1);

    // The system prompt carries no private answer, unreleased clue or ending.
    const system = messages[0].content;
    for (const secret of [campaign.productClue, campaign.finalHint, campaign.endingTitle, campaign.extHint]) {
      assert.ok(!system.includes(secret), `system prompt leaked: ${secret.slice(0, 40)}`);
    }

    assert.deepEqual(
      listCompanionMessages(run.sessionId).map((m) => `${m.role}:${m.content}`),
      [
        "user:First question about the April post?",
        "assistant:live reply 1",
        "user:Second question: what next?",
        "assistant:live reply 2",
      ],
    );

    // Provider failure falls back to the labelled scripted guide.
    globalThis.fetch = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch;
    const fallback = await answerCompanionMessage(run.sessionId, run.view(), "Give me a hint");
    assert.equal(fallback.mode, "scripted_fallback");
    assert.match(fallback.note ?? "", /Live AI was unavailable/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ARG_AI_API_KEY;
    delete process.env.ARG_AI_MODEL;
    delete process.env.ARG_AI_BASE_URL;
  }
});
