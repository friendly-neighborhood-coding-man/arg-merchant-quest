/**
 * P3 native MagicBlock payment: rollup verification and settlement.
 *
 * Everything runs offline. The rollup RPC, the hosted payments API and the demo
 * payer are injected, so these tests assert the server's rules — what a rollup
 * transaction must prove before inference is allowed — without a network, a
 * wallet write or an API key.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

import { campaignBySlug, NINTH_CUP, playTo } from "./helpers";
import {
  erMemo,
  parseErTransaction,
  verifyErTransfer,
  type ErFacts,
} from "../src/lib/ai-payments/er/verify";
import type { BuiltTransaction } from "../src/lib/ai-payments/er/client";
import { prepareNativePayment } from "../src/lib/ai-payments/er/pay";
import { readAiPaymentsConfig } from "../src/lib/ai-payments/config";
import { getIntent, recordNativeSubmission } from "../src/lib/ai-payments/store";
import {
  aiAccessState,
  prepareNativeQuote,
  quoteDeepInvestigation,
  runDeepInvestigation,
  settleNativeQuote,
} from "../src/lib/ai-payments/service";

process.env.ARG_REWARD_MINT = "61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1";
process.env.ARG_AI_PAYMENT_RECEIVER = "DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N";
process.env.ARG_AI_API_KEY = "test-key";
process.env.ARG_AI_MODEL = "claude-opus-5-5";
process.env.ARG_AI_PAYMENTS_ENABLED = "true";
process.env.ARG_AI_MAX_PER_DAY = "10";
delete process.env.ARG_AI_DEMO_PAYER_KEY;

const MINT = "61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1";
const VALIDATOR = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";
const DEMO_PAYER = Keypair.generate();
const PAYER = DEMO_PAYER.publicKey.toBase58();

let seq = 0;
function freshView() {
  seq += 1;
  const run = playTo(campaignBySlug(NINTH_CUP.slug), NINTH_CUP.answers, "started", `plr_p3n_${seq}`);
  return run.view();
}

function config() {
  const result = readAiPaymentsConfig();
  if (!result.ok) throw new Error(result.reason);
  return result.config;
}

function facts(intentId: string, overrides: Partial<ErFacts> = {}): ErFacts {
  return {
    signature: `er-${intentId}`,
    err: null,
    memo: erMemo(intentId),
    transfers: [
      {
        mint: MINT,
        destination: "receiver-ata",
        authority: PAYER,
        amount: "200000",
      },
    ],
    destinationDelta: "200000",
    slot: 1,
    blockTime: 1,
    ...overrides,
  };
}

function builtTransfer(): BuiltTransaction {
  const transaction = new Transaction().add(
    new TransactionInstruction({
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      keys: [],
      data: Buffer.from("probe"),
    }),
  );
  transaction.recentBlockhash = "11111111111111111111111111111111";
  transaction.feePayer = DEMO_PAYER.publicKey;
  return {
    kind: "transfer",
    version: "legacy",
    transactionBase64: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    sendTo: "ephemeral",
    validator: VALIDATOR,
    instructionCount: 1,
    requiredSigners: [PAYER],
    fees: { lamports: "0", tokens: "0" },
  };
}

// --------------------------------------------------------------- parsing facts

test("P3 native: parses a parsed rollup transfer with its memo and balance delta", () => {
  const raw = {
    meta: {
      err: null,
      preTokenBalances: [{ accountIndex: 1, mint: MINT, uiTokenAmount: { amount: "300" } }],
      postTokenBalances: [{ accountIndex: 1, mint: MINT, uiTokenAmount: { amount: "500" } }],
    },
    transaction: {
      message: {
        accountKeys: [{ pubkey: PAYER }, { pubkey: "receiver-ata" }],
        instructions: [
          {
            program: "spl-token",
            parsed: {
              type: "transferChecked",
              info: {
                mint: MINT,
                destination: "receiver-ata",
                authority: PAYER,
                tokenAmount: { amount: "200" },
              },
            },
          },
          { program: "spl-memo", parsed: "arg-ai:aipi_demo" },
        ],
      },
    },
    slot: 42,
    blockTime: 1_700_000_000,
  };

  const parsed = parseErTransaction(raw, "sig-parse");
  assert.ok(parsed);
  assert.equal(parsed.memo, "arg-ai:aipi_demo");
  assert.equal(parsed.transfers.length, 1);
  assert.equal(parsed.transfers[0].mint, MINT);
  assert.equal(parsed.transfers[0].amount, "200");
  assert.equal(parsed.destinationDelta, "200");
  assert.equal(parsed.err, null);
});

test("P3 native: an unparseable rollup response yields no facts", () => {
  assert.equal(parseErTransaction(null, "sig"), null);
  assert.equal(parseErTransaction({ meta: {} }, "sig"), null);
});

// ------------------------------------------------------------ rollup verifying

test("P3 native: a matching rollup transfer is accepted", () => {
  const result = verifyErTransfer(facts("aipi_ok"), {
    intentId: "aipi_ok",
    mint: MINT,
    destination: "receiver-ata",
    amountBaseUnits: 200_000,
    payer: PAYER,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amountBaseUnits, 200_000);
    assert.equal(result.payer, PAYER);
  }
});

test("P3 native: a failed rollup transaction is never a payment", () => {
  const result = verifyErTransfer(facts("aipi_fail", { err: { InstructionError: [0, "Custom"] } }), {
    intentId: "aipi_fail",
    mint: MINT,
    destination: "receiver-ata",
    amountBaseUnits: 200_000,
    payer: PAYER,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "failed");
});

test("P3 native: a transaction with no token transfer is rejected", () => {
  const result = verifyErTransfer(facts("aipi_none", { transfers: [] }), {
    intentId: "aipi_none",
    mint: MINT,
    destination: "receiver-ata",
    amountBaseUnits: 200_000,
    payer: PAYER,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "no_transfer");
});

test("P3 native: a transfer of another token is rejected", () => {
  const result = verifyErTransfer(
    facts("aipi_mint", {
      transfers: [
        { mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", destination: "receiver-ata", authority: PAYER, amount: "200000" },
      ],
    }),
    { intentId: "aipi_mint", mint: MINT, destination: "receiver-ata", amountBaseUnits: 200_000, payer: PAYER },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "wrong_mint");
});

test("P3 native: a transfer to another recipient is rejected", () => {
  const result = verifyErTransfer(facts("aipi_dest"), {
    intentId: "aipi_dest",
    mint: MINT,
    destination: "someone-else",
    amountBaseUnits: 200_000,
    payer: PAYER,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "wrong_destination");
});

test("P3 native: a transfer authorized by another wallet is rejected", () => {
  const result = verifyErTransfer(facts("aipi_payer"), {
    intentId: "aipi_payer",
    mint: MINT,
    destination: "receiver-ata",
    amountBaseUnits: 200_000,
    payer: "another-wallet",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "wrong_payer");
});

test("P3 native: a transfer without this quote's memo is rejected", () => {
  const missing = verifyErTransfer(facts("aipi_memo", { memo: null }), {
    intentId: "aipi_memo",
    mint: MINT,
    destination: "receiver-ata",
    amountBaseUnits: 200_000,
    payer: PAYER,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "missing_memo");

  const wrong = verifyErTransfer(facts("aipi_memo", { memo: erMemo("aipi_other") }), {
    intentId: "aipi_memo",
    mint: MINT,
    destination: "receiver-ata",
    amountBaseUnits: 200_000,
    payer: PAYER,
  });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.code, "wrong_memo");
});

test("P3 native: an underpaid rollup transfer is rejected", () => {
  const result = verifyErTransfer(
    facts("aipi_small", {
      transfers: [{ mint: MINT, destination: "receiver-ata", authority: PAYER, amount: "1" }],
      destinationDelta: "1",
    }),
    { intentId: "aipi_small", mint: MINT, destination: "receiver-ata", amountBaseUnits: 200_000, payer: PAYER },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "insufficient_amount");
});

test("P3 native: a recipient balance that did not move by the amount is rejected", () => {
  const result = verifyErTransfer(facts("aipi_delta", { destinationDelta: "100" }), {
    intentId: "aipi_delta",
    mint: MINT,
    destination: "receiver-ata",
    amountBaseUnits: 200_000,
    payer: PAYER,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "balance_mismatch");
});

// ------------------------------------------------------------- service binding

test("P3 native: without a demo rollup wallet the path reports why", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Does the reserved column mean the ninth cup?", new Date(), {
    settlement: "er",
  });
  assert.ok(quote.ok);
  const prepared = await prepareNativeQuote(view, quote.intentId);
  assert.equal(prepared.ok, false);
  if (!prepared.ok) assert.equal(prepared.code, "no_demo_payer");
});

test("P3 native: an uninitialized mint is refused instead of guessed at", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Is the reserved column a count?", new Date(), {
    settlement: "er",
  });
  assert.ok(quote.ok);
  const prepared = await prepareNativeQuote(view, quote.intentId, new Date(), {
    payer: DEMO_PAYER,
    mintState: async () => ({ initialized: false, validator: VALIDATOR, transferQueue: null }),
  });
  assert.equal(prepared.ok, false);
  if (!prepared.ok) assert.equal(prepared.code, "needs_mint_init");
});

test("P3 native: settlement waits for a submitted rollup transaction", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "What does the till ledger omit?", new Date(), {
    settlement: "er",
  });
  assert.ok(quote.ok);
  const settled = await settleNativeQuote(view, quote.intentId);
  assert.equal(settled.ok, false);
  if (!settled.ok) assert.equal(settled.status, "pending");
});

test("P3 native: a base-layer quote is not settled by the rollup verifier", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Could the cup be a marker?", new Date(), {
    settlement: "base",
  });
  assert.ok(quote.ok);
  if (!quote.ok) return;
  assert.equal(quote.settlement, "base");
  assert.ok(quote.payUri?.startsWith("solana:"));
  const settled = await settleNativeQuote(view, quote.intentId);
  assert.equal(settled.ok, false);
  if (!settled.ok) assert.equal(settled.code, "not_native");
});

test("P3 native: prepare, verify, then one paid inference (and a replay is refused)", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Why is the ninth cup reserved?", new Date(), {
    settlement: "er",
  });
  assert.ok(quote.ok);
  if (!quote.ok) return;
  const intent = getIntent(quote.intentId);
  assert.ok(intent);
  const ata = intent.receiverAta;
  const paidFacts = (signature: string): ErFacts =>
    facts(quote.intentId, {
      signature,
      transfers: [{ mint: MINT, destination: ata, authority: PAYER, amount: "200000" }],
      destinationDelta: "200000",
    });

  const prepared = await prepareNativeQuote(view, quote.intentId, new Date(), {
    payer: DEMO_PAYER,
    mintState: async () => ({ initialized: true, validator: VALIDATOR, transferQueue: "queue" }),
    ownerBalance: async (owner) => ({
      owner,
      ata: "ata",
      baseBalance: 1_000_000,
      delegated: true,
    }),
    buildErTransfer: async () => builtTransfer(),
    submitAndConfirm: async () => ({ signature: `er-${quote.intentId}`, confirmation: "er-confirmed" }),
    fetchErFacts: async (signature) => paidFacts(signature),
    erOwnerBalance: async () => 200_000,
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.confirmation, "er-confirmed");
  assert.equal(prepared.depositSignature, null);
  assert.equal(getIntent(quote.intentId)?.status, "quoted");

  const settled = await settleNativeQuote(view, quote.intentId, new Date(), {
    fetchErFacts: async (signature) => paidFacts(signature),
  });
  assert.equal(settled.ok, true);
  if (!settled.ok) return;
  assert.equal(settled.status, "paid");
  assert.equal(settled.receipt.settlement, "er");
  assert.equal(settled.receipt.l1Settled, false);
  assert.match(settled.receipt.settlementNote, /not L1 commitment/);

  const again = await settleNativeQuote(view, quote.intentId, new Date(), {
    fetchErFacts: async (signature) => paidFacts(signature),
  });
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.status, "already_paid");

  const inference = await runDeepInvestigation(view, quote.intentId, new Date(), {
    complete: async () => ({ content: "The reserved column is a marker, not a count.", inputTokens: 900, outputTokens: 250 }),
  });
  assert.equal(inference.status, "ok");
  assert.equal(inference.receipt?.settlement, "er");
  assert.ok((inference.estimatedCostUsd ?? 0) > 0);

  const repeat = await runDeepInvestigation(view, quote.intentId, new Date(), {
    complete: async () => {
      throw new Error("must not run twice");
    },
  });
  assert.equal(repeat.status, "ok");
  assert.equal(repeat.usage?.inputTokens, 900);

  // A second quote cannot reuse the first quote's rollup signature.
  const second = await quoteDeepInvestigation(view, "What if the cup is a tally?", new Date(), {
    settlement: "er",
  });
  assert.ok(second.ok);
  if (!second.ok) return;
  const stored = recordNativeSubmission(second.intentId, {
    signature: `er-${quote.intentId}`,
    depositSignature: null,
    payer: PAYER,
    validator: VALIDATOR,
    erEndpoint: "https://devnet-as.magicblock.app",
    payerBalanceBefore: 1,
    payerBalanceAfter: 1,
    receiverBalanceBefore: 0,
    receiverBalanceAfter: 0,
  });
  assert.equal(stored, false);
});

test("P3 native: an underpaid rollup transfer never unlocks inference", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Is the ledger column a decoy?", new Date(), {
    settlement: "er",
  });
  assert.ok(quote.ok);
  if (!quote.ok) return;

  recordNativeSubmission(quote.intentId, {
    signature: `er-small-${quote.intentId}`,
    depositSignature: null,
    payer: PAYER,
    validator: VALIDATOR,
    erEndpoint: "https://devnet-as.magicblock.app",
    payerBalanceBefore: 1,
    payerBalanceAfter: 1,
    receiverBalanceBefore: 0,
    receiverBalanceAfter: 0,
  });

  const ata = getIntent(quote.intentId)?.receiverAta ?? "";
  const settled = await settleNativeQuote(view, quote.intentId, new Date(), {
    fetchErFacts: async (signature) =>
      facts(quote.intentId, {
        signature,
        transfers: [{ mint: MINT, destination: ata, authority: PAYER, amount: "1" }],
        destinationDelta: "1",
      }),
  });
  assert.equal(settled.ok, false);
  if (!settled.ok) assert.equal(settled.code, "insufficient_amount");
  assert.equal(getIntent(quote.intentId)?.status, "quoted");

  const inference = await runDeepInvestigation(view, quote.intentId, new Date(), {
    complete: async () => ({ content: "should not run", inputTokens: 1, outputTokens: 1 }),
  });
  assert.equal(inference.status, "unpaid");
});

test("P3 native: prepare stays inside the quote it was bound to", async () => {
  const view = freshView();
  const quote = await quoteDeepInvestigation(view, "Does the receipt row prove anything?", new Date(), {
    settlement: "er",
  });
  assert.ok(quote.ok);
  if (!quote.ok) return;

  const outcome = await prepareNativePayment(
    {
      id: quote.intentId,
      mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      receiver: config().receiver,
      receiverAta: "receiver-ata",
      amountBaseUnits: 200_000,
    },
    config(),
    { payer: DEMO_PAYER },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "mint_mismatch");
});

test("P3 native: a recipient without a rollup balance blocks the payment", async () => {
  const outcome = await prepareNativePayment(
    {
      id: "aipi_receiver",
      mint: MINT,
      receiver: config().receiver,
      receiverAta: "receiver-ata",
      amountBaseUnits: 200_000,
    },
    config(),
    {
      payer: DEMO_PAYER,
      mintState: async () => ({ initialized: true, validator: VALIDATOR, transferQueue: "queue" }),
      ownerBalance: async (owner) => ({
        owner,
        ata: "ata",
        baseBalance: 1_000_000,
        delegated: owner === PAYER,
      }),
    },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "receiver_not_delegated");
});

test("P3 native: state reports no rollup path when no demo wallet exists", async () => {
  const view = freshView();
  const state = await aiAccessState(view);
  assert.equal(state.native.available, false);
  assert.match(state.native.reason ?? "", /no rollup demo wallet/i);
});
