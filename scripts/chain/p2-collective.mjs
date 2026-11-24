#!/usr/bin/env node
/**
 * P2 collective-gate evidence.
 *
 * Runs two separate eligible product-clue handoffs for the same campaign through
 * the app's own HTTP API, and records the campaign-wide MagicBlock clue
 * milestone before, between and after them. It also captures what the
 * investigation companion may use at each point.
 *
 *   node scripts/chain/p2-collective.mjs [baseUrl]
 *
 * Requirements: the app is running with the deployed completion-counter
 * program, the demo treasury and a database whose seeded Ninth Cup campaign has
 * never recorded a clue handoff. The counter account is read from the base
 * layer at the end and compared with what the app reports.
 *
 * Nothing here writes chain state itself: the two handoffs are the only
 * mutations, and they go through the normal staff route.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const BASE = process.argv[2] ?? process.env.P2_BASE_URL ?? "http://127.0.0.1:3000";
const SLUG = process.env.P2_SLUG ?? "the-ninth-cup";
const BASE_RPC = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

function client(label) {
  const cookies = new Map();
  async function call(pathname, init = {}) {
    const headers = new Headers(init.headers);
    if (cookies.size) {
      headers.set("cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    }
    const response = await fetch(`${BASE}${pathname}`, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const type = response.headers.get("content-type") ?? "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, body };
  }
  call.label = label;
  return call;
}

function show(name, value) {
  console.log(`[${name}] ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function must(call, name, pathname, init) {
  const result = await call(pathname, init);
  if (result.status >= 400) {
    throw new Error(`${name} failed (${result.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function investigation(call) {
  return (await call(`/api/quests/${SLUG}/investigation`)).body;
}

/** Walk one fresh player to a product reference, using only the public API. */
async function journeyToReference(call) {
  await must(call, "start", `/api/quests/${SLUG}/start`, { method: "POST" });
  for (const action of ["read-online", "read-online", "read-online", "read-instore", "read-instore"]) {
    await must(call, action, `/api/quests/${SLUG}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
  }
  await must(call, "answer", `/api/quests/${SLUG}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answer: "5" }),
  });

  const form = new FormData();
  form.set("kind", "simulation");
  form.set("capturedAt", new Date().toISOString());
  form.set("photo", new File([Buffer.alloc(64, 0xff)], "p2-simulated.jpg", { type: "image/jpeg" }));
  const evidence = await must(call, "evidence", `/api/quests/${SLUG}/evidence`, {
    method: "POST",
    body: form,
  });
  const evidenceId = evidence.evidence?.id;
  if (!evidenceId) throw new Error("no evidence id returned");

  // Operator approval also runs the campaign completion counter on the ER.
  await must(call, "review", `/api/evidence/${evidenceId}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });

  for (let step = 0; step < 3; step += 1) {
    await must(call, "extended read", `/api/quests/${SLUG}/extended`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read" }),
    });
  }
  await must(call, "extended answer", `/api/quests/${SLUG}/extended`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "answer", answer: "11" }),
  });

  const requested = await must(call, "product request", `/api/quests/${SLUG}/product`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "request" }),
  });
  return requested.claim?.reference;
}

async function handoff(call, reference, staffName) {
  return must(call, "handoff", "/api/product-claims/handoff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reference, staffName, handoffConfirmed: true }),
  });
}

async function askMara(call, message) {
  const result = await call(`/api/quests/${SLUG}/companion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return { status: result.status, reply: result.body?.reply ?? "", mode: result.body?.mode ?? null };
}

async function committedOnBase(counter) {
  try {
    const connection = new Connection(BASE_RPC, "confirmed");
    const account = await connection.getAccountInfo(new PublicKey(counter));
    if (!account || account.data.length < 8) return null;
    const value = account.data.readBigUInt64LE(0);
    return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
  } catch (error) {
    return { error: error.message };
  }
}

async function erTransaction(endpoint, signature) {
  if (!signature) return null;
  try {
    const connection = new Connection(endpoint, "confirmed");
    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!transaction) return { found: false };
    return {
      found: true,
      slot: transaction.slot,
      err: transaction.meta?.err ?? null,
      fee: transaction.meta?.fee ?? null,
    };
  } catch (error) {
    return { error: error.message };
  }
}

const alice = client("alice");
const bob = client("bob");

await must(alice, "alice start", `/api/quests/${SLUG}/start`, { method: "POST" });
const before = await investigation(alice);
show("ER state before any handoff", before.collective);
// The seeded campaign id is stable, so the milestone account is the one an
// earlier run already incremented. It can start at 0 (missing account), 1 (a
// previous verified handoff) or higher; only an already-unlocked start cannot
// demonstrate the transition and is refused.
if (before.collective?.locked === false) {
  throw new Error(
    "This campaign's clue milestone is already unlocked. Re-run against a campaign whose count is below 2.",
  );
}
const startCount = before.collective?.count ?? 0;

