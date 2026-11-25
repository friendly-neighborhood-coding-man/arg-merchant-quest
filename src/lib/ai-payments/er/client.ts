/**
 * Client for MagicBlock's official Ephemeral SPL Token payments API and the
 * rollup RPC, used by the native payment path.
 *
 * Only two things are ever sent from here: an unsigned transaction built by the
 * API (signed by the demo payer keypair we hold for the isolated demo wallet),
 * and a read-only `getTransaction` to verify what the rollup actually executed.
 * Nothing accepts a client-reported balance or "paid" flag.
 */

import { Connection, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { BASE_RPC_URL } from "../../chain/config";

/**
 * The payments validator is deliberately separate from the campaign counter's ER
 * validator: the visit token's transfer queue is initialized per validator, and
 * these defaults name the one this deployment initialized.
 */
export const PAYMENTS_VALIDATOR = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";
export const PAYMENTS_ER_RPC = "https://devnet-as.magicblock.app";
import { parseErTransaction, type ErFacts } from "./verify";

export interface ErConfig {
  apiBase: string;
  cluster: "devnet";
  validator: string;
  erRpc: string;
  baseRpc: string;
}

export function erConfig(env: NodeJS.ProcessEnv = process.env): ErConfig {
  return {
    apiBase: env.ARG_MAGICBLOCK_PAYMENTS_API ?? "https://api.magicblock.app",
    cluster: "devnet",
    validator: env.ARG_AI_ER_PAYMENTS_VALIDATOR ?? PAYMENTS_VALIDATOR,
    erRpc: env.ARG_AI_ER_PAYMENTS_RPC ?? PAYMENTS_ER_RPC,
    baseRpc: env.ARG_SOLANA_RPC_URL ?? BASE_RPC_URL,
  };
}

export interface BuiltTransaction {
  kind: string;
  version: "legacy" | "v0";
  transactionBase64: string;
  sendTo: "base" | "ephemeral";
  validator: string | null;
  instructionCount: number;
  requiredSigners: string[];
  transferQueue?: string;
  rentPda?: string;
  fees?: { lamports: string; tokens: string };
}

async function api<T>(
  config: ErConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ ok: true; value: T } | { ok: false; status: number; error: string }> {
  const response = await fetch(`${config.apiBase}${path}`, {
    method,
    headers: { accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const detail =
      (parsed as { error?: { message?: string; issues?: Array<{ message?: string }> } })?.error
        ?.message ??
      (parsed as { error?: { issues?: Array<{ message?: string }> } })?.error?.issues?.[0]?.message ??
      `HTTP ${response.status}`;
    return { ok: false, status: response.status, error: String(detail) };
  }
  return { ok: true, value: parsed as T };
}

export interface MintState {
  initialized: boolean;
  validator: string;
  transferQueue: string | null;
}

export async function mintState(mint: string, config = erConfig()): Promise<MintState> {
  const query = `mint=${mint}&cluster=${config.cluster}&validator=${config.validator}`;
  const result = await api<{ initialized?: boolean; validator?: string; transferQueue?: string }>(
    config,
    "GET",
    `/v1/spl/is-mint-initialized?${query}`,
  );
  if (!result.ok) return { initialized: false, validator: config.validator, transferQueue: null };
  return {
    initialized: Boolean(result.value.initialized),
    validator: result.value.validator ?? config.validator,
    transferQueue: result.value.transferQueue ?? null,
  };
}

export interface OwnerBalance {
  owner: string;
  ata: string | null;
  baseBalance: number | null;
  delegated: boolean;
}

export async function ownerBalance(
  owner: string,
  mint: string,
  config = erConfig(),
): Promise<OwnerBalance> {
  const result = await api<{
    address?: string;
    ata?: string;
    balance?: string;
    delegation?: { status?: string };
  }>(config, "GET", `/v1/spl/balance?address=${owner}&mint=${mint}&cluster=${config.cluster}`);
  if (!result.ok) return { owner, ata: null, baseBalance: null, delegated: false };
  const value = result.value;
  return {
    owner: value.address ?? owner,
    ata: value.ata ?? null,
    baseBalance: value.balance === undefined ? null : Number(value.balance),
    delegated: value.delegation?.status === "delegated",
  };
}

function toBuilt(value: Record<string, unknown>): BuiltTransaction {
  return {
    kind: String(value.kind ?? ""),
    version: value.version === "v0" ? "v0" : "legacy",
    transactionBase64: String(value.transactionBase64 ?? ""),
    sendTo: value.sendTo === "ephemeral" ? "ephemeral" : "base",
    validator: typeof value.validator === "string" ? value.validator : null,
    instructionCount: Number(value.instructionCount ?? 0),
    requiredSigners: Array.isArray(value.requiredSigners) ? value.requiredSigners.map(String) : [],
    transferQueue: typeof value.transferQueue === "string" ? value.transferQueue : undefined,
    rentPda: typeof value.rentPda === "string" ? value.rentPda : undefined,
    fees: value.fees as BuiltTransaction["fees"],
  };
}

export async function buildDeposit(
  input: { owner: string; mint: string; amountBaseUnits: number },
  config = erConfig(),
): Promise<BuiltTransaction> {
  const result = await api<Record<string, unknown>>(config, "POST", "/v1/spl/deposit", {
    owner: input.owner,
    mint: input.mint,
    amount: input.amountBaseUnits,
    cluster: config.cluster,
    validator: config.validator,
    initIfMissing: true,
    initAtasIfMissing: true,
    initVaultIfMissing: true,
  });
  if (!result.ok) throw new Error(`deposit build failed: ${result.error}`);
  return toBuilt(result.value);
}

export async function buildErTransfer(
  input: {
    from: string;
    to: string;
    mint: string;
    amountBaseUnits: number;
    memo: string;
  },
  config = erConfig(),
): Promise<BuiltTransaction> {
  const result = await api<Record<string, unknown>>(config, "POST", "/v1/spl/transfer", {
    from: input.from,
    to: input.to,
    mint: input.mint,
    amount: input.amountBaseUnits,
    cluster: config.cluster,
    validator: config.validator,
    visibility: "public",
    fromBalance: "ephemeral",
    toBalance: "ephemeral",
    memo: input.memo,
    legacy: true,
    // Without this the builder emits a plain SPL transfer from the empty
    // base-layer ATA; with it, the request becomes an eSPL program transfer that
    // also ensures the recipient's Magic ATA on the rollup.
    initIfMissing: true,
    initAtasIfMissing: true,
  });
  if (!result.ok) throw new Error(`transfer build failed: ${result.error}`);
  return toBuilt(result.value);
}

/** Sign a builder response. The API can return a legacy or a v0 transaction. */
export function signBuilt(built: BuiltTransaction, signer: Keypair): Uint8Array {
  const bytes = Buffer.from(built.transactionBase64, "base64");
  if (built.version === "v0") {
    const transaction = VersionedTransaction.deserialize(bytes);
    transaction.sign([signer]);
    return transaction.serialize();
  }
  const transaction = Transaction.from(bytes);
  transaction.sign(signer);
  return transaction.serialize();
}

/**
 * Submit to the runtime the builder named and confirm by polling; MagicBlock's
 * endpoints do not all expose the websocket subscription web3.js expects.
 */
export async function submitAndConfirm(
  endpoint: string,
  raw: Uint8Array,
  confirmation: "base-confirmed" | "er-confirmed",
): Promise<{ signature: string; confirmation: "base-confirmed" | "er-confirmed" }> {
  const connection = new Connection(endpoint, "confirmed");
  // MagicBlock's own examples submit with skipPreflight: a preflight simulation
  // can reject a transaction the runtime has already processed, which would hide
  // a real payment behind a spurious error. The poll below is the source of truth.
  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: true,
    maxRetries: 3,
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: false,
    });
    const value = status.value;
    if (value?.err) {
      throw new Error(`Transaction ${signature} failed: ${JSON.stringify(value.err)}`);
    }
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
      return { signature, confirmation };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Transaction ${signature} was not confirmed in time.`);
}

/** The rollup's own identity, so a payment cannot be verified on a stray node. */
export async function erIdentity(endpoint = erConfig().erRpc): Promise<string | null> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getIdentity", params: [] }),
    });
    const body = (await response.json()) as { result?: { identity?: string } };
    return body.result?.identity ?? null;
  } catch {
    return null;
  }
}

export async function fetchErFacts(
  signature: string,
  endpoint = erConfig().erRpc,
): Promise<ErFacts | null> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
    }),
  });
  const body = (await response.json()) as { result?: unknown };
  return parseErTransaction(body.result, signature);
}

/** The ER balance the rollup reports for one owner, used as corroboration. */
export async function erOwnerBalance(
  owner: string,
  mint: string,
  config = erConfig(),
): Promise<number | null> {
  const result = await api<{ balance?: string }>(
    config,
    "GET",
    `/v1/spl/balance?address=${owner}&mint=${mint}&cluster=${config.cluster}`,
  );
  return result.ok && result.value.balance !== undefined ? Number(result.value.balance) : null;
}
