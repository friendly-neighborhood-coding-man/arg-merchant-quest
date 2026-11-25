#!/usr/bin/env node
/**
 * Native eSPL recovery driver — read-only unless explicitly told otherwise.
 *
 *   node scripts/p3/recover-native.mjs            # reconcile + show the merge plan
 *   node scripts/p3/recover-native.mjs --execute --approve
 *
 * The only write it can make is one owner-signed `MergeShuttleIntoAta` (data [15])
 * on the rollup: zero fee, no new accounts, no deposit, no delegation change.
 * It refuses every other action, including any deposit.
 */

import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

const BASE = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ER = process.env.ARG_AI_ER_PAYMENTS_RPC ?? "https://devnet-as.magicblock.app";
const VALIDATOR = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";
const PROGRAM = new PublicKey("SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MINT = new PublicKey("61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1");

const PLAYER_KEY = ".data/wallets/p3-demo-player.json";
const STATE = {
  player: "GnMyuvhxr1p3U6oQwcfiTVR3RSNbvfE4DfEWGnsLgR68",
  playerAta: "FZwX8oAkyVAVNnNbE88t3EdGJpmk4BHHaTH9TT2DJ2jj",
  playerEata: "DTW6qGnaz5pjAWcgLtchXke9LVPtcvXT7TAKnBo2uyKG",
  playerShuttleEata: "56Vj9pZD7TTkrRBthinWJEnL3mW6rXxoCZ8fTbskKtLB",
  playerShuttleAta: "64QmiopFjBkSZbV1QHXTqMprXf6fXtwhNnLGQYTRaVrA",
  playerShuttleWalletAta: "EMefyTGaEVXMTLCvwCFZr8RRBxeyK4mwtXK6W3wwwpCK",
  vaultAta: "5nZS2KkP1B5fXDv4jjWJ58Zy6xu1u5FSvUCnHjuvezgA",
};

const execute = process.argv.includes("--execute");
const approved = process.argv.includes("--approve");

async function rpc(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  return body.result ?? body.error;
}

function amountOf(info) {
  if (!info?.value) return null;
  const data = Buffer.from(info.value.data[0], "base64");
  if (data.length >= 72) return Number(data.readBigUInt64LE(64)); // eATA: amount @64
  if (data.length === 165) return Number(data.readBigUInt64LE(64)); // SPL token account
  return null;
}

async function reconcile() {
  const rows = [
    ["global vault ATA", STATE.vaultAta],
    ["player base ATA", STATE.playerAta],
    ["player owner eATA", STATE.playerEata],
    ["player shuttle eATA", STATE.playerShuttleEata],
    ["player shuttle ATA (state)", STATE.playerShuttleAta],
    ["player shuttle wallet ATA", STATE.playerShuttleWalletAta],
  ];
  console.log("account                        address        base       rollup");
  for (const [label, address] of rows) {
    const base = await rpc(BASE, "getAccountInfo", [address, { encoding: "base64" }]);
    const er = await rpc(ER, "getAccountInfo", [address, { encoding: "base64" }]);
    const fmt = (info) => (info?.value ? String(amountOf(info) ?? `len${Buffer.from(info.value.data[0], "base64").length}`) : "missing");
    console.log(`${label.padEnd(30)} ${address.slice(0, 8)}…   ${fmt(base).padEnd(10)} ${fmt(er)}`);
  }
  const eata = amountOf(await rpc(ER, "getAccountInfo", [STATE.playerEata, { encoding: "base64" }]));
  return { eata: eata ?? 0 };
}

function mergeInstruction(owner) {
  return new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: new PublicKey(STATE.playerEata), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(STATE.playerShuttleEata), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(STATE.playerShuttleWalletAta), isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([15]), // MergeShuttleIntoAta
  });
}

async function main() {
  console.log(`validator ${VALIDATOR}\nrollup    ${ER}\nbase      ${BASE}\n`);
  const before = await reconcile();
  console.log(`\nowner eATA amount on the rollup: ${before.eata}`);

  if (before.eata > 0) {
    console.log("the eATA is already funded on the rollup — no merge needed.");
    return;
  }
  if (!fs.existsSync(PLAYER_KEY)) {
    console.log(`\nno demo wallet at ${PLAYER_KEY}; nothing else this script can do read-only.`);
    return;
  }
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PLAYER_KEY, "utf8"))));
  if (keypair.publicKey.toBase58() !== STATE.player) {
    console.log(`\n${PLAYER_KEY} is ${keypair.publicKey.toBase58()}, not the demo player; refusing.`);
    return;
  }

  const blockhash = await rpc(ER, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const transaction = new Transaction({
    feePayer: keypair.publicKey,
    recentBlockhash: blockhash.value.blockhash,
  }).add(mergeInstruction(keypair.publicKey));
  transaction.sign(keypair);
  const raw = transaction.serialize();

  console.log("\nplanned write — MergeShuttleIntoAta (data [15]) on the rollup");
  console.log(`  fee payer   ${keypair.publicKey.toBase58()}`);
  console.log(`  destination ${STATE.playerEata} (owner eATA)`);
  console.log(`  shuttle     ${STATE.playerShuttleEata}`);
  console.log(`  wallet ATA  ${STATE.playerShuttleWalletAta}`);
  console.log("  fee         0 lamports, no new accounts, no deposit");

  if (!execute) {
    console.log("\ndry run: nothing sent. Re-run with --execute --approve after approval.");
    return;
  }
  if (!approved) {
    console.log("\nrefusing: --execute also requires --approve (this is an on-chain write).");
    process.exitCode = 1;
    return;
  }

  const signature = await rpc(ER, "sendTransaction", [raw.toString("base64"), { encoding: "base64", skipPreflight: true }]);
  console.log(`\nsent: ${signature}`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await rpc(ER, "getSignatureStatuses", [[signature], { searchTransactionHistory: false }]);
    const value = status?.value?.[0];
    if (value?.err) {
      console.log(`failed on the rollup: ${JSON.stringify(value.err)}`);
      return;
    }
    if (value?.confirmationStatus) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const after = await reconcile();
  console.log(`\nowner eATA amount after: ${after.eata}`);
  if (after.eata !== before.eata) {
    fs.mkdirSync(path.dirname(".data/p3/recovery.json"), { recursive: true });
    fs.writeFileSync(
      ".data/p3/recovery.json",
      JSON.stringify({ signature, before, after, at: new Date().toISOString() }, null, 2),
    );
    console.log("recorded .data/p3/recovery.json");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