const aliceReference = await journeyToReference(alice);
show("alice reference", aliceReference);
const maraBefore = await askMara(
  alice,
  "Revisit my earlier theories with the shared investigation evidence.",
);
show("Mara before the second handoff", maraBefore.reply);

const first = await handoff(alice, aliceReference, "P2 demos: staff A");
show("first handoff chain", first.chain);
const afterFirst = await investigation(alice);
show("ER state after first handoff", afterFirst.collective);

const bobReference = await journeyToReference(bob);
show("bob reference", bobReference);
const maraAfterFirst = await askMara(
  bob,
  "Revisit my earlier theories with the shared investigation evidence.",
);
show(`Mara at count ${afterFirst.collective?.count ?? "?"}`, maraAfterFirst.reply);

const second = await handoff(bob, bobReference, "P2 demos: staff B");
show("second handoff chain", second.chain);
const afterSecond = await investigation(bob);
show("ER state after second handoff", afterSecond.collective);

const aliceAfter = await investigation(alice);
show("alice sees the campaign-wide state", aliceAfter.collective);

const maraAfter = await askMara(
  alice,
  "Revisit my earlier theories with the shared investigation evidence.",
);
show("Mara after the second handoff", maraAfter.reply);

const endpoint = second.chain?.erEndpoint ?? afterSecond.collective?.erEndpoint;
const commitCheck = await erTransaction(endpoint, second.chain?.commitSignature);
const incrementCheck = await erTransaction(endpoint, second.chain?.incrementSignature);
const baseCommitted = await committedOnBase(afterSecond.collective?.counter);

const report = {
  campaign: SLUG,
  counter: afterSecond.collective?.counter ?? null,
  erEndpoint: endpoint ?? null,
  before: before.collective,
  firstHandoff: {
    incrementSignature: first.chain?.incrementSignature ?? null,
    commitSignature: first.chain?.commitSignature ?? null,
    counterValue: first.chain?.counterValue ?? null,
    committedValue: first.chain?.committedValue ?? null,
  },
  afterFirst: afterFirst.collective,
  secondHandoff: {
    incrementSignature: second.chain?.incrementSignature ?? null,
    commitSignature: second.chain?.commitSignature ?? null,
    counterValue: second.chain?.counterValue ?? null,
    committedValue: second.chain?.committedValue ?? null,
  },
  afterSecond: afterSecond.collective,
  baseLayerCommitted: baseCommitted,
  erCommitTransaction: commitCheck,
  erIncrementTransaction: incrementCheck,
  mara: {
    beforeUnlock: maraBefore.reply,
    afterFirstHandoff: maraAfterFirst.reply,
    afterSecondHandoff: maraAfter.reply,
    beforeUnlockHadEvidence: maraBefore.reply.includes(
      afterSecond.collective?.evidence?.text ?? "__none__",
    ),
    afterUnlockHadEvidence: maraAfter.reply.includes(
      afterSecond.collective?.evidence?.text ?? "__none__",
    ),
  },
  checks: {
    beforeLocked: before.collective?.locked === true,
    distinctHandoffs: Boolean(aliceReference) && Boolean(bobReference) && aliceReference !== bobReference,
    firstIncremented: afterFirst.collective?.count === startCount + 1,
    firstLockMatchesThreshold:
      afterFirst.collective?.locked === ((afterFirst.collective?.count ?? 0) < 2),
    secondIncremented: afterSecond.collective?.count === (afterFirst.collective?.count ?? 0) + 1,
    secondUnlocked: afterSecond.collective?.locked === false,
    baseMatches: baseCommitted === afterSecond.collective?.count,
    evidenceOnlyWhenUnlocked:
      (before.collective?.locked ? (before.collective?.evidence ?? null) === null : true) &&
      (afterFirst.collective?.locked ? (afterFirst.collective?.evidence ?? null) === null : true) &&
      Boolean(afterSecond.collective?.evidence?.text),
    aliceSeesCampaignWideState: aliceAfter.collective?.count === afterSecond.collective?.count,
    maraChanged: maraBefore.reply !== maraAfter.reply,
  },
};

console.log("\nP2_COLLECTIVE_EVIDENCE");
console.log(JSON.stringify(report, null, 2));
const failed = Object.entries(report.checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error("Failed checks:", failed.map(([name]) => name).join(", "));
  process.exit(1);
}
