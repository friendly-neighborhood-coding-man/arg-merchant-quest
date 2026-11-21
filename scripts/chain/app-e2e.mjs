#!/usr/bin/env node
/**
 * Walks the playable quest through the app's own HTTP API and checks the
 * Devnet payout against the chain. Run it against a local dev server:
 *
 *   node scripts/chain/app-e2e.mjs [baseUrl]
 *
 * It starts a quest, answers the counter, submits a labelled simulation photo,
 * approves it as the operator, claims the reward to a freshly generated wallet,
 * and prints the payout signature plus the recipient's before/after balance.
 */
import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { baseConnection } from "./_rpc.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const SLUG = process.env.E2E_SLUG ?? "the-ninth-cup";
const cookies = new Map();

function rememberCookies(response) {
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

async function call(pathname, init = {}) {
  const headers = new Headers(init.headers);
  if (cookies.size) {
    headers.set("cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
  }
  const response = await fetch(`${BASE}${pathname}`, { ...init, headers, redirect: "manual" });
  rememberCookies(response);
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await response.json() : await response.text();
  return { status: response.status, body };
}

function step(name, value) {
  console.log(`[e2e] ${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

const start = await call(`/api/quests/${SLUG}/start`, { method: "POST" });
step("start", start.status);
if (start.status >= 400) process.exit(1);

for (const action of ["read-online", "read-online", "read-online", "read-instore", "read-instore"]) {
  const progress = await call(`/api/quests/${SLUG}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  step(action, progress.status);
}

const answer = await call(`/api/quests/${SLUG}/answer`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ answer: "5" }),
});
step("answer", answer.body);

const photo = new File([Buffer.alloc(64, 0xff)], "simulated.jpg", { type: "image/jpeg" });
const form = new FormData();
form.set("kind", "simulation");
form.set("capturedAt", new Date().toISOString());
form.set("photo", photo);
const evidence = await call(`/api/quests/${SLUG}/evidence`, { method: "POST", body: form });
step("evidence", evidence.body);
const evidenceId = evidence.body?.evidence?.id ?? evidence.body?.id;
if (!evidenceId) process.exit(1);

const review = await call(`/api/evidence/${evidenceId}/review`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ decision: "approve" }),
});
step("review", { status: review.status, chain: review.body?.chain ?? review.body?.completion?.chain });

const recipientFile = path.join(".data", "chain", "e2e-recipient.json");
let recipient;
if (fs.existsSync(recipientFile)) {
  recipient = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(recipientFile, "utf8"))));
} else {
  recipient = Keypair.generate();
  fs.writeFileSync(recipientFile, JSON.stringify(Array.from(recipient.secretKey)));
}
step("recipient", recipient.publicKey.toBase58());

const claim = await call(`/api/quests/${SLUG}/reward`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ wallet: recipient.publicKey.toBase58() }),
});
step("claim", claim.body);

const status = await call(`/api/quests/${SLUG}/reward`);
step("status", status.body);

const connection = baseConnection();
const payout = status.body?.reward?.payout ?? status.body?.payout;
if (payout?.signature) {
  step("explorer", `https://explorer.solana.com/tx/${payout.signature}?cluster=devnet`);
  const signature = await connection.getSignatureStatuses([payout.signature]);
  step("confirmed", signature.value[0]?.confirmationStatus ?? "unknown");
  step("recipient balance", status.body?.reward?.recipientBalance ?? status.body?.recipientBalance);
}
