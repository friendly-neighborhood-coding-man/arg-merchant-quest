#!/usr/bin/env node
/**
 * Read-only Devnet diagnostic for the P0.3/P0.4 chain configuration.
 *
 *   npm run chain:state
 *
 * Prints the effective treasury address, reward mint, counter program and each
 * campaign counter, with live RPC balances. It never prints a secret key and it
 * never writes a file: it is safe to run at any time, including while the app is
 * running.
 */
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getMint } from "@solana/spl-token";

const ROOT = process.cwd();
const DATA = process.env.ARG_DATA_DIR ?? path.join(ROOT, ".data");
const CHAIN = path.join(DATA, "chain");
const WALLETS = path.join(DATA, "wallets");
const DB_PATH = process.env.ARG_DB_PATH ?? path.join(DATA, "arg.db");

const BASE_RPC = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ROUTER = process.env.ARG_MAGIC_ROUTER_URL ?? "https://devnet-router.magicblock.app";
const DEFAULT_ER = process.env.ARG_MAGICBLOCK_ER_RPC_URL ?? "https://devnet-us.magicblock.app";
const REWARD_BASE_UNITS = Number(process.env.ARG_REWARD_BASE_UNITS ?? 1_000_000);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function rel(file) {
  return path.relative(ROOT, file) || file;
}

