/**
 * Token-funded deep investigation.
 *
 * Flow: verified visit → existing Devnet reward → the player's wallet holds the
 * visit token → they ask Mara for a deeper investigation → the server issues a
 * quote bound to that exact question → the player pays the quote from their own
 * wallet (Solana Pay) → the server finds and verifies the transfer on Devnet →
 * one Claude Opus 5.5 call runs → the reply, the usage/cost and a payment
 * receipt are returned.
 *
 * The free companion, the trail, the hints and the reward are untouched: this is
 * an optional extra request, never a gate.
 */

import { createHash } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { explorerTx } from "../chain/config";
import { baseConnection } from "../chain/connections";
import { postChatCompletion } from "../ai-provider";
import { buildProviderMessages, companionContextSnapshot } from "../companion";
import type { QuestView } from "../quest-store";
import { readAiPaymentsConfig, solanaPayUri, tokenAmount, type AiPaymentsConfig } from "./config";
import { findPaymentForReference, type PaymentLookup } from "./rpc";
import { verifyPayment } from "./verify";
import { erConfig, fetchErFacts, mintState } from "./er/client";
import { demoPayer, prepareNativePayment, type NativeDeps } from "./er/pay";
import { verifyErTransfer, type ErFacts } from "./er/verify";
import {
  beginCharge,
  claimPayment,
  countChargesToday,
  countPendingIntents,
  countUnusedGrants,
  createIntent,
  finishCharge,
  getCharge,
  getIntent,
  listIntents,
  oweRefund,
  recordNativeSubmission,
  sumCostToday,
  takeGrant,
  type AiIntent,
} from "./store";

export interface AiPaymentReceipt {
  intentId: string;
  signature: string;
  payer: string;
  amountBaseUnits: number;
  amountLabel: string;
  explorerUrl: string;
  paidAt: string;
  /** "er" means the transfer executed on a MagicBlock Ephemeral Rollup. */
  settlement: "er" | "base";
  depositSignature: string | null;
  validator: string | null;
  /** ER confirmation is not L1 commitment; this stays false unless verified. */
  l1Settled: false;
  settlementNote: string;
}

const SETTLEMENT_NOTE_ER =
  "Settled on the MagicBlock Ephemeral Rollup (ER confirmation). This is not L1 commitment: the rollup has not been independently shown to have committed this transfer to Solana's base layer.";
const SETTLEMENT_NOTE_BASE =
  "Settled by an ordinary Solana Pay transfer on the base layer. This is not an Ephemeral Rollup payment.";

export interface NativePaymentState {
  available: boolean;
  reason: string | null;
  validator: string | null;
  erEndpoint: string | null;
  demoPayer: string | null;
  mintInitialized: boolean | null;
  transferQueue: string | null;
  label: string;
}

export interface AiAccessState {
  enabled: boolean;
  reason: string | null;
  cluster: "devnet";
  mint: string | null;
  symbol: string | null;
  decimals: number | null;
  priceBaseUnits: number | null;
  priceLabel: string | null;
  receiver: string | null;
  wallet: string | null;
  balanceBaseUnits: number | null;
  balanceLabel: string | null;
  model: string | null;
  remainingToday: number | null;
  refundCredits: number;
  native: NativePaymentState;
  pending: Array<{
    id: string;
    question: string;
    priceLabel: string;
    expiresAt: string;
    payUri: string | null;
    fundedByCredit: boolean;
    settlement: "er" | "base";
  }>;
  recent: Array<{
    id: string;
    status: string;
    signature: string | null;
    amountLabel: string;
    createdAt: string;
    explorerUrl: string | null;
  }>;
  disclosure: string;
}

/**
 * Injectable edges, used by the tests to replace the Devnet lookup and the
 * Claude call. Production always uses the defaults below.
 */
export interface ServiceDeps {
  lookupPayment?: (
    expected: { reference: string; receiver: string; receiverAta: string },
    options?: { limit?: number },
  ) => Promise<PaymentLookup>;
  complete?: (input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxTokens: number;
    timeoutMs: number;
  }) => Promise<{ content: string; inputTokens: number | null; outputTokens: number | null }>;
}

