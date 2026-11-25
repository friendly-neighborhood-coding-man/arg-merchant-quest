/**
 * Verification of a MagicBlock Ephemeral Rollup payment.
 *
 * Everything here is pure: it takes the parsed facts of one ER transaction and
 * the quote it is supposed to pay, and decides. No client-reported value is
 * accepted anywhere — the facts come from the rollup's own RPC and the quote
 * comes from our database.
 *
 * What must hold for a native payment to count:
 * - the transaction succeeded on the rollup (`err === null`)
 * - it carries this quote's memo, so one transfer cannot pay two questions
 * - it is exactly one SPL transfer of our mint into the receiver's token account
 * - the transferred amount covers the quoted price
 * - the transfer authority is the payer the quote was bound to
 * - when the rollup reports the destination's balance change, it matches
 */

export type ErVerifyCode =
  | "failed"
  | "no_transfer"
  | "multiple_transfers"
  | "wrong_mint"
  | "wrong_destination"
  | "wrong_payer"
  | "insufficient_amount"
  | "missing_memo"
  | "wrong_memo"
  | "balance_mismatch";

export interface ErTransferFact {
  mint: string | null;
  destination: string;
  authority: string | null;
  amount: string;
}

export interface ErFacts {
  signature: string;
  /** `null` when the rollup executed the transaction successfully. */
  err: unknown;
  memo: string | null;
  transfers: ErTransferFact[];
  /** Base-unit change of the destination token account, when the rollup reports it. */
  destinationDelta: string | null;
  slot: number | null;
  blockTime: number | null;
}

export interface ErExpectation {
  intentId: string;
  mint: string;
  destination: string;
  amountBaseUnits: number;
  payer: string;
}

export type ErVerifyResult =
  | { ok: true; amountBaseUnits: number; payer: string; memo: string }
  | { ok: false; code: ErVerifyCode; reason: string };

/** The memo binds one rollup payment to exactly one quote. */
export function erMemo(intentId: string): string {
  return `arg-ai:${intentId}`;
}

interface ParsedInstruction {
  program?: string;
  parsed?: unknown;
  programId?: string;
}

interface TokenBalance {
  accountIndex?: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: { amount?: string };
}

interface JsonParsedTransaction {
  meta?: {
    err?: unknown;
    postTokenBalances?: TokenBalance[];
    preTokenBalances?: TokenBalance[];
    innerInstructions?: Array<{ instructions?: ParsedInstruction[] }>;
  } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<{ pubkey?: string } | string>;
      instructions?: ParsedInstruction[];
    };
  } | null;
  slot?: number;
  blockTime?: number | null;
}

function keyOf(entry: { pubkey?: string } | string): string {
  return typeof entry === "string" ? entry : (entry.pubkey ?? "");
}

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/**
 * Turn a `getTransaction` (jsonParsed) result into the few facts the verifier
 * needs. Kept separate from the network so the tests can feed real shapes.
 */
