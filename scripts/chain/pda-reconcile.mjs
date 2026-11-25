#!/usr/bin/env node
/**
 * Read-only PDA reconciliation.
 *
 * The same programme hosts two kinds of counter:
 *   completion counter : seeds ["counter", sha256(campaignId)]
 *   clue milestone     : seeds ["counter", sha256(`${campaignId}#clue`)]
 *
 * Earlier runs quoted addresses from both kinds, and one run quoted a campaign
 * id that only existed in a throwaway database. This script recomputes every
 * address from its seed, reads the committed value from Solana Devnet, and
 * prints which campaign each address belongs to — so the demo never confuses a
 * completion counter with a clue milestone again.
 *
 * It never signs, sends or changes anything.
 */
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Connection, PublicKey } from "@solana/web3.js";
import process from "node:process";

const PROGRAM_ID =
  process.env.ARG_COUNTER_PROGRAM_ID ?? "8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C";
const RPC = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DB_PATH = process.env.ARG_DATA_DIR
  ? `${process.env.ARG_DATA_DIR}/arg.db`
  : ".data/arg.db";

/** Campaign ids observed across the P0–P2 runs, including the P2 fixture. */
const EXTRA_IDS = ["cmp_p2_locked"];

function pdaFor(campaignId) {
  const seed = createHash("sha256").update(campaignId).digest();
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), seed],
    new PublicKey(PROGRAM_ID),
  );
  return address.toBase58();
}

function campaignIds() {
  const ids = new Set(EXTRA_IDS);
  try {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    for (const row of db.prepare("SELECT id FROM campaigns").all()) ids.add(row.id);
    db.close();
  } catch (error) {
    console.log(`(campaign table not readable: ${error.message}; seeding from the known ids)`);
  }
  for (const known of [
    "cmp_the_ninth_cup",
    "cmp_the_lantern_ledger",
    "cmp_2038baea-3679-4be6-9b34-676fcff45a24",
  ]) {
    ids.add(known);
  }
  return [...ids].sort();
}

async function committed(connection, address) {
  try {
    const info = await connection.getAccountInfo(new PublicKey(address));
    if (!info || info.data.length < 8) return null;
    const value = info.data.readBigUInt64LE(0);
    return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
  } catch (error) {
    return `error: ${error.message}`;
  }
}

const connection = new Connection(RPC, "confirmed");
console.log(`Program ${PROGRAM_ID} on Solana Devnet (${RPC})`);
console.log("Seeds: [\"counter\", sha256(campaignId)] for completions, [\"counter\", sha256(campaignId + \"#clue\")] for clue milestones\n");

for (const id of campaignIds()) {
  for (const suffix of ["", "#clue"]) {
    const seedId = `${id}${suffix}`;
    const address = pdaFor(seedId);
    const value = await committed(connection, address);
    const kind = suffix ? "clue milestone  " : "completion count";
    console.log(
      `${kind} ${seedId.padEnd(58)} ${address}  committed=${value === null ? "not created" : value}`,
    );
  }
}
console.log("\nThis command only reads. No key, program or counter was changed.");