async function callClaude(input: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens: number;
  timeoutMs: number;
}): Promise<{ content: string; inputTokens: number | null; outputTokens: number | null }> {
  const { response } = await postChatCompletion({
    apiKey: input.apiKey,
    timeoutMs: input.timeoutMs,
    payload: {
      model: input.model,
      temperature: 0.6,
      max_tokens: input.maxTokens,
      messages: input.messages,
    },
  });
  if (!response.ok) throw new Error(`The AI provider returned HTTP ${response.status}.`);
  const data = (await response.json()) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error(
      data.choices?.[0]?.finish_reason === "length"
        ? "The model used the whole output budget before answering."
        : "The AI provider returned an empty reply.",
    );
  }
  return {
    content: text,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

const PAID_INVESTIGATION_NOTE =
  "This is the optional, token-funded deep investigation: a longer answer from the same Claude Opus 5.5 investigator, prepaid with the visit token. It uses the same filtered clues and the same refusal to reveal answers.";

function hashQuestion(sessionId: string, question: string): string {
  return createHash("sha256").update(`${sessionId}:${question.trim().toLowerCase()}`).digest("hex");
}

function label(config: AiPaymentsConfig, baseUnits: number): string {
  return `${tokenAmount(baseUnits, config.decimals)} ${config.mintSymbol}`;
}

async function balanceFor(
  owner: string | null,
  config: AiPaymentsConfig,
): Promise<{ baseUnits: number; amount: string } | null> {
  if (!owner) return null;
  try {
    // Dynamic import keeps the ESM-only token package out of the CommonJS test build.
    const { getAssociatedTokenAddress, getAccount, getMint, TOKEN_PROGRAM_ID } = await import(
      "@solana/spl-token"
    );
    const mint = new PublicKey(config.mint);
    const address = await getAssociatedTokenAddress(mint, new PublicKey(owner), false, TOKEN_PROGRAM_ID);
    const account = await getAccount(baseConnection(), address, "confirmed", TOKEN_PROGRAM_ID);
    const info = await getMint(baseConnection(), mint, "confirmed", TOKEN_PROGRAM_ID);
    const baseUnits = Number(account.amount);
    return { baseUnits, amount: (baseUnits / 10 ** info.decimals).toFixed(info.decimals) };
  } catch {
    return null;
  }
}

async function associatedAddress(owner: string, mint: string): Promise<string> {
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
  return (
    await getAssociatedTokenAddress(new PublicKey(owner), new PublicKey(mint), false, TOKEN_PROGRAM_ID)
  ).toBase58();
}

function payUriFor(intent: AiIntent, config: AiPaymentsConfig): string {
  return solanaPayUri({
    receiver: intent.receiver,
    mint: intent.mint,
    amountBaseUnits: intent.amountBaseUnits,
    decimals: config.decimals,
    reference: intent.reference,
    label: "ARG Merchant Quest",
    message: "Deep investigation with Mara",
  });
}

/** Everything the panel needs to show the price, the balance and past receipts. */
export async function aiAccessState(view: QuestView): Promise<AiAccessState> {
  const result = readAiPaymentsConfig();
  const model = process.env.ARG_AI_MODEL ?? null;
  const wallet = view.completion?.payout.wallet ?? null;
  const disclosure =
    "The payment uses valueless Devnet test tokens from your verified visit. The inference is a real Claude request paid for by the app's Anthropic credits; Anthropic does not accept tokens or cryptocurrency.";

  if (!result.ok) {
    return {
      enabled: false,
      reason: result.reason,
      cluster: "devnet",
      mint: null,
      symbol: null,
      decimals: null,
      priceBaseUnits: null,
      priceLabel: null,
      receiver: null,
      wallet,
      balanceBaseUnits: null,
      balanceLabel: null,
      model,
      remainingToday: null,
      refundCredits: 0,
      native: {
        available: false,
        reason: result.reason,
        validator: null,
        erEndpoint: null,
        demoPayer: null,
        mintInitialized: null,
        transferQueue: null,
        label: "MagicBlock Ephemeral Rollup payment",
      },
      pending: [],
      recent: [],
      disclosure,
    };
  }

  const config = result.config;
  const balance = await balanceFor(wallet, config);
  const pendingIntents = listIntents(view.sessionId, 10).filter(
    (intent) => intent.status === "quoted" && Date.parse(intent.expiresAt) > Date.now(),
  );
  const usedToday = countChargesToday(view.sessionId);
  const aiConfigured = Boolean(process.env.ARG_AI_API_KEY && model);

  // The native rollup path is only offered when this deployment holds the
  // isolated demo wallet and the mint actually has a transfer queue. Neither is
  // guessed: both are read from the hosted API (only when a wallet exists, so a
  // deployment without one makes no extra network call).
  const payer = demoPayer();
  const settings = erConfig();
  let initialized: boolean | null = null;
  let queue: string | null = null;
  if (payer) {
    try {
      const state = await mintState(config.mint);
      initialized = state.initialized;
      queue = state.transferQueue;
    } catch {
      initialized = null;
    }
  }
  const nativeReason = !payer
    ? "This deployment has no rollup demo wallet, so it can only offer the base-layer Solana Pay transfer."
    : initialized === false
      ? "The visit token has no MagicBlock transfer queue on this validator yet, so the rollup path is not available."
      : initialized === null
        ? "MagicBlock's payment API could not be reached, so the rollup path is unavailable right now."
        : null;

  return {
    enabled: aiConfigured,
    reason: aiConfigured ? null : "No Claude key is configured on this server, so paid inference cannot run.",
    cluster: "devnet",
    mint: config.mint,
    symbol: config.mintSymbol,
    decimals: config.decimals,
    priceBaseUnits: config.priceBaseUnits,
    priceLabel: label(config, config.priceBaseUnits),
    receiver: config.receiver,
    wallet,
    balanceBaseUnits: balance?.baseUnits ?? null,
    balanceLabel: balance ? `${balance.amount} ${config.mintSymbol}` : null,
    model,
    remainingToday: Math.max(0, config.maxPerDayPerSession - usedToday),
    refundCredits: countUnusedGrants(view.sessionId),
    native: {
      available: Boolean(payer) && initialized === true && aiConfigured,
      reason: nativeReason,
      validator: payer ? settings.validator : null,
      erEndpoint: payer ? settings.erRpc : null,
      demoPayer: payer ? payer.publicKey.toBase58() : null,
      mintInitialized: initialized,
      transferQueue: queue,
      label: "MagicBlock Ephemeral Rollup payment",
    },
    pending: pendingIntents.map((intent) => ({
      id: intent.id,
      question: intent.question,
      priceLabel: label(config, intent.amountBaseUnits),
      expiresAt: intent.expiresAt,
      payUri: intent.fundedByGrant ? null : payUriFor(intent, config),
      fundedByCredit: Boolean(intent.fundedByGrant),
      settlement: intent.settlement,
    })),
    recent: listIntents(view.sessionId, 5).map((intent) => ({
      id: intent.id,
      status: intent.status,
      signature: intent.signature,
      amountLabel: label(config, intent.amountBaseUnits),
      createdAt: intent.createdAt,
      explorerUrl: intent.signature ? explorerTx(intent.signature) : null,
    })),
    disclosure,
  };
}

export type QuoteOutcome =
  | {
      ok: true;
      intentId: string;
      amountBaseUnits: number;
      priceLabel: string;
      payUri: string | null;
      expiresAt: string;
      fundedByCredit: boolean;
      settlement: "er" | "base";
    }
  | { ok: false; code: string; reason: string };

function receiptForIntent(intent: AiIntent, config: AiPaymentsConfig): AiPaymentReceipt {
  const er = intent.settlement === "er";
  return {
    intentId: intent.id,
    signature: intent.signature ?? "credit",
    payer: intent.payer ?? "refund-credit",
    amountBaseUnits: intent.amountBaseUnits,
    amountLabel: label(config, intent.amountBaseUnits),
    explorerUrl: intent.signature ? explorerTx(intent.signature) : "",
    paidAt: intent.paidAt ?? intent.createdAt,
    settlement: er ? "er" : "base",
    depositSignature: intent.depositSignature,
    validator: intent.validator,
    l1Settled: false,
    settlementNote: er ? SETTLEMENT_NOTE_ER : SETTLEMENT_NOTE_BASE,
  };
}

/** Issue one authorization bound to this exact question. */
export async function quoteDeepInvestigation(
  view: QuestView,
  question: string,
  now: Date = new Date(),
  options: { settlement?: "er" | "base" } = {},
): Promise<QuoteOutcome> {
  const result = readAiPaymentsConfig();
  if (!result.ok) return { ok: false, code: "disabled", reason: result.reason };
  const config = result.config;

  const model = process.env.ARG_AI_MODEL;
  if (!process.env.ARG_AI_API_KEY || !model) {
    return { ok: false, code: "ai_unconfigured", reason: "No Claude key is configured on this server." };
  }
  const clean = question.trim().slice(0, 700);
  if (clean.length < 3) {
    return { ok: false, code: "empty_question", reason: "Write the question you want investigated first." };
  }
  if (countChargesToday(view.sessionId, now) >= config.maxPerDayPerSession) {
    return {
      ok: false,
      code: "session_limit",
      reason: `This session has reached its ${config.maxPerDayPerSession} deep investigations for today.`,
    };
  }
  if (sumCostToday(now) >= config.maxDailyUsd) {
    return {
      ok: false,
      code: "aggregate_limit",
      reason: "The app has reached its inference budget for today. The free companion still works.",
    };
  }
  if (countPendingIntents(view.sessionId, now) >= config.maxPendingIntents) {
    return {
      ok: false,
      code: "too_many_pending",
      reason: "There are already open quotes for this session. Pay one or let them expire.",
    };
  }

  // A refund credit from a failed inference is spent before asking for tokens.
  const grant = takeGrant(view.sessionId, config.priceBaseUnits, now);
  const reference = Keypair.generate().publicKey.toBase58();
  const receiverAta = await associatedAddress(config.receiver, config.mint);
  const settings = erConfig();
  const settlement: "er" | "base" =
    options.settlement ?? (demoPayer() && !grant ? "er" : "base");

  const intent = createIntent({
    sessionId: view.sessionId,
    campaignId: view.campaign.slug,
    reference,
    mint: config.mint,
    receiver: config.receiver,
    receiverAta,
    amountBaseUnits: config.priceBaseUnits,
    requestHash: hashQuestion(view.sessionId, clean),
    question: clean,
    ttlMs: config.intentTtlMs,
    now,
    status: grant ? "paid" : "quoted",
    fundedByGrant: grant?.id ?? null,
    settlement,
    validator: settlement === "er" ? settings.validator : null,
    erEndpoint: settlement === "er" ? settings.erRpc : null,
  });

  return {
    ok: true,
    intentId: intent.id,
    amountBaseUnits: intent.amountBaseUnits,
    priceLabel: label(config, intent.amountBaseUnits),
    payUri: grant ? null : payUriFor(intent, config),
    expiresAt: intent.expiresAt,
    fundedByCredit: Boolean(grant),
    settlement: intent.settlement,
  };
}

export type SettleOutcome =
  | { ok: true; status: "paid" | "already_paid"; receipt: AiPaymentReceipt }
  | { ok: false; status: "pending" | "invalid" | "expired" | "not_found"; code: string; reason: string };

/** Find, verify and bind the on-chain payment for one quote. */
export async function settleQuote(
  view: QuestView,
  intentId: string,
  now: Date = new Date(),
  deps: ServiceDeps = {},
): Promise<SettleOutcome> {
  const result = readAiPaymentsConfig();
  if (!result.ok) return { ok: false, status: "invalid", code: "disabled", reason: result.reason };
  const config = result.config;

  const intent = getIntent(intentId);
  if (!intent || intent.sessionId !== view.sessionId) {
    return { ok: false, status: "not_found", code: "not_found", reason: "That quote does not belong to this session." };
  }
  if (intent.status === "paid" || intent.status === "consumed") {
    return {
      ok: true,
      status: intent.signature ? "already_paid" : "paid",
      receipt: receiptForIntent(intent, config),
    };
  }
  if (intent.status === "expired" || Date.parse(intent.expiresAt) <= now.getTime()) {
    return {
      ok: false,
      status: "expired",
      code: "expired",
      reason: "This quote expired. Ask for a new one; nothing was charged.",
    };
  }

  const lookup = await (deps.lookupPayment ?? findPaymentForReference)(
    { reference: intent.reference, receiver: intent.receiver, receiverAta: intent.receiverAta },
    { limit: 25 },
  );
  if (!lookup.found || !lookup.payment) {
    return {
      ok: false,
      status: "pending",
      code: "pending",
      reason: lookup.reason ?? "The payment was not found on Devnet yet.",
    };
  }

  const verified = verifyPayment(lookup.payment, {
    reference: intent.reference,
    receiverAta: intent.receiverAta,
    mint: intent.mint,
    amountBaseUnits: intent.amountBaseUnits,
    notBeforeMs: Date.parse(intent.createdAt),
  });
  if (!verified.ok) {
    return { ok: false, status: "invalid", code: verified.code, reason: verified.reason };
  }

  const claimed = claimPayment(intent.id, lookup.payment.signature, verified.payer, now);
  if (!claimed.ok) {
    if (claimed.code === "already_paid") return settleQuote(view, intentId, now, deps);
    return { ok: false, status: "invalid", code: claimed.code, reason: claimed.reason };
  }

  return { ok: true, status: "paid", receipt: receiptForIntent(claimed.intent, config) };
}

export type NativePrepareOutcome =
  | {
      ok: true;
      intentId: string;
      transferSignature: string;
      depositSignature: string | null;
      receiverSetupSignature: string | null;
      confirmation: "er-confirmed";
      settlementNote: string;
      memo: string;
      validator: string;
      erEndpoint: string;
      payer: string;
      amountLabel: string;
      payerBalanceBefore: number | null;
      payerBalanceAfter: number | null;
      receiverBalanceBefore: number | null;
      receiverBalanceAfter: number | null;
      feeLamports: number | null;
    }
  | { ok: false; code: string; reason: string };

/**
 * Execute the rollup payment for one quote. This performs the deposit (only when
 * the payer has no delegated balance yet) and the ER transfer, then verifies the
 * rollup transaction against the quote before recording its signature.
 *
 * It does not mark the quote paid: `settleNativeQuote` re-reads the transaction
 * independently, so inference can never start from this call's word alone.
 */
export async function prepareNativeQuote(
  view: QuestView,
  intentId: string,
  now: Date = new Date(),
  deps: NativeDeps = {},
): Promise<NativePrepareOutcome> {
  void now;
  const result = readAiPaymentsConfig();
  if (!result.ok) return { ok: false, code: "disabled", reason: result.reason };
  const config = result.config;

  const intent = getIntent(intentId);
  if (!intent || intent.sessionId !== view.sessionId) {
    return { ok: false, code: "not_found", reason: "That quote does not belong to this session." };
  }
  if (intent.settlement !== "er") {
    return {
      ok: false,
      code: "not_native",
      reason: "That quote was issued for the base-layer Solana Pay fallback, not the rollup.",
    };
  }
  if (intent.status === "paid" || intent.status === "consumed") {
    return { ok: false, code: "already_paid", reason: "That quote is already paid." };
  }
  if (Date.parse(intent.expiresAt) <= Date.now()) {
    return { ok: false, code: "expired", reason: "This quote expired. Ask for a new one; nothing was charged." };
  }
  if (intent.fundedByGrant) {
    return { ok: false, code: "grant", reason: "That quote is already covered by a refund credit." };
  }
  // The payer is the wallet that claimed this trail's reward. A quote from a
  // session whose payout went elsewhere may not be paid by the demo wallet.
  const claimedWallet = view.completion?.payout.wallet ?? null;
  const signer = (deps.payer === undefined ? demoPayer() : deps.payer)?.publicKey.toBase58() ?? null;
  if (claimedWallet && signer && claimedWallet !== signer) {
    return {
      ok: false,
      code: "payer_mismatch",
      reason: "This trail's reward went to a different wallet than the one that can sign the rollup payment.",
    };
  }

  const prepared = await prepareNativePayment(intent, config, deps);
  if (!prepared.ok) return { ok: false, code: prepared.code, reason: prepared.reason };

  const evidence = prepared.evidence;
  const stored = recordNativeSubmission(intent.id, {
    signature: evidence.transfer.signature,
    depositSignature: evidence.deposit?.signature ?? null,
    payer: evidence.payer,
    validator: evidence.validator,
    erEndpoint: evidence.erEndpoint,
    payerBalanceBefore: evidence.payerBalanceBefore,
    payerBalanceAfter: evidence.payerBalanceAfter,
    receiverBalanceBefore: evidence.receiverBalanceBefore,
    receiverBalanceAfter: evidence.receiverBalanceAfter,
  });
  if (!stored) {
    return {
      ok: false,
      code: "conflict",
      reason: "That quote changed while the payment was running. Open it again.",
    };
  }

  return {
    ok: true,
    intentId: intent.id,
    transferSignature: evidence.transfer.signature,
    depositSignature: evidence.deposit?.signature ?? null,
    receiverSetupSignature: evidence.receiverSetup?.signature ?? null,
    confirmation: evidence.transfer.confirmation,
    settlementNote: SETTLEMENT_NOTE_ER,
    memo: evidence.memo,
    validator: evidence.validator,
    erEndpoint: evidence.erEndpoint,
    payer: evidence.payer,
    amountLabel: label(config, intent.amountBaseUnits),
    payerBalanceBefore: evidence.payerBalanceBefore,
    payerBalanceAfter: evidence.payerBalanceAfter,
    receiverBalanceBefore: evidence.receiverBalanceBefore,
    receiverBalanceAfter: evidence.receiverBalanceAfter,
    feeLamports: evidence.transfer.feeLamports,
  };
}

/**
 * Attach a rollup signature to a quote so it can be verified. This never marks
 * anything paid: `settleNativeQuote` re-reads the transaction from the rollup and
 * applies the quote's rules. A signature that does not match is simply refused.
 */
export async function attachNativeSubmission(
  view: QuestView,
  intentId: string,
  signature: string,
): Promise<{ ok: true } | { ok: false; code: string; reason: string }> {
  const intent = getIntent(intentId);
  if (!intent || intent.sessionId !== view.sessionId) {
    return { ok: false, code: "not_found", reason: "That quote does not belong to this session." };
  }
  if (intent.settlement !== "er") {
    return { ok: false, code: "not_native", reason: "That quote is for the base-layer fallback." };
  }
  if (intent.status !== "quoted") {
    return { ok: false, code: "already_paid", reason: "That quote is already settled." };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature.trim())) {
    return { ok: false, code: "bad_signature", reason: "That is not a transaction signature." };
  }
  const stored = recordNativeSubmission(intent.id, {
    signature: signature.trim(),
    depositSignature: null,
    payer: intent.payer ?? demoPayer()?.publicKey.toBase58() ?? "",
    validator: intent.validator ?? erConfig().validator,
    erEndpoint: intent.erEndpoint ?? erConfig().erRpc,
    payerBalanceBefore: null,
    payerBalanceAfter: null,
    receiverBalanceBefore: null,
    receiverBalanceAfter: null,
  });
  if (!stored) {
    return { ok: false, code: "conflict", reason: "That transaction is already attached to another quote." };
  }
  return { ok: true };
}

