/**
 * Devnet lookup for a quoted payment.
 *
 * The browser never tells the server "I paid". The server searches the chain
 * for a confirmed transaction that carries the intent's reference key, fetches
 * it parsed, and hands it to the pure verifier.
 *
 * Search order:
 * 1. transaction history of the reference address (Solana Pay puts the
 *    reference in every transaction it builds);
 * 2. recent history of the receiver wallet, filtered by the reference, because
 *    a reference account may never be created on chain.
 *
 * Both searches are bounded. A payment older than the intent is rejected by the
 * verifier anyway.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { baseConnection } from "../chain/connections";
import type { ParsedPayment, ParsedTransferInstruction } from "./verify";

interface ParsedIx {
  program?: string;
  programId?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
}

interface ParsedTx {
  blockTime?: number | null;
  meta?: { err?: unknown };
  transaction?: {
    message?: {
      accountKeys?: Array<{ pubkey?: string } | string>;
      instructions?: ParsedIx[];
    };
  };
  metaInner?: unknown;
}

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function transferFrom(ix: ParsedIx): ParsedTransferInstruction | null {
  const programId = ix.programId ?? null;
  const program = ix.program ?? (programId === SPL_TOKEN_PROGRAM ? "spl-token" : null);
  if (program !== "spl-token") return null;
  const type = ix.parsed?.type ?? null;
  if (type !== "transfer" && type !== "transferChecked") return null;
  const info = ix.parsed?.info ?? {};
  const tokenAmount = info.tokenAmount as { amount?: unknown } | undefined;
  return {
    program: "spl-token",
    type,
    source: stringFrom(info.source),
    destination: stringFrom(info.destination),
    authority: stringFrom(info.authority) ?? stringFrom(info.multisigAuthority),
    mint: stringFrom(info.mint),
    amount: numberFrom(tokenAmount?.amount ?? info.amount),
  };
}

/**
 * Convert one `getParsedTransaction` result into the verifier's shape,
 * including instructions nested in inner instructions.
 */
export function parseTransaction(signature: string, tx: ParsedTx, inner: ParsedIx[] = []): ParsedPayment {
  const accountKeys = (tx.transaction?.message?.accountKeys ?? [])
    .map((key) => (typeof key === "string" ? key : (key.pubkey ?? "")))
    .filter((key) => key !== "");
  const instructions = [...(tx.transaction?.message?.instructions ?? []), ...inner]
    .map(transferFrom)
    .filter((entry): entry is ParsedTransferInstruction => entry !== null);
  return {
    signature,
    success: !tx.meta?.err,
    blockTimeMs: typeof tx.blockTime === "number" ? tx.blockTime * 1000 : null,
    accountKeys,
    transfers: instructions,
    destinationMints: {},
  };
}

async function resolveDestinationMints(
  payment: ParsedPayment,
  connection: Connection,
  wanted: string,
): Promise<void> {
  for (const transfer of payment.transfers) {
    if (transfer.mint || !transfer.destination) continue;
    if (transfer.destination !== wanted) continue;
    try {
      // Loaded on demand: @solana/spl-token is ESM-only, and this module is
      // imported by the CommonJS test build.
      const { getAccount, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
      const account = await getAccount(connection, new PublicKey(transfer.destination), "confirmed", TOKEN_PROGRAM_ID);
      payment.destinationMints[transfer.destination] = account.mint.toBase58();
    } catch {
      // A missing account simply means the mint cannot be confirmed; the
      // verifier then rejects the transfer instead of guessing.
    }
  }
}

export interface PaymentLookup {
  found: boolean;
  payment: ParsedPayment | null;
  /** Transactions inspected, for the receipt and for honest diagnostics. */
  scanned: number;
  reason: string | null;
}

export async function findPaymentForReference(
  expected: { reference: string; receiver: string; receiverAta: string },
  options: { connection?: Connection; limit?: number } = {},
): Promise<PaymentLookup> {
  const connection = options.connection ?? baseConnection();
  const limit = options.limit ?? 25;
  let reference: PublicKey;
  let receiver: PublicKey;
  try {
    reference = new PublicKey(expected.reference);
    receiver = new PublicKey(expected.receiver);
  } catch {
    return { found: false, payment: null, scanned: 0, reason: "The reference or receiver address is invalid." };
  }

  const candidates: string[] = [];
  try {
    const direct = await connection.getSignaturesForAddress(reference, { limit: 5 });
    for (const entry of direct) candidates.push(entry.signature);
  } catch {
    // A reference account with no history is normal; fall through to the receiver.
  }
  if (candidates.length === 0) {
    try {
      const recent = await connection.getSignaturesForAddress(receiver, { limit });
      for (const entry of recent) candidates.push(entry.signature);
    } catch (error) {
      return {
        found: false,
        payment: null,
        scanned: 0,
        reason: `The Devnet RPC could not be read: ${(error as Error).message}`,
      };
    }
  }

  let scanned = 0;
  for (const signature of candidates) {
    scanned += 1;
    let parsed: Awaited<ReturnType<Connection["getParsedTransaction"]>>;
    try {
      parsed = await connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      continue;
    }
    if (!parsed) continue;
    const innerIxs = (parsed.meta?.innerInstructions ?? []).flatMap(
      (group) => (group.instructions ?? []) as unknown as ParsedIx[],
    );
    const payment = parseTransaction(signature, parsed as unknown as ParsedTx, innerIxs);
    if (!payment.accountKeys.includes(expected.reference)) continue;
    await resolveDestinationMints(payment, connection, expected.receiverAta);
    return { found: true, payment, scanned, reason: null };
  }

  return {
    found: false,
    payment: null,
    scanned,
    reason: "No confirmed Devnet transaction carrying this request's reference was found yet.",
  };
}
