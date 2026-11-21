#!/usr/bin/env node
/**
 * One-command Devnet setup for the P0.3 reward leg.
 *
 *   npm run chain:setup
 *
 * - creates (once) a devnet treasury keypair in `.data/wallets/treasury.json`
 * - funds it from MagicBlock's devnet faucet (the public Solana RPC faucet is closed)
 * - deploys the `completion-counter` program if it is not on chain yet
 * - provisions the demo reward mint and tops up the treasury
 *
 * Everything it writes stays under `.data/` (gitignored). No secret is printed.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  getAssociatedTokenAddress,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const ROOT = process.cwd();
const DATA = process.env.ARG_DATA_DIR ?? path.join(ROOT, ".data");
const CHAIN = path.join(DATA, "chain");
const WALLETS = path.join(DATA, "wallets");
const BASE_RPC = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const FAUCET_RPC = process.env.ARG_MAGICBLOCK_DEVNET_RPC ?? "https://rpc.magicblock.app/devnet";
const CIRCLE_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const TOKEN_DECIMALS = 6;
const TREASURY_TOKENS = 1_000;

fs.mkdirSync(CHAIN, { recursive: true });
fs.mkdirSync(WALLETS, { recursive: true });

const log = (message) => console.log(`[chain:setup] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function treasury() {
  const file = path.join(WALLETS, "treasury.json");
  const existing = readJson(file);
  if (existing) return Keypair.fromSecretKey(Uint8Array.from(existing));
  const keypair = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(keypair.secretKey)));
  log("created a new devnet treasury keypair at .data/wallets/treasury.json");
  return keypair;
}

async function fund(connection, wallet) {
  let balance = await connection.getBalance(wallet.publicKey);
  log(`treasury ${wallet.publicKey.toBase58()} holds ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  let attempts = 0;
  while (balance < 2 * LAMPORTS_PER_SOL && attempts < 12) {
    attempts += 1;
    try {
      const response = await fetch(FAUCET_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "requestAirdrop",
          params: [wallet.publicKey.toBase58(), LAMPORTS_PER_SOL],
        }),
      });
      const body = await response.json();
      if (body.error) log(`faucet attempt ${attempts}: ${body.error.message ?? "error"}`);
      else log(`faucet attempt ${attempts}: requested 1 SOL`);
    } catch (error) {
      log(`faucet attempt ${attempts} failed: ${error.message}`);
    }
    await sleep(5000);
    balance = await connection.getBalance(wallet.publicKey);
  }
  if (balance < LAMPORTS_PER_SOL) {
    throw new Error(
      "Could not fund the demo treasury on Devnet. Request SOL at https://faucet.solana.com for the address above and re-run.",
    );
  }
  return balance;
}

async function ensureProgram(connection, payer) {
  const programKeyFile = path.join(CHAIN, "program-keypair.json");
  let programKey = readJson(programKeyFile);
  if (!programKey) {
    programKey = Array.from(Keypair.generate().secretKey);
    fs.writeFileSync(programKeyFile, JSON.stringify(programKey));
  }
  const programId = Keypair.fromSecretKey(Uint8Array.from(programKey)).publicKey;
  const programFile = path.join(CHAIN, "program.json");

  const account = await connection.getAccountInfo(programId);
  if (account?.executable) {
    writeJson(programFile, { programId: programId.toBase58(), deployedAt: readJson(programFile)?.deployedAt ?? null });
    log(`completion-counter program already deployed: ${programId.toBase58()}`);
    return programId;
  }

  const soPath = path.join(CHAIN, "completion_counter.so");
  if (!fs.existsSync(soPath)) {
    throw new Error(
      `Missing ${soPath}. Build it first: cd programs/completion-counter && cargo build-sbf --sbf-out-dir ../../.data/chain`,
    );
  }

  const solanaBin = path.join(
    process.env.HOME ?? "",
    ".local/share/solana/install/active_release/bin",
  );
  const env = {
    ...process.env,
    PATH: `${process.env.PATH}:${solanaBin}:${path.join(process.env.HOME ?? "", ".cargo/bin")}`,
  };
  log("deploying the completion-counter program to Devnet…");
  const deploy = spawnSync(
    "solana",
    [
      "program",
      "deploy",
      soPath,
      "--program-id",
      programKeyFile,
      "--keypair",
      path.join(WALLETS, "treasury.json"),
      "--url",
      BASE_RPC,
      "--with-compute-unit-price",
      "1000",
    ],
    { env, encoding: "utf8" },
  );
  if (deploy.status !== 0) {
    throw new Error(`solana program deploy failed:\n${deploy.stdout}\n${deploy.stderr}`);
  }
  log(deploy.stdout.trim().split("\n").slice(-2).join(" "));
  writeJson(programFile, {
    programId: programId.toBase58(),
    deployedAt: new Date().toISOString(),
  });
  return programId;
}

async function ensureRewardMint(connection, payer) {
  const configFile = path.join(CHAIN, "mint.json");
  const configured = process.env.ARG_REWARD_MINT;

  // Prefer Circle's official devnet USDC when the treasury actually holds some.
  const circleMint = new PublicKey(CIRCLE_DEVNET_USDC_MINT);
  const circleAta = await getAssociatedTokenAddress(circleMint, payer.publicKey);
  let circleBalance = 0;
  try {
    const account = await connection.getTokenAccountBalance(circleAta);
    circleBalance = Number(account.value.amount);
  } catch {
    circleBalance = 0;
  }
  if (circleBalance > 0) {
    const config = {
      mint: CIRCLE_DEVNET_USDC_MINT,
      kind: "circle-usdc",
      symbol: "USDC",
      name: "Devnet USDC (Circle)",
      decimals: TOKEN_DECIMALS,
      treasuryTokenAccount: circleAta.toBase58(),
      treasuryBalanceBaseUnits: circleBalance,
      createdAt: new Date().toISOString(),
    };
    writeJson(configFile, config);
    log(`using Circle devnet USDC at ${CIRCLE_DEVNET_USDC_MINT} (treasury holds ${circleBalance / 10 ** TOKEN_DECIMALS})`);
    return config;
  }
  if (circleBalance === 0) {
    log(
      "no Circle devnet USDC in the treasury. Circle's faucet is captcha-protected and could not be used here, so the demo uses a clearly labelled valueless SPL test token unless ARG_REWARD_MINT points at another mint.",
    );
  }

  let config = readJson(configFile);
  if (configured && config?.mint !== configured) {
    const mint = new PublicKey(configured);
    const mintInfo = await getMint(connection, mint);
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    config = {
      mint: configured,
      kind: configured === CIRCLE_DEVNET_USDC_MINT ? "circle-usdc" : "demo-test-token",
      symbol: configured === CIRCLE_DEVNET_USDC_MINT ? "USDC" : "tUSDC",
      name: configured === CIRCLE_DEVNET_USDC_MINT ? "Devnet USDC (Circle)" : "ARG demo test token",
      decimals: mintInfo.decimals,
      treasuryTokenAccount: ata.address.toBase58(),
      treasuryBalanceBaseUnits: Number(ata.amount),
      createdAt: new Date().toISOString(),
    };
    writeJson(configFile, config);
    log(`using configured reward mint ${configured}`);
    return config;
  }

  if (config) {
    const mint = new PublicKey(config.mint);
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    const balance = Number((await connection.getTokenAccountBalance(ata.address)).value.amount);
    log(`reward mint ${config.mint} already provisioned (treasury holds ${balance / 10 ** config.decimals})`);
    if (balance < TREASURY_TOKENS * 10 ** config.decimals) {
      try {
        await mintTo(connection, payer, mint, ata.address, payer, TREASURY_TOKENS * 10 ** TOKEN_DECIMALS);
        log(`topped the treasury up to ${TREASURY_TOKENS} ${config.symbol}`);
      } catch (error) {
        log(`could not mint more ${config.symbol} (${error.message}); continuing with the existing balance`);
      }
    }
    config.treasuryTokenAccount = ata.address.toBase58();
    config.treasuryBalanceBaseUnits = Number(
      (await connection.getTokenAccountBalance(ata.address)).value.amount,
    );
    writeJson(configFile, config);
    return config;
  }

  log("creating a valueless devnet SPL test token for the demo reward…");
  const mint = await createMint(connection, payer, payer.publicKey, payer.publicKey, TOKEN_DECIMALS);
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  await mintTo(connection, payer, mint, ata.address, payer, TREASURY_TOKENS * 10 ** TOKEN_DECIMALS);
  config = {
    mint: mint.toBase58(),
    kind: "demo-test-token",
    symbol: "tUSDC",
    name: "ARG demo test token",
    decimals: TOKEN_DECIMALS,
    mintAuthority: payer.publicKey.toBase58(),
    treasuryTokenAccount: ata.address.toBase58(),
    treasuryBalanceBaseUnits: TREASURY_TOKENS * 10 ** TOKEN_DECIMALS,
    createdAt: new Date().toISOString(),
    note: "Valueless Devnet test token created by this script. It is NOT Circle USDC.",
  };
  writeJson(configFile, config);
  log(`created demo test token ${config.mint} (${TREASURY_TOKENS} ${config.symbol} held by the treasury)`);
  return config;
}

async function main() {
  const connection = new Connection(BASE_RPC, "confirmed");
  const payer = treasury();
  await fund(connection, payer);

  const programId = await ensureProgram(connection, payer);
  const mintConfig = await ensureRewardMint(connection, payer);

  const solBalance = await connection.getBalance(payer.publicKey);
  const state = {
    cluster: "devnet",
    treasury: payer.publicKey.toBase58(),
    treasurySol: solBalance / LAMPORTS_PER_SOL,
    programId: programId.toBase58(),
    rewardMint: mintConfig.mint,
    rewardMintKind: mintConfig.kind,
    rewardSymbol: mintConfig.symbol,
    treasuryTokenAccount: mintConfig.treasuryTokenAccount,
    treasuryTokens: mintConfig.treasuryBalanceBaseUnits / 10 ** mintConfig.decimals,
    explorerTreasury: `https://explorer.solana.com/address/${payer.publicKey.toBase58()}?cluster=devnet`,
    explorerProgram: `https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`,
    explorerMint: `https://explorer.solana.com/address/${mintConfig.mint}?cluster=devnet`,
  };
  writeJson(path.join(CHAIN, "state.json"), state);
  log("devnet setup complete:");
  console.log(JSON.stringify(state, null, 2));
}

main().catch((error) => {
  console.error(`[chain:setup] ${error.message}`);
  process.exit(1);
});
