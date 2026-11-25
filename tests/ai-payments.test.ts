/**
 * P3 (revised) token-funded deep investigation.
 *
 * Everything here runs offline: the Devnet lookup and the Claude call are
 * injected, so the tests assert the server's decisions — who may pay, what the
 * chain must prove, and what happens when inference fails — without a network,
 * a wallet or an API key.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { campaignBySlug, NINTH_CUP, playTo } from "./helpers";
import { verifyPayment, type ParsedPayment } from "../src/lib/ai-payments/verify";
import { readAiPaymentsConfig, solanaPayUri } from "../src/lib/ai-payments/config";
import {
  beginCharge,
  countChargesToday,
  getCharge,
  getIntent,
  listIntents,
  type AiIntent,
} from "../src/lib/ai-payments/store";
import {
  aiAccessState,
  quoteDeepInvestigation,
  runDeepInvestigation,
  settleQuote,
  type ServiceDeps,
} from "../src/lib/ai-payments/service";

process.env.ARG_REWARD_MINT = "61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1";
process.env.ARG_AI_PAYMENT_RECEIVER = "DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N";
process.env.ARG_AI_API_KEY = "test-key";
process.env.ARG_AI_MODEL = "claude-opus-5-5";
process.env.ARG_AI_PAYMENTS_ENABLED = "true";
process.env.ARG_AI_MAX_PER_DAY = "10";

const PAYER = "payer-not-a-key";
let seq = 0;

function freshView() {
  seq += 1;
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", `plr_p3_${seq}`);
  return run.view();
}

function parsed(intent: AiIntent, overrides: Partial<ParsedPayment> = {}): ParsedPayment {
  return {
    signature: `sig-${seq}`,
    success: true,
    blockTimeMs: Date.now(),
    accountKeys: [intent.reference, PAYER],
    transfers: [
      {
        program: "spl-token",
        type: "transferChecked",
        source: "sourceAta",
        destination: intent.receiverAta,
        authority: PAYER,
        mint: intent.mint,
        amount: intent.amountBaseUnits,
      },
    ],
    destinationMints: {},
    ...overrides,
  };
}

function lookupReturning(payment: ParsedPayment | null, reason = "not found") {
  return async () => ({
    found: payment !== null,
    payment,
    scanned: 1,
    reason: payment ? null : reason,
  });
}

const fakeClaude = async () => ({
  content: "Observed: the ledger's reserved column is empty. Guess: the ninth cup is the reserved pour.",
  inputTokens: 1200,
  outputTokens: 300,
});

// ---------------------------------------------------------------- verification

test("P3 verify: a matching token transfer pays the intent", () => {
  const intent = {
    reference: "ref111",
    receiverAta: "ata111",
    mint: "mint111",
    amountBaseUnits: 200_000,
    notBeforeMs: Date.now() - 1000,
  };
  const payment: ParsedPayment = {
    signature: "sig-1",
    success: true,
    blockTimeMs: Date.now(),
    accountKeys: ["ref111", "payer"],
    transfers: [
      { program: "spl-token", type: "transferChecked", source: "src", destination: "ata111", authority: "payer", mint: "mint111", amount: 200_000 },
    ],
    destinationMints: {},
  };
  const verified = verifyPayment(payment, intent);
  assert.equal(verified.ok, true);
  assert.equal(verified.ok && verified.payer, "payer");
  assert.equal(verified.ok && verified.amountBaseUnits, 200_000);
});

test("P3 verify: wrong reference, failed transaction, wrong mint, wrong account, short amount, ambiguity and stale transfers are all rejected", () => {
  const intent = {
    reference: "ref111",
    receiverAta: "ata111",
    mint: "mint111",
    amountBaseUnits: 200_000,
    notBeforeMs: Date.now() - 1000,
  };
  const base: ParsedPayment = {
    signature: "sig",
    success: true,
    blockTimeMs: Date.now(),
    accountKeys: ["ref111", "payer"],
    transfers: [
      { program: "spl-token", type: "transferChecked", source: "src", destination: "ata111", authority: "payer", mint: "mint111", amount: 200_000 },
    ],
    destinationMints: {},
  };

  const cases: Array<[Partial<ParsedPayment>, string]> = [
    [{ accountKeys: ["payer"] }, "missing_reference"],
    [{ success: false }, "transaction_failed"],
    [{ transfers: [{ ...base.transfers[0], mint: "other" }] }, "wrong_mint"],
    [{ transfers: [{ ...base.transfers[0], destination: "ata999" }] }, "no_transfer"],
    [{ transfers: [{ ...base.transfers[0], amount: 199_999 }] }, "insufficient_amount"],
    [{ transfers: [base.transfers[0], base.transfers[0]] }, "ambiguous_transfer"],
    [{ blockTimeMs: Date.now() - 10 * 60 * 1000 }, "stale"],
    [{ blockTimeMs: null }, "stale"],
  ];
  for (const [override, code] of cases) {
    const result = verifyPayment({ ...base, ...override }, intent);
    assert.equal(result.ok, false, `expected ${code}`);
    assert.equal(!result.ok && result.code, code);
  }
});

test("P3 verify: a plain transfer is accepted only when the destination account's mint is confirmed", () => {
  const intent = {
    reference: "ref111",
    receiverAta: "ata111",
    mint: "mint111",
    amountBaseUnits: 200_000,
    notBeforeMs: Date.now() - 1000,
  };
  const plain: ParsedPayment = {
    signature: "sig",
    success: true,
    blockTimeMs: Date.now(),
    accountKeys: ["ref111"],
    transfers: [
      { program: "spl-token", type: "transfer", source: "src", destination: "ata111", authority: "payer", mint: null, amount: 200_000 },
    ],
    destinationMints: {},
  };
  assert.equal(verifyPayment(plain, intent).ok, false);
  assert.equal(verifyPayment({ ...plain, destinationMints: { ata111: "mint111" } }, intent).ok, true);
});

// --------------------------------------------------------------- configuration

test("P3 config: disabled without a mint or receiver, enabled and priced with them", () => {
  const mint = process.env.ARG_REWARD_MINT;
  const receiver = process.env.ARG_AI_PAYMENT_RECEIVER;
  delete process.env.ARG_REWARD_MINT;
  const noMint = readAiPaymentsConfig(process.env);
  assert.equal(noMint.ok, false);
  process.env.ARG_REWARD_MINT = mint;

  delete process.env.ARG_AI_PAYMENT_RECEIVER;
  const treasuryFallback = readAiPaymentsConfig(process.env);
  assert.equal(treasuryFallback.ok, false, "with no treasury file and no env receiver the config must refuse");
  process.env.ARG_AI_PAYMENT_RECEIVER = receiver;

  const config = readAiPaymentsConfig(process.env);
  assert.equal(config.ok, true);
  assert.equal(config.ok && config.config.priceBaseUnits, 200_000);
  assert.equal(config.ok && config.config.mint, "61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1");

  const uri = solanaPayUri({
    receiver: "DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N",
    mint: "61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1",
    amountBaseUnits: 200_000,
    decimals: 6,
    reference: "refABC",
    label: "ARG Merchant Quest",
    message: "Deep investigation",
  });
  assert.match(uri, /^solana:DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N\?/);
  assert.match(uri, /spl-token=61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1/);
  assert.match(uri, /amount=0\.200000/);
  assert.match(uri, /reference=refABC/);
});

// ------------------------------------------------------------------ quote flow

test("P3 quote: a quote is bound to the question, priced in the visit token, and shown as a Solana Pay link", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "How does the ledger page connect to the shelves?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;
  assert.equal(quote.amountBaseUnits, 200_000);
  assert.match(quote.payUri ?? "", /reference=/);
  assert.equal(quote.fundedByCredit, false);

  const intent = getIntent(quote.intentId);
  assert.equal(intent?.status, "quoted");
  assert.equal(intent?.question, "How does the ledger page connect to the shelves?");
  assert.equal(intent?.sessionId, view.sessionId);
});

test("P3 quote: open quotes are capped per session and the UI state reports price, balance and limits", async () => {
  const view = freshView();
  for (let index = 0; index < 3; index += 1) {
    const quote = await quoteDeepInvestigation(view, `Question number ${index} about the tally?`);
    assert.equal(quote.ok, true);
  }
  const fourth = await quoteDeepInvestigation(view, "A fourth open question about the shelves?");
  assert.equal(fourth.ok, false);
  assert.equal(!fourth.ok && fourth.code, "too_many_pending");

  const state = await aiAccessState(view);
  assert.equal(state.enabled, true);
  assert.equal(state.priceLabel, "0.200000 tUSDC");
  assert.equal(state.pending.length, 3);
  assert.equal(state.wallet, null);
  assert.match(state.disclosure, /Anthropic does not accept tokens/);
});

// ----------------------------------------------------------------- settlement

test("P3 settle: nothing on chain stays pending and the quote is not marked paid", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Which shelf holds the reserved pour?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;

  const outcome = await settleQuote(view, quote.intentId, new Date(), {
    lookupPayment: lookupReturning(null),
  });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.status, "pending");
  assert.equal(getIntent(quote.intentId)?.status, "quoted");
});

test("P3 settle: a verified payment marks the quote paid, and settling twice cannot credit it twice", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "What changed after the second handoff?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;
  const intent = getIntent(quote.intentId);
  assert.ok(intent);

  const outcome = await settleQuote(view, quote.intentId, new Date(), {
    lookupPayment: lookupReturning(parsed(intent)),
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.status, "paid");
  assert.equal(getIntent(quote.intentId)?.status, "paid");

  const again = await settleQuote(view, quote.intentId, new Date(), {
    lookupPayment: lookupReturning(parsed(intent)),
  });
  assert.equal(again.ok, true);
  assert.equal(again.ok && again.status, "already_paid");
});

test("P3 settle: an under-payment is rejected and the quote stays unpaid", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Is the reserved column a count?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;
  const intent = getIntent(quote.intentId);
  assert.ok(intent);

  const outcome = await settleQuote(view, quote.intentId, new Date(), {
    lookupPayment: lookupReturning(
      parsed(intent, {
        transfers: [{ ...parsed(intent).transfers[0], amount: 1 }],
      }),
    ),
  });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.code, "insufficient_amount");
  assert.equal(getIntent(quote.intentId)?.status, "quoted");
});

test("P3 settle: one chain signature cannot pay two different quotes", async () => {
  const first = freshView();
  const second = freshView();
  const quoteA = await quoteDeepInvestigation(first, "First paid question about the shelves?");
  const quoteB = await quoteDeepInvestigation(second, "Second paid question about the shelves?");
  assert.equal(quoteA.ok && quoteB.ok, true);
  if (!quoteA.ok || !quoteB.ok) return;

  const intentA = getIntent(quoteA.intentId);
  const intentB = getIntent(quoteB.intentId);
  assert.ok(intentA && intentB);

  const signature = "replayed-signature";
  const paid = await settleQuote(first, quoteA.intentId, new Date(), {
    lookupPayment: lookupReturning(parsed(intentA, { signature })),
  });
  assert.equal(paid.ok, true);

  const replay = await settleQuote(second, quoteB.intentId, new Date(), {
    lookupPayment: lookupReturning(
      parsed(intentB, { signature, accountKeys: [intentB.reference, PAYER] }),
    ),
  });
  assert.equal(replay.ok, false);
  assert.equal(!replay.ok && replay.code, "signature_replayed");
});

// ----------------------------------------------------------------- inference

test("P3 investigation: one paid quote yields exactly one Claude call with usage and cost, and a repeat returns the stored reply", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Compare the ledger with the top shelf?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;
  const intent = getIntent(quote.intentId);
  assert.ok(intent);
  await settleQuote(view, quote.intentId, new Date(), { lookupPayment: lookupReturning(parsed(intent)) });

  let calls = 0;
  const complete: NonNullable<ServiceDeps["complete"]> = async (input) => {
    calls += 1;
    assert.match(input.messages.at(-1)?.content ?? "", /token-funded deep investigation/);
    return fakeClaude();
  };
  const first = await runDeepInvestigation(view, quote.intentId, new Date(), { complete });
  assert.equal(first.status, "ok");
  assert.equal(first.mode, "paid_ai");
  assert.equal(first.model, "claude-opus-5-5");
  assert.deepEqual(first.usage, { inputTokens: 1200, outputTokens: 300 });
  assert.equal(Math.round((first.estimatedCostUsd ?? 0) * 1e6) / 1e6, 0.0108);
  assert.equal(first.receipt?.signature.startsWith("sig-"), true);

  const repeat = await runDeepInvestigation(view, quote.intentId, new Date(), { complete });
  assert.equal(repeat.reply, first.reply);
  assert.equal(calls, 1, "the same intent never bills a second inference");
  assert.equal(getCharge(quote.intentId)?.status, "ok");
  assert.equal(countChargesToday(view.sessionId), 1);
});

test("P3 investigation: an unpaid quote cannot run inference", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Can I run this without paying?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;

  const result = await runDeepInvestigation(view, quote.intentId, new Date(), { complete: fakeClaude });
  assert.equal(result.status, "unpaid");
  assert.equal(result.reply, null);
  assert.equal(getIntent(quote.intentId)?.status, "quoted");
});

test("P3 investigation: a failed Claude call records the failure and grants one free retry", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "What if the room has five shelves?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;
  const intent = getIntent(quote.intentId);
  assert.ok(intent);
  await settleQuote(view, quote.intentId, new Date(), { lookupPayment: lookupReturning(parsed(intent)) });

  const failed = await runDeepInvestigation(view, quote.intentId, new Date(), {
    complete: async () => {
      throw new Error("AI provider timed out after 45 seconds.");
    },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.refunded, true);
  assert.match(failed.reason ?? "", /credit was restored/);
  assert.equal(getIntent(quote.intentId)?.status, "refund_owed");

  // The replacement request is funded by the refund credit: no second payment.
  const retry = await quoteDeepInvestigation(view, "What if the room has five shelves?");
  assert.equal(retry.ok, true);
  if (!retry.ok) return;
  assert.equal(retry.fundedByCredit, true);
  assert.equal(retry.payUri, null);

  const retried = await runDeepInvestigation(view, retry.intentId, new Date(), { complete: fakeClaude });
  assert.equal(retried.status, "ok");
  assert.equal(retried.refunded, false);
});

test("P3 limits: the per-session daily cap stops new quotes after a paid investigation", async () => {
  const view = freshView();
  process.env.ARG_AI_MAX_PER_DAY = "1";
  try {
    const quote = await quoteDeepInvestigation(view, "One paid question about the tally?");
    assert.equal(quote.ok, true);
    if (!quote.ok) return;
    const intent = getIntent(quote.intentId);
    assert.ok(intent);
    await settleQuote(view, quote.intentId, new Date(), { lookupPayment: lookupReturning(parsed(intent)) });
    const result = await runDeepInvestigation(view, quote.intentId, new Date(), { complete: fakeClaude });
    assert.equal(result.status, "ok");

    const next = await quoteDeepInvestigation(view, "A second paid question today?");
    assert.equal(next.ok, false);
    assert.equal(!next.ok && next.code, "session_limit");
  } finally {
    process.env.ARG_AI_MAX_PER_DAY = "10";
  }
});

test("P3 limits: the aggregate daily budget refuses inference and restores the credit", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "A question that would exceed today's budget?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;
  const intent = getIntent(quote.intentId);
  assert.ok(intent);
  await settleQuote(view, quote.intentId, new Date(), { lookupPayment: lookupReturning(parsed(intent)) });

  process.env.ARG_AI_DAILY_USD_LIMIT = "0.0000001";
  try {
    const result = await runDeepInvestigation(view, quote.intentId, new Date(), { complete: fakeClaude });
    assert.equal(result.status, "limit");
    assert.equal(result.refunded, true);
  } finally {
    delete process.env.ARG_AI_DAILY_USD_LIMIT;
  }
});

test("P3 store: a consumed intent opens one charge only", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Charge bookkeeping question about the shelves?");
  assert.equal(quote.ok, true);
  if (!quote.ok) return;
  const intent = getIntent(quote.intentId);
  assert.ok(intent);
  await settleQuote(view, quote.intentId, new Date(), { lookupPayment: lookupReturning(parsed(intent)) });

  const first = beginCharge(intent.id, view.sessionId);
  assert.equal(first.ok, true);
  const second = beginCharge(intent.id, view.sessionId);
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.code, "duplicate");
  assert.equal(listIntents(view.sessionId).length, 1);
});