/**
 * Verify a native quote's recorded rollup transaction and, only then, mark it
 * paid. The signature comes from our database, never from the request body; the
 * facts come from the rollup itself.
 */
export async function settleNativeQuote(
  view: QuestView,
  intentId: string,
  now: Date = new Date(),
  deps: { fetchErFacts?: (signature: string) => Promise<ErFacts | null> } = {},
): Promise<SettleOutcome> {
  const result = readAiPaymentsConfig();
  if (!result.ok) return { ok: false, status: "invalid", code: "disabled", reason: result.reason };
  const config = result.config;

  const intent = getIntent(intentId);
  if (!intent || intent.sessionId !== view.sessionId) {
    return { ok: false, status: "not_found", code: "not_found", reason: "That quote does not belong to this session." };
  }
  if (intent.settlement !== "er") {
    return {
      ok: false,
      status: "invalid",
      code: "not_native",
      reason: "That quote is for the base-layer fallback. Use the Solana Pay settlement instead.",
    };
  }
  if (intent.status === "paid" || intent.status === "consumed") {
    return {
      ok: true,
      status: intent.signature ? "already_paid" : "paid",
      receipt: receiptForIntent(intent, config),
    };
  }
  if (intent.status === "expired" || Date.parse(intent.expiresAt) <= now.getTime()) {
    return {
      ok: false,
      status: "expired",
      code: "expired",
      reason: "This quote expired. Ask for a new one; nothing was charged.",
    };
  }
  if (!intent.signature) {
    return {
      ok: false,
      status: "pending",
      code: "pending",
      reason: "No rollup transfer has been submitted for this quote yet.",
    };
  }

  const facts = await (deps.fetchErFacts ?? ((signature: string) => fetchErFacts(signature)))(
    intent.signature,
  );
  if (!facts) {
    return {
      ok: false,
      status: "pending",
      code: "pending",
      reason: "The rollup has not indexed that transfer yet. Check again in a moment.",
    };
  }

  const verified = verifyErTransfer(facts, {
    intentId: intent.id,
    mint: intent.mint,
    destination: intent.receiverAta,
    amountBaseUnits: intent.amountBaseUnits,
    payer: intent.payer ?? "",
  });
  if (!verified.ok) {
    return { ok: false, status: "invalid", code: verified.code, reason: verified.reason };
  }

  const claimed = claimPayment(intent.id, facts.signature, verified.payer, now, {
    depositSignature: intent.depositSignature,
    validator: intent.validator,
    erEndpoint: intent.erEndpoint,
    payerBalanceBefore: intent.payerBalanceBefore,
    payerBalanceAfter: intent.payerBalanceAfter,
    receiverBalanceBefore: intent.receiverBalanceBefore,
    receiverBalanceAfter: intent.receiverBalanceAfter,
  });
  if (!claimed.ok) {
    if (claimed.code === "already_paid") return settleNativeQuote(view, intentId, now, deps);
    return { ok: false, status: "invalid", code: claimed.code, reason: claimed.reason };
  }

  return { ok: true, status: "paid", receipt: receiptForIntent(claimed.intent, config) };
}

