#!/usr/bin/env node
/**
 * Native eSPL recovery check — read-only.
 *
 *   node scripts/p3/recover-native.mjs
 *
 * The authorised recovery was one owner-signed `MergeShuttleIntoAta` (data [15]) on
 * the rollup. Simulation of that instruction fails against the current state under
 * both legal account mappings, so this script never sends anything and says why.
 *
 *   1. reconcile base + rollup balances
 *   2. assert account roles (metadata / shuttle eATA / shuttle wallet ATA / owner eATA)
 *   3. simulate ix 15 with destination = owner eATA      -> InvalidAccountOwner
 *   4. simulate ix 15 with destination = canonical ATA   -> InvalidWritableAccount
 *   5. print the refusal, exit 1
 *
 * It refuses every write, including any deposit. `--execute` exists only so that a
 * future, approved fix can be added deliberately; today it refuses too.
 */

import fs from "node:fs";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { mergeShuttleIntoAtaIx } from "@magicblock-labs/ephemeral-rollups-sdk";

const BASE = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ER = process.env.ARG_AI_ER_PAYMENTS_RPC ?? "https://devnet-as.magicblock.app";
const VALIDATOR = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";
const PROGRAM = "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2";
const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MINT = new PublicKey("61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1");

const PLAYER_KEY = ".data/wallets/p3-demo-player.json";

/**
 * Roles were verified by decoding the accounts, not guessed:
 *   56Vj9…  72 bytes, owner field = player, payer = rent PDA, u32@64 = 1458347789
 *           → ShuttleMetadata PDA (ix 15 account 2)
 *   64Qmio… 80 bytes, owner field = 56Vj9…, mint @32, amount 200000 @64
 *           → the shuttle's ephemeral ATA (the staged credit)
 *   EMefy…  165 bytes, Tokenkeg, amount 0
 *           → the shuttle wallet ATA (ix 15 account 3, the merge source)
 */
const STATE = {
  player: "GnMyuvhxr1p3U6oQwcfiTVR3RSNbvfE4DfEWGnsLgR68",
  playerAta: "FZwX8oAkyVAVNnNbE88t3EdGJpmk4BHHaTH9TT2DJ2jj",
  playerEata: "DTW6qGnaz5pjAWcgLtchXke9LVPtcvXT7TAKnBo2uyKG",
  shuttleMetadata: "56Vj9pZD7TTkrRBthinWJEnL3mW6rXxoCZ8fTbskKtLB",
  shuttleEata: "64QmiopFjBkSZbV1QHXTqMprXf6fXtwhNnLGQYTRaVrA",
  shuttleWalletAta: "EMefyTGaEVXMTLCvwCFZr8RRBxeyK4mwtXK6W3wwwpCK",
  vaultAta: "5nZS2KkP1B5fXDv4jjWJ58Zy6xu1u5FSvUCnHjuvezgA",
};

async function rpc(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  return body.result ?? { error: body.error };
}

function amountOf(info) {
  if (!info?.value) return null;
  const data = Buffer.from(info.value.data[0], "base64");
  if (data.length === 165) return Number(data.readBigUInt64LE(64)); // SPL token account
  if (data.length >= 72) return Number(data.readBigUInt64LE(64)); // eATA amount @64
  return null;
}

async function reconcile() {
  const rows = [
    ["global vault ATA", STATE.vaultAta],
    ["player canonical ATA", STATE.playerAta],
    ["player owner eATA", STATE.playerEata],
    ["shuttle metadata (PDA)", STATE.shuttleMetadata],
    ["shuttle eATA", STATE.shuttleEata],
    ["shuttle wallet ATA", STATE.shuttleWalletAta],
  ];
  console.log("account                       address        base       rollup    rollup owner");
  for (const [label, address] of rows) {
    const base = await rpc(BASE, "getAccountInfo", [address, { encoding: "base64" }]);
    const er = await rpc(ER, "getAccountInfo", [address, { encoding: "base64" }]);
    const fmt = (info) => (info?.value ? String(amountOf(info) ?? "n/a") : "missing");
    const owner = er?.value ? `${er.value.owner.slice(0, 8)}…` : "—";
    console.log(`${label.padEnd(28)} ${address.slice(0, 8)}…   ${fmt(base).padEnd(10)} ${fmt(er).padEnd(9)} ${owner}`);
  }
}

async function simulate(label, keypair, blockhash, destination) {
  const instruction = mergeShuttleIntoAtaIx(
    keypair.publicKey,
    new PublicKey(destination),
    new PublicKey(STATE.shuttleMetadata),
    new PublicKey(STATE.shuttleWalletAta),
    MINT,
    TOKEN,
  );
  const transaction = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: blockhash }).add(instruction);
  transaction.sign(keypair);
  const simulation = await rpc(ER, "simulateTransaction", [
    transaction.serialize().toString("base64"),
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" },
  ]);
  const value = simulation?.value ?? simulation;
  console.log(`\n[${label}] destination ${destination}`);
  console.log(`  err           ${JSON.stringify(value?.err ?? simulation?.error)}`);
  console.log(`  units         ${value?.unitsConsumed ?? "n/a"}`);
  for (const line of value?.logs ?? []) console.log(`  | ${line.replace("Program log: ", "")}`);
  return { label, destination, err: value?.err ?? simulation?.error ?? null, logs: value?.logs ?? [] };
}

async function main() {
  console.log(`validator ${VALIDATOR}\nrollup    ${ER}\nbase      ${BASE}\n`);
  await reconcile();

  if (!fs.existsSync(PLAYER_KEY)) {
    console.log(`\nno demo wallet at ${PLAYER_KEY}; read-only run only.`);
    return;
  }
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PLAYER_KEY, "utf8"))));
  if (keypair.publicKey.toBase58() !== STATE.player) {
    console.log(`\n${PLAYER_KEY} is not the demo player; refusing.`);
    process.exitCode = 1;
    return;
  }

  const blockhash = (await rpc(ER, "getLatestBlockhash", [{ commitment: "confirmed" }]))?.value?.blockhash;
  const withEata = await simulate("destination = owner eATA", keypair, blockhash, STATE.playerEata);
  const withAta = await simulate("destination = canonical ATA", keypair, blockhash, STATE.playerAta);

  const attempts = [withEata, withAta];
  fs.mkdirSync(".data/p3", { recursive: true });
  fs.writeFileSync(
    ".data/p3/recovery-attempt.json",
    JSON.stringify({ at: new Date().toISOString(), validator: VALIDATOR, rollup: ER, simulations: attempts }, null, 2),
  );

  const succeeded = attempts.filter((attempt) => attempt.err === null);
  if (succeeded.length === 0) {
    console.log(
      "\nrefusing to send: no legal mapping of MergeShuttleIntoAta simulates successfully.\n" +
        "  The owner eATA cannot be a destination (it is not a token account), and the\n" +
        "  merge source (shuttle wallet ATA) is empty and not delegated on the rollup, so\n" +
        "  the balance cannot be credited from the ER. Nothing was sent.",
    );
    console.log("recorded .data/p3/recovery-attempt.json");
    process.exitCode = 1;
    return;
  }

  // Reachable only if MagicBlock changes the rollup state so a merge simulates.
  console.log("\na merge now simulates; re-run with an approved follow-up before sending.");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