export function parseErTransaction(raw: unknown, signature: string): ErFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as JsonParsedTransaction;
  const message = parsed.transaction?.message;
  if (!message) return null;

  const instructions: ParsedInstruction[] = [...(message.instructions ?? [])];
  for (const inner of parsed.meta?.innerInstructions ?? []) {
    instructions.push(...(inner.instructions ?? []));
  }

  let memo: string | null = null;
  const transfers: ErTransferFact[] = [];
  for (const instruction of instructions) {
    const program = instruction.program;
    if (program === "spl-memo" && typeof instruction.parsed === "string") {
      memo = memo ?? instruction.parsed;
      continue;
    }
    if (program === "spl-token" && instruction.parsed && typeof instruction.parsed === "object") {
      const value = instruction.parsed as {
        type?: string;
        info?: {
          mint?: string;
          destination?: string;
          source?: string;
          authority?: string;
          amount?: string;
          tokenAmount?: { amount?: string };
        };
      };
      if (value.type !== "transfer" && value.type !== "transferChecked") continue;
      const info = value.info ?? {};
      if (!info.destination) continue;
      transfers.push({
        mint: info.mint ?? null,
        destination: info.destination,
        authority: info.authority ?? null,
        amount: info.tokenAmount?.amount ?? info.amount ?? "0",
      });
      continue;
    }
    // A memo can also arrive as an unparsed instruction with only a program id.
    if (
      instruction.programId === MEMO_PROGRAM_ID &&
      typeof (instruction as { parsed?: unknown }).parsed !== "string" &&
      !program
    ) {
      memo = memo ?? "";
    }
  }

  const accountKeys = message.accountKeys ?? [];
  const keyAt = (index: number | undefined): string | null =>
    index === undefined ? null : keyOf(accountKeys[index] ?? "");

  // Resolve a mint for plain `transfer` instructions from the reported balances.
  for (const transfer of transfers) {
    if (transfer.mint) continue;
    const match = (parsed.meta?.postTokenBalances ?? []).find(
      (balance) => keyAt(balance.accountIndex) === transfer.destination,
    );
    transfer.mint = match?.mint ?? null;
  }

  // The destination's balance change, when the rollup reports token balances.
  const destination = transfers[0]?.destination ?? "";
  const destinationIndex = accountKeys.findIndex((key) => keyOf(key) === destination);
  let destinationDelta: string | null = null;
  if (destinationIndex >= 0) {
    const before = (parsed.meta?.preTokenBalances ?? []).find(
      (balance) => balance.accountIndex === destinationIndex,
    );
    const after = (parsed.meta?.postTokenBalances ?? []).find(
      (balance) => balance.accountIndex === destinationIndex,
    );
    if (after?.uiTokenAmount?.amount !== undefined) {
      const beforeAmount = BigInt(before?.uiTokenAmount?.amount ?? "0");
      const afterAmount = BigInt(after.uiTokenAmount.amount);
      destinationDelta = (afterAmount - beforeAmount).toString();
    }
  }

  return {
    signature,
    err: parsed.meta?.err ?? null,
    memo: memo === "" ? null : memo,
    transfers,
    destinationDelta,
    slot: parsed.slot ?? null,
    blockTime: parsed.blockTime ?? null,
  };
}

export function verifyErTransfer(facts: ErFacts, expected: ErExpectation): ErVerifyResult {
  if (facts.err !== null) {
    return {
      ok: false,
      code: "failed",
      reason: "That rollup transaction failed, so it paid nothing.",
    };
  }
  if (facts.transfers.length === 0) {
    return {
      ok: false,
      code: "no_transfer",
      reason: "That transaction carries no token transfer.",
    };
  }

  const matching = facts.transfers.filter(
    (transfer) =>
      transfer.destination === expected.destination && transfer.mint === expected.mint,
  );
  if (matching.length === 0) {
    const wrongMint = facts.transfers.find((transfer) => transfer.mint !== expected.mint);
    if (wrongMint) {
      return {
        ok: false,
        code: "wrong_mint",
        reason: "That transfer used a different token than the visit token.",
      };
    }
    return {
      ok: false,
      code: "wrong_destination",
      reason: "That transfer did not go to the recipient this quote names.",
    };
  }
  if (matching.length > 1) {
    return {
      ok: false,
      code: "multiple_transfers",
      reason: "That transaction contains more than one candidate transfer, so it is ambiguous.",
    };
  }

  const transfer = matching[0];
  if (transfer.authority && transfer.authority !== expected.payer) {
    return {
      ok: false,
      code: "wrong_payer",
      reason: "That transfer was signed by a different wallet than the one this quote belongs to.",
    };
  }
  if (!transfer.authority) {
    return {
      ok: false,
      code: "wrong_payer",
      reason: "That transfer does not name the wallet that authorized it.",
    };
  }

  if (facts.memo === null) {
    return {
      ok: false,
      code: "missing_memo",
      reason: "That transfer carries no quote reference, so it cannot pay this question.",
    };
  }
  if (facts.memo !== erMemo(expected.intentId)) {
    return {
      ok: false,
      code: "wrong_memo",
      reason: "That transfer was bound to a different quote.",
    };
  }

  const amount = Number(transfer.amount);
  if (!Number.isFinite(amount) || amount < expected.amountBaseUnits) {
    return {
      ok: false,
      code: "insufficient_amount",
      reason: "That transfer is smaller than the quoted price, so it cannot unlock the investigation.",
    };
  }

  if (facts.destinationDelta !== null) {
    const delta = Number(facts.destinationDelta);
    if (!Number.isFinite(delta) || delta < expected.amountBaseUnits) {
      return {
        ok: false,
        code: "balance_mismatch",
        reason: "The recipient's rollup balance did not increase by the quoted amount.",
      };
    }
  }

  return {
    ok: true,
    amountBaseUnits: amount,
    payer: transfer.authority,
    memo: facts.memo,
  };
}
