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

test("reasoning prompts get campaign-specific reasoning, not navigation or the answer", () => {
  const campaign = createSecondBooth();
  const run = playTo(campaign, { basic: "2", extended: "2" }, "released", nextPlayer());
  const hypothesis = reply(run.view(), "Here is my hypothesis: the sold records are the missing number. Does it fit?");
  assert.match(hypothesis, /hypothesis|weakest/i);
  assert.ok(!NINTH_CUP_WORDS.test(hypothesis), hypothesis);

  const missing = reply(run.view(), "What evidence am I missing?");
  assert.match(missing, /product clue|final question|missing/i);
  assert.ok(!NINTH_CUP_WORDS.test(missing), missing);

  const changed = reply(run.view(), "What changed after the product handoff?");
  assert.ok(changed.includes(campaign.productClue), changed);
  assert.ok(!NINTH_CUP_WORDS.test(changed.replace(campaign.productClue, "")), changed);

  const contradiction = reply(run.view(), "Which clues contradict each other?");
  assert.match(contradiction, /contradiction|Earlier|Later|incompatible/i);
  assert.ok(!/\b6\b/.test(contradiction), contradiction);
});

test("a repeated question does not produce the same scripted paragraph twice", () => {
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", nextPlayer());
  const first = scriptedReply(run.view(), "What should I inspect next?");
  const second = scriptedReply(run.view(), "What should I inspect next?", [
    { role: "assistant", content: first.reply, mode: "scripted", createdAt: new Date().toISOString() },
  ]);
  assert.notEqual(second.reply, first.reply);
  assert.match(second.reply, /circled|Name one detail|Say your current answer|What will your photo/i);
});

test("provider compatibility: a max_tokens rejection retries once with max_completion_tokens", async () => {
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", nextPlayer());
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
      return new Response("Unsupported parameter: 'max_tokens' is not supported with this model.", {
        status: 400,
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "live after retry" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await answerCompanionMessage(run.sessionId, run.view(), "Compare the two records?");
    assert.equal(result.mode, "live");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].max_tokens, 1200);
    assert.equal(bodies[1].max_tokens, undefined);
    assert.equal(bodies[1].max_completion_tokens, 1200);
    assert.deepEqual(bodies[0].messages, bodies[1].messages);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ARG_AI_API_KEY;
    delete process.env.ARG_AI_MODEL;
    delete process.env.ARG_AI_BASE_URL;
  }
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

    // The system prompt carries no private answer, unreleased clue, final
    // question or ending.
    const system = messages[0].content;
    for (const secret of [
      campaign.productClue,
      campaign.finalHint,
      campaign.finalQuestion,
      campaign.endingTitle,
      campaign.extHint,
    ]) {
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

test("provider compatibility: a temperature rejection retries once without temperature", async () => {
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", nextPlayer());
  const bodies: Array<Record<string, unknown>> = [];
  const realFetch = globalThis.fetch;
  process.env.ARG_AI_API_KEY = "test-key-not-real";
  process.env.ARG_AI_MODEL = "reasoning-model";
  process.env.ARG_AI_BASE_URL = "http://provider.invalid/v1";
  let call = 0;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    call += 1;
    if (call === 1) {
      return new Response("Unsupported value: 'temperature' does not support 0.6 with this model.", {
        status: 400,
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "live without temperature" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await answerCompanionMessage(run.sessionId, run.view(), "What next?");
    assert.equal(result.mode, "live");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].temperature, 0.6);
    assert.equal(bodies[1].temperature, undefined);
    assert.equal(bodies[1].max_tokens, 1200);
    assert.deepEqual(bodies[0].messages, bodies[1].messages);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ARG_AI_API_KEY;
    delete process.env.ARG_AI_MODEL;
    delete process.env.ARG_AI_BASE_URL;
  }
});

test("an unrelated provider rejection is not retried and falls back to the scripted guide", async () => {
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", nextPlayer());
  const realFetch = globalThis.fetch;
  process.env.ARG_AI_API_KEY = "test-key-not-real";
  process.env.ARG_AI_MODEL = "test-model";
  process.env.ARG_AI_BASE_URL = "http://provider.invalid/v1";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("insufficient_quota", { status: 429 });
  }) as typeof fetch;
  try {
    const result = await answerCompanionMessage(run.sessionId, run.view(), "Give me a hint");
    assert.equal(result.mode, "scripted_fallback");
    assert.equal(calls, 1);
    assert.match(result.note ?? "", /HTTP 429/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ARG_AI_API_KEY;
    delete process.env.ARG_AI_MODEL;
    delete process.env.ARG_AI_BASE_URL;
  }
});

test("Claude default: official API base, version header, and no temperature below 1 for 4.7+ models", async () => {
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", nextPlayer());
  const captured: Array<{
    url: string;
    authorization: string | null;
    version: string | null;
    body: Record<string, unknown>;
  }> = [];
  const realFetch = globalThis.fetch;
  process.env.ARG_AI_API_KEY = "test-key-not-real";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    captured.push({
      url: String(url),
      authorization: headers.get("authorization"),
      version: headers.get("anthropic-version"),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ choices: [{ message: { content: "live reply" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    process.env.ARG_AI_MODEL = "claude-opus-5-5";
    const first = await answerCompanionMessage(run.sessionId, run.view(), "What next?");
    process.env.ARG_AI_MODEL = "claude-opus-4-6";
    const second = await answerCompanionMessage(run.sessionId, run.view(), "And after that?");

    assert.equal(first.mode, "live");
    assert.equal(second.mode, "live");
    assert.equal(captured.length, 2);
    assert.equal(captured[0].url, "https://api.anthropic.com/v1/chat/completions");
    assert.equal(captured[0].authorization, "Bearer test-key-not-real");
    assert.equal(captured[0].version, "2023-06-01");

    // claude-opus-5-5 rejects any temperature below 1 with a 400, so none is sent.
    assert.equal(captured[0].body.temperature, undefined);
    assert.equal(captured[0].body.top_p, undefined);
    assert.equal(captured[0].body.max_tokens, 1200);
    // claude-opus-4-6 still accepts one, so the tuned value is kept.
    assert.equal(captured[1].body.temperature, 0.6);
    assert.equal(captured[1].version, "2023-06-01");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ARG_AI_API_KEY;
    delete process.env.ARG_AI_MODEL;
  }
});