export interface DeepInvestigationResult {
  status: "ok" | "running" | "failed" | "unpaid" | "limit";
  reply: string | null;
  mode: "paid_ai";
  model: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  estimatedCostUsd: number | null;
  receipt: AiPaymentReceipt | null;
  refunded: boolean;
  balanceAfter: string | null;
  reason: string | null;
}

function receiptFor(intent: AiIntent, config: AiPaymentsConfig): AiPaymentReceipt | null {
  if (!intent.signature) return null;
  return receiptForIntent(intent, config);
}

/**
 * Run the single Claude call this intent paid for. The charge row is unique per
 * intent, so a repeated request returns the stored result instead of billing
 * again. If inference fails, the service debt is recorded and the player gets a
 * replacement credit.
 */
export async function runDeepInvestigation(
  view: QuestView,
  intentId: string,
  now: Date = new Date(),
  deps: ServiceDeps = {},
): Promise<DeepInvestigationResult> {
  const result = readAiPaymentsConfig();
  if (!result.ok) {
    return {
      status: "unpaid",
      reply: null,
      mode: "paid_ai",
      model: null,
      usage: null,
      estimatedCostUsd: null,
      receipt: null,
      refunded: false,
      balanceAfter: null,
      reason: result.reason,
    };
  }
  const config = result.config;
  const intent = getIntent(intentId);
  if (!intent || intent.sessionId !== view.sessionId) {
    return {
      status: "unpaid",
      reply: null,
      mode: "paid_ai",
      model: null,
      usage: null,
      estimatedCostUsd: null,
      receipt: null,
      refunded: false,
      balanceAfter: null,
      reason: "That request does not belong to this session.",
    };
  }

  const existing = getCharge(intent.id);
  if (existing) {
    if (existing.status === "ok") {
      return {
        status: "ok",
        reply: existing.reply,
        mode: "paid_ai",
        model: existing.model,
        usage: { inputTokens: existing.inputTokens, outputTokens: existing.outputTokens },
        estimatedCostUsd: existing.costUsd,
        receipt: receiptFor(intent, config),
        refunded: false,
        balanceAfter: null,
        reason: null,
      };
    }
    if (existing.status === "running") {
      return {
        status: "running",
        reply: null,
        mode: "paid_ai",
        model: null,
        usage: null,
        estimatedCostUsd: null,
        receipt: receiptFor(intent, config),
        refunded: false,
        balanceAfter: null,
        reason: "This investigation is still running.",
      };
    }
    return {
      status: "failed",
      reply: null,
      mode: "paid_ai",
      model: existing.model,
      usage: null,
      estimatedCostUsd: null,
      receipt: receiptFor(intent, config),
      refunded: true,
      balanceAfter: null,
      reason: existing.error ?? "The inference failed.",
    };
  }

  const started = beginCharge(intent.id, view.sessionId, now);
  if (!started.ok) {
    return {
      status: started.code === "duplicate" ? "running" : "unpaid",
      reply: null,
      mode: "paid_ai",
      model: null,
      usage: null,
      estimatedCostUsd: null,
      receipt: receiptFor(intent, config),
      refunded: false,
      balanceAfter: null,
      reason: started.reason,
    };
  }

  const model = process.env.ARG_AI_MODEL;
  const apiKey = process.env.ARG_AI_API_KEY;
  const maxEstimated =
    (config.maxOutputTokens / 1_000_000) * config.outputCostPerMillion;
  if (!apiKey || !model) {
    finishCharge(started.charge.id, {
      status: "failed",
      error: "No Claude key is configured on this server.",
      now,
    });
    oweRefund(intent.id, intent.amountBaseUnits, "No Claude key is configured.", now);
    return {
      status: "failed",
      reply: null,
      mode: "paid_ai",
      model: null,
      usage: null,
      estimatedCostUsd: null,
      receipt: receiptFor(intent, config),
      refunded: true,
      balanceAfter: null,
      reason: "No Claude key is configured on this server. Your credit was restored.",
    };
  }
  if (sumCostToday(now) + maxEstimated > config.maxDailyUsd) {
    finishCharge(started.charge.id, {
      status: "failed",
      error: "Aggregate inference budget reached.",
      now,
    });
    oweRefund(intent.id, intent.amountBaseUnits, "Aggregate inference budget reached.", now);
    return {
      status: "limit",
      reply: null,
      mode: "paid_ai",
      model,
      usage: null,
      estimatedCostUsd: null,
      receipt: receiptFor(intent, config),
      refunded: true,
      balanceAfter: null,
      reason: "The app has reached its inference budget for today. Your credit was restored.",
    };
  }

  try {
    const context = companionContextSnapshot(view);
    const messages = buildProviderMessages(context, view, `${intent.question}\n\n(${PAID_INVESTIGATION_NOTE})`);
    const completed = await (deps.complete ?? callClaude)({
      apiKey,
      model,
      messages,
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
    });
    const text = completed.content;
    const inputTokens = completed.inputTokens;
    const outputTokens = completed.outputTokens;
    const costUsd =
      ((inputTokens ?? 0) / 1_000_000) * config.inputCostPerMillion +
      ((outputTokens ?? 0) / 1_000_000) * config.outputCostPerMillion;
    finishCharge(started.charge.id, {
      status: "ok",
      model,
      inputTokens,
      outputTokens,
      costUsd,
      reply: text,
      now,
    });
    const balance = await balanceFor(intent.payer, config);
    return {
      status: "ok",
      reply: text,
      mode: "paid_ai",
      model,
      usage: { inputTokens, outputTokens },
      estimatedCostUsd: costUsd,
      receipt: receiptFor(intent, config),
      refunded: false,
      balanceAfter: balance ? `${balance.amount} ${config.mintSymbol}` : null,
      reason: null,
    };
  } catch (error) {
    const message = (error as Error).message || "The inference failed.";
    finishCharge(started.charge.id, { status: "failed", model, error: message, now });
    oweRefund(intent.id, intent.amountBaseUnits, message, now);
    return {
      status: "failed",
      reply: null,
      mode: "paid_ai",
      model,
      usage: null,
      estimatedCostUsd: null,
      receipt: receiptFor(intent, config),
      refunded: true,
      balanceAfter: null,
      reason: `${message} Your credit was restored for a retry.`,
    };
  }
}
