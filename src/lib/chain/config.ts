import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";

/**
 * Devnet chain configuration for the P0.3 reward leg.
 *
 * Nothing here is mainnet. The treasury keypair lives outside git in
 * `.data/wallets/` and is never committed.
 */

export const CLUSTER = "devnet" as const;
export const CLUSTER_LABEL = "Solana Devnet";

export const BASE_RPC_URL = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/** MagicBlock Ephemeral Rollup used for the campaign completion counter. */
export const ER_RPC_URL =
  process.env.ARG_MAGICBLOCK_ER_RPC_URL ?? "https://devnet-us.magicblock.app";
export const ER_VALIDATOR =
  process.env.ARG_MAGICBLOCK_ER_VALIDATOR ?? "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd";
export const MAGIC_ROUTER_URL =
  process.env.ARG_MAGIC_ROUTER_URL ?? "https://devnet-router.magicblock.app";

/** Circle's official Solana Devnet USDC mint (see Circle's multichain USDC docs). */
export const CIRCLE_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/**
 * The fixed reward rule from P0.1 stays exactly as it was: 100 credits, always.
 * For the P0.3 demo we publish an explicit conversion to test tokens:
 * 100 credits = 1.00 test token, i.e. 1 credit = 0.01 test token.
 */
export const REWARD_CREDITS = 100;
export const CREDITS_PER_REWARD_TOKEN = 100;
export const REWARD_TOKEN_DECIMALS = 6;
export const REWARD_BASE_UNITS = Math.round(
  (REWARD_CREDITS / CREDITS_PER_REWARD_TOKEN) * 10 ** REWARD_TOKEN_DECIMALS,
);

export const EXPLORER_URL = `https://explorer.solana.com`;
export const EXPLORER_CLUSTER = `cluster=devnet`;

export function explorerTx(signature: string): string {
  return `${EXPLORER_URL}/tx/${signature}?${EXPLORER_CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER_URL}/address/${address}?${EXPLORER_CLUSTER}`;
}

export function chainDataDir(): string {
  const dir = path.join(process.env.ARG_DATA_DIR ?? path.join(process.cwd(), ".data"), "chain");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function walletDataDir(): string {
  const dir = path.join(process.env.ARG_DATA_DIR ?? path.join(process.cwd(), ".data"), "wallets");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export function treasuryKeypair(): Keypair {
  const file = process.env.ARG_TREASURY_KEYPAIR ?? path.join(walletDataDir(), "treasury.json");
  const secret = readJsonFile<number[]>(file);
  if (!secret) {
    throw new Error(
      `No demo treasury keypair at ${file}. Run "npm run chain:setup" to create and fund the Devnet demo wallet.`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/**
 * The treasury's public address, when a treasury file exists. Reading the public
 * key is harmless; the secret key is only used by the reward transfer itself.
 */
export function treasuryPubkey(): string | null {
  try {
    return treasuryKeypair().publicKey.toBase58();
  } catch {
    return null;
  }
}

export function counterProgramId(): PublicKey | null {
  const fromEnv = process.env.ARG_COUNTER_PROGRAM_ID;
  if (fromEnv) return new PublicKey(fromEnv);
  const file = readJsonFile<{ programId: string }>(path.join(chainDataDir(), "program.json"));
  return file?.programId ? new PublicKey(file.programId) : null;
}

export interface RewardMintConfig {
  mint: PublicKey;
  /** "circle-usdc" only when the mint really is Circle's devnet USDC address. */
  kind: "circle-usdc" | "demo-test-token";
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * The reward mint. `ARG_REWARD_MINT` overrides the demo mint, so an operator
 * with Circle faucet access can point this at real devnet USDC without a code
 * change. Everything surfaced to a player is labelled from this config, so the
 * UI cannot claim "USDC" for a token that is not Circle's.
 */
export function rewardMintConfig(): RewardMintConfig {
  const fromEnv = process.env.ARG_REWARD_MINT;
  if (fromEnv) {
    const isCircle = fromEnv === CIRCLE_DEVNET_USDC_MINT;
    return {
      mint: new PublicKey(fromEnv),
      kind: isCircle ? "circle-usdc" : "demo-test-token",
      symbol: isCircle ? "USDC" : (process.env.ARG_REWARD_MINT_SYMBOL ?? "tUSDC"),
      name: isCircle ? "Devnet USDC (Circle)" : "ARG demo test token",
      decimals: REWARD_TOKEN_DECIMALS,
    };
  }

  const file = readJsonFile<{
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    kind: "circle-usdc" | "demo-test-token";
  }>(path.join(chainDataDir(), "mint.json"));
  if (!file) {
    throw new Error(
      'No reward mint configured. Run "npm run chain:setup" (devnet demo test token) or set ARG_REWARD_MINT to a funded devnet mint.',
    );
  }
  return {
    mint: new PublicKey(file.mint),
    kind: file.kind,
    symbol: file.symbol,
    name: file.name,
    decimals: file.decimals,
  };
}

export function rewardMintConfigOrNull(): RewardMintConfig | null {
  try {
    return rewardMintConfig();
  } catch {
    return null;
  }
}

export const REWARD_CONVERSION_COPY = `Demo conversion: ${REWARD_CREDITS} credits = 1.00 test token (1 credit = 0.01 test token). The credit rule itself is unchanged.`;
