/**
 * Pure verification of one token payment against the intent the server issued.
 *
 * The server never trusts a client's claim that it paid. It fetches the
 * confirmed transaction from Devnet and checks, in this order:
 *
 * 1. the transaction succeeded;
 * 2. it carries the intent's unique reference key (so the payment is bound to
 *    this one authorization, not to any other transfer);
 * 3. it contains exactly one SPL transfer into the intent's receiver token
 *    account (two matching transfers would make the amount ambiguous);
 * 4. that transfer is of the configured mint;
 * 5. the amount is at least the quoted price;
 * 6. the transfer is not older than the intent.
 *
 * A failure returns a code and a sentence, so the UI can explain what is wrong
 * without guessing.
 */

export interface ParsedTransferInstruction {
  /** "spl-token" for the SPL Token program. */
  program: string;
  /** "transfer" or "transferChecked". */
  type: string;
  source: string | null;
  destination: string | null;
  authority: string | null;
  /** Present on transferChecked. */
  mint: string | null;
  /** Base units. */
  amount: number | null;
}

export interface ParsedPayment {
  signature: string;
  success: boolean;
  blockTimeMs: number | null;
  accountKeys: string[];
  transfers: ParsedTransferInstruction[];
  /** Mint resolved by the RPC adapter for plain (non-checked) transfers. */
  destinationMints: Record<string, string>;
}

export interface PaymentExpectation {
  reference: string;
  receiverAta: string;
  mint: string;
  amountBaseUnits: number;
  notBeforeMs: number;
}

export type VerifyFailure =
  | "transaction_failed"
  | "missing_reference"
  | "no_transfer"
  | "ambiguous_transfer"
  | "wrong_mint"
  | "insufficient_amount"
  | "stale"
  | "unknown_payer";

export type VerifyResult =
  | { ok: true; payer: string; sourceAta: string; amountBaseUnits: number }
  | { ok: false; code: VerifyFailure; reason: string };

/** Clock tolerance for the intent start, in milliseconds. */
const CLOCK_TOLERANCE_MS = 120_000;

export function verifyPayment(
  payment: ParsedPayment,
  expected: PaymentExpectation,
): VerifyResult {
  if (!payment.success) {
    return { ok: false, code: "transaction_failed", reason: "That transaction failed on chain." };
  }
  if (!payment.accountKeys.includes(expected.reference)) {
    return {
      ok: false,
      code: "missing_reference",
      reason: "That transaction does not carry this request's reference, so it cannot be matched to it.",
    };
  }

  const matches = payment.transfers.filter(
    (transfer) =>
      transfer.program === "spl-token" &&
      (transfer.type === "transfer" || transfer.type === "transferChecked") &&
      transfer.destination === expected.receiverAta,
  );
  if (matches.length === 0) {
    return {
      ok: false,
      code: "no_transfer",
      reason: "That transaction has no token transfer into this request's receiver account.",
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      code: "ambiguous_transfer",
      reason: "That transaction contains more than one transfer to the receiver, so the paid amount is ambiguous.",
    };
  }

  const transfer = matches[0];
  const mint = transfer.mint ?? (transfer.destination ? payment.destinationMints[transfer.destination] : null);
  if (!mint || mint !== expected.mint) {
    return {
      ok: false,
      code: "wrong_mint",
      reason: `That transfer is not the visit token (${expected.mint}).`,
    };
  }

  const amount = transfer.amount ?? 0;
  if (!Number.isFinite(amount) || amount < expected.amountBaseUnits) {
    return {
      ok: false,
      code: "insufficient_amount",
      reason: `That transfer is smaller than the quoted price (${expected.amountBaseUnits} base units).`,
    };
  }

  if (payment.blockTimeMs === null) {
    return {
      ok: false,
      code: "stale",
      reason: "That transaction has no block time, so its age cannot be checked.",
    };
  }
  if (payment.blockTimeMs < expected.notBeforeMs - CLOCK_TOLERANCE_MS) {
    return {
      ok: false,
      code: "stale",
      reason: "That payment is older than this request, so it cannot pay for it.",
    };
  }

  const payer = transfer.authority ?? null;
  if (!payer) {
    return { ok: false, code: "unknown_payer", reason: "That transfer names no payer." };
  }

  return {
    ok: true,
    payer,
    sourceAta: transfer.source ?? "",
    amountBaseUnits: amount,
  };
}