function heading(text) {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

function line(label, value) {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

async function safe(label, work) {
  try {
    return await work();
  } catch (error) {
    line(label, `unavailable (${error.message})`);
    return null;
  }
}

function readCounter(data) {
  if (!data || data.length < 8) return null;
  const value = Buffer.from(data.subarray(0, 8)).readBigUInt64LE(0);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}

async function delegationStatus(address) {
  try {
    const response = await fetch(ROUTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [address],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    return {
      isDelegated: Boolean(body.result?.isDelegated),
      fqdn: body.result?.fqdn ?? null,
    };
  } catch {
    return { isDelegated: false, fqdn: null };
  }
}

const connection = new Connection(BASE_RPC, "confirmed");

console.log("ARG Merchant Quest — chain state (read-only)");
line("Base RPC", BASE_RPC);
line("Magic Router", ROUTER);

// --- Treasury ------------------------------------------------------------
heading("Treasury");
const treasuryPath = process.env.ARG_TREASURY_KEYPAIR ?? path.join(WALLETS, "treasury.json");
line(
  "Keypair source",
  process.env.ARG_TREASURY_KEYPAIR ? "ARG_TREASURY_KEYPAIR" : rel(treasuryPath),
);
let treasury = null;
const treasurySecret = readJson(treasuryPath);
if (!treasurySecret) {
  line("Status", "MISSING — no treasury keypair, payouts are unconfigured");
  line("Restore with", "ARG_TREASURY_KEYPAIR=/secure/path/treasury.json");
} else {
  try {
    treasury = Keypair.fromSecretKey(Uint8Array.from(treasurySecret));
    line("Public address", treasury.publicKey.toBase58());
    line(
      "Backup",
      "export the keypair file to your own secret store; never commit it",
    );
  } catch {
    line("Status", "INVALID — the keypair file could not be read as a secret key");
  }
}

if (treasury) {
  const sol = await safe("SOL balance", () => connection.getBalance(treasury.publicKey));
  if (sol !== null) line("SOL balance", `${(sol / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
}

// --- Reward mint ---------------------------------------------------------
heading("Reward mint");
let mintAddress = null;
let mintMeta = null;
if (process.env.ARG_REWARD_MINT) {
  mintAddress = process.env.ARG_REWARD_MINT;
  line("Source", "ARG_REWARD_MINT");
} else {
  const mintFile = readJson(path.join(CHAIN, "mint.json"));
  if (mintFile?.mint) {
    mintAddress = mintFile.mint;
    mintMeta = mintFile;
    line("Source", rel(path.join(CHAIN, "mint.json")));
  } else {
    line("Status", "MISSING — payouts are unconfigured");
    line("Configure with", "ARG_REWARD_MINT=<devnet mint>");
  }
}

if (mintAddress) {
  line("Mint", mintAddress);
  const kind = mintMeta?.kind ?? (mintAddress === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" ? "circle-usdc" : "demo-test-token");
  line("Label", `${mintMeta?.symbol ?? "unknown"} · ${mintMeta?.name ?? "unnamed"}`);
  line("Kind", kind === "circle-usdc" ? "Circle devnet USDC" : "demo test token (not Circle USDC)");
  const mintInfo = await safe("On-chain mint", async () => getMint(connection, new PublicKey(mintAddress)));
  if (mintInfo) {
    line("Decimals", mintInfo.decimals);
    line("Supply", (Number(mintInfo.supply) / 10 ** mintInfo.decimals).toLocaleString("en-US"));
    line("Mint authority", mintInfo.mintAuthority?.toBase58() ?? "none (fixed supply)");
  }
  if (treasury) {
    const ata = await safe("Treasury token account", () =>
      getAssociatedTokenAddress(new PublicKey(mintAddress), treasury.publicKey),
    );
    if (ata) {
      line("Treasury token account", ata.toBase58());
      const balance = await safe("Treasury tokens", async () => {
        const value = await connection.getTokenAccountBalance(ata);
        return Number(value.value.amount);
      });
      if (balance !== null) {
        const decimals = mintInfo?.decimals ?? mintMeta?.decimals ?? 6;
        line("Treasury tokens", `${(balance / 10 ** decimals).toFixed(2)} (${balance} base units)`);
        line(
          "Rewards available",
          `${Math.floor(balance / REWARD_BASE_UNITS)} × ${(REWARD_BASE_UNITS / 10 ** decimals).toFixed(2)} test tokens`,
        );
      }
    }
  }
}

// --- Counter program -----------------------------------------------------
heading("Completion counter program");
let programId = null;
if (process.env.ARG_COUNTER_PROGRAM_ID) {
  programId = process.env.ARG_COUNTER_PROGRAM_ID;
  line("Source", "ARG_COUNTER_PROGRAM_ID");
} else {
  const programFile = readJson(path.join(CHAIN, "program.json"));
  if (programFile?.programId) {
    programId = programFile.programId;
    line("Source", rel(path.join(CHAIN, "program.json")));
    if (programFile.deployedAt) line("Deployed at", programFile.deployedAt);
  } else {
    line("Status", "MISSING — the MagicBlock counter is unconfigured");
    line("Configure with", "ARG_COUNTER_PROGRAM_ID=<program id>");
  }
}

if (programId) {
  line("Program", programId);
  await safe("On-chain account", async () => {
    const info = await connection.getAccountInfo(new PublicKey(programId));
    if (!info) {
      line("Executable", "NOT FOUND on this RPC");
      return;
    }
    line("Executable", info.executable ? "yes" : "no");
    line("Owner", info.owner.toBase58());
    line("Data length", `${info.data.length} bytes`);
  });
  line(
    "Explorer",
    `https://explorer.solana.com/address/${programId}?cluster=devnet`,
  );
}

// --- Campaign counters from the local demo DB ---------------------------
heading("Campaign counters (local database)");
if (!fs.existsSync(DB_PATH)) {
  line("Database", `${rel(DB_PATH)} not created yet — start the app once`);
} else {
  let rows = [];
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    rows = db
      .prepare(
        `SELECT slug, title, chain_counter_account
         FROM campaigns WHERE chain_counter_account IS NOT NULL ORDER BY title`,
      )
      .all();
    db.close();
  } catch (error) {
    line("Database", `could not be read (${error.message})`);
  }

  if (rows.length === 0) {
    line("Counters", "none yet — approve a player's evidence to create one");
  }

  for (const row of rows) {
    const address = row.chain_counter_account;
    console.log(`\n  ${row.title} (${row.slug})`);
    line("Counter", address);
    const baseValue = await safe("Base-layer value", async () => {
      const info = await connection.getAccountInfo(new PublicKey(address));
      return readCounter(info?.data);
    });
    if (baseValue !== null) line("Committed value", String(baseValue));
    const status = await delegationStatus(address);
    line("Delegated", status.isDelegated ? "yes" : "no (base layer)");
    if (status.isDelegated) {
      const endpoint = status.fqdn ?? DEFAULT_ER;
      line("ER endpoint", endpoint);
      const erValue = await safe("ER value", async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [address, { encoding: "base64" }],
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = await response.json();
        const base64 = body.result?.value?.data?.[0];
        return base64 ? readCounter(Buffer.from(base64, "base64")) : null;
      });
      if (erValue !== null) line("ER value", String(erValue));
    }
    line("Explorer", `https://explorer.solana.com/address/${address}?cluster=devnet`);
  }
}

console.log("\nThis command only reads. No key, program or mint was changed.");
