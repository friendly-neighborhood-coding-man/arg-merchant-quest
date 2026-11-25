/**
 * P3 (revised) token-funded AI access — configuration.
 *
 * The player pays with the campaign's existing Devnet reward mint. No new token
 * is created, no reward amount changes, and the paid path is optional: the
 * trail, the hints, the scripted guide and the free companion all work without
 * any payment.
 *
 * Devnet only. The receiver is a public address (no key is read to receive); it
 * defaults to the demo treasury's public key when the treasury file exists, and
 * must be set explicitly with ARG_AI_PAYMENT_RECEIVER otherwise.
 */

import { PublicKey } from "@solana/web3.js";
import { rewardMintConfigOrNull, treasuryPubkey } from "../chain/config";

export interface AiPaymentsConfig {
  receiver: string;
  mint: string;
  mintSymbol: string;
  decimals: number;
  /** Price of one deep investigation, in token base units. */
  priceBaseUnits: number;
  intentTtlMs: number;
  maxPendingIntents: number;
  maxPerDayPerSession: number;
  /** Aggregate estimated inference spend allowed per UTC day, in USD. */
  maxDailyUsd: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export type ConfigResult =
  | { ok: true; config: AiPaymentsConfig }
  | { ok: false; reason: string };

function positiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAddress(value: string): string | null {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

/**
 * Resolve configuration. Returns a reason instead of throwing so the UI can say
 * exactly why paid access is unavailable and keep the free path running.
 */
export function readAiPaymentsConfig(
  env: Record<string, string | undefined> = process.env,
): ConfigResult {
  if ((env.ARG_AI_PAYMENTS_ENABLED ?? "").toLowerCase() === "false") {
    return { ok: false, reason: "Token-funded deep investigation is disabled on this server." };
  }

  const mintConfig = rewardMintConfigOrNull();
  if (!mintConfig) {
    return {
      ok: false,
      reason: "No reward mint is configured, so there is no visit token to spend.",
    };
  }
  const mint = mintConfig.mint.toBase58();

  const receiverSource = (env.ARG_AI_PAYMENT_RECEIVER ?? "").trim();
  const receiver = receiverSource ? parseAddress(receiverSource) : treasuryPubkey();
  if (!receiver) {
    return {
      ok: false,
      reason: "No AI payment receiver is configured (set ARG_AI_PAYMENT_RECEIVER to a Devnet address).",
    };
  }

  const decimals = mintConfig.decimals;
  const defaultPrice = 200_000;
  const rawPrice = env.ARG_AI_PAYMENT_PRICE?.trim();
  const priceBaseUnits = rawPrice
    ? Math.round(Number(rawPrice))
    : defaultPrice;
  if (!Number.isFinite(priceBaseUnits) || priceBaseUnits <= 0) {
    return { ok: false, reason: "ARG_AI_PAYMENT_PRICE is not a positive integer amount of base units." };
  }

  return {
    ok: true,
    config: {
      receiver,
      mint,
      mintSymbol: mintConfig.symbol,
      decimals,
      priceBaseUnits,
      intentTtlMs: Math.round(positiveNumber(env.ARG_AI_INTENT_TTL_SECONDS, 900) * 1000),
      maxPendingIntents: Math.round(positiveNumber(env.ARG_AI_MAX_PENDING_INTENTS, 3)),
      maxPerDayPerSession: Math.round(positiveNumber(env.ARG_AI_MAX_PER_DAY, 5)),
      maxDailyUsd: positiveNumber(env.ARG_AI_DAILY_USD_LIMIT, 1),
      inputCostPerMillion: positiveNumber(env.ARG_AI_INPUT_COST_PER_M, 4),
      outputCostPerMillion: positiveNumber(env.ARG_AI_OUTPUT_COST_PER_M, 20),
      maxOutputTokens: Math.round(positiveNumber(env.ARG_AI_MAX_OUTPUT_TOKENS, 1600)),
      timeoutMs: Math.round(positiveNumber(env.ARG_AI_DEEP_TIMEOUT_MS, 45_000)),
    },
  };
}

export function tokenAmount(baseUnits: number, decimals: number): string {
  return (baseUnits / 10 ** decimals).toFixed(decimals);
}

/** Solana Pay URI the player's wallet can open or scan. */
export function solanaPayUri(input: {
  receiver: string;
  mint: string;
  amountBaseUnits: number;
  decimals: number;
  reference: string;
  label: string;
  message: string;
}): string {
  const amount = tokenAmount(input.amountBaseUnits, input.decimals);
  const params = new URLSearchParams({
    "spl-token": input.mint,
    amount,
    reference: input.reference,
    label: input.label,
    message: input.message,
  });
  return `solana:${input.receiver}?${params.toString()}`;
}
