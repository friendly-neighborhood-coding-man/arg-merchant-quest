#!/usr/bin/env node
/**
 * Live-AI verification walk against a running dev server.
 *
 * It drives the app's public HTTP API only, so every AI reply it prints came
 * from the same server path a browser uses:
 *
 *   A. one fresh player session on the seeded campaign, five clues, the counter
 *      answer, then a hypothesis Mara has to challenge
 *   B. one live Story Lab generation for a fictional shop
 *   C. the campaign's collective gate as the player sees it
 *
 * Usage: node scripts/demo/live-check.mjs [baseUrl]
 * Pair it with scripts/demo/provider-capture.mjs in front of the provider to
 * record the exact request and response bytes.
 */
import process from "node:process";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const SLUG = process.env.CHECK_SLUG ?? "the-ninth-cup";

function makeClient(label) {
  const cookies = new Map();
  async function call(pathname, init = {}) {
    const headers = new Headers(init.headers);
    if (cookies.size) {
      headers.set("cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    }
    const startedAt = Date.now();
    const response = await fetch(`${BASE}${pathname}`, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const type = response.headers.get("content-type") ?? "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, body, elapsedMs: Date.now() - startedAt, label };
  }
  return call;
}

async function must(call, name, pathname, init) {
  const result = await call(pathname, init);
  if (result.status >= 400) {
    throw new Error(`${name} failed (${result.status}): ${JSON.stringify(result.body).slice(0, 400)}`);
  }
  return result;
}

const json = (value) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

const player = makeClient("player");

// --- A. fresh player session, then a hypothesis challenge -------------------
const start = await must(player, "start", `/api/quests/${SLUG}/start`, { method: "POST" });
console.log(`A start            ${start.status} ${start.elapsedMs}ms`);

for (const action of ["read-online", "read-online", "read-online", "read-instore", "read-instore"]) {
  const read = await must(player, action, `/api/quests/${SLUG}/progress`, json({ action }));
  console.log(`A ${action.padEnd(16)} ${read.status} ${read.elapsedMs}ms`);
}

const answer = await must(player, "answer", `/api/quests/${SLUG}/answer`, json({ answer: "5" }));
console.log(`A answer "5"       ${answer.status} ${answer.elapsedMs}ms ok=${answer.body?.ok ?? "?"}`);

const challenge = await must(
  player,
  "companion",
  `/api/quests/${SLUG}/companion`,
  json({
    message:
      "My hypothesis: the reserved ninth cup means the shop made nine pours, so the answer is nine. Challenge this — which assumption is weakest?",
  }),
);
console.log(
  `A companion        ${challenge.status} ${challenge.elapsedMs}ms mode=${challenge.body.mode} model=${challenge.body.model ?? "null"}`,
);
console.log(`A note             ${challenge.body.note ?? "none"}`);
console.log(`A reply            ${String(challenge.body.reply).replace(/\s+/g, " ").slice(0, 700)}`);
console.log(`A collective       ${JSON.stringify(challenge.body.collective)}`);

// --- C. collective gate, then a second live reply that must use it ----------
const investigation = await must(player, "investigation", `/api/quests/${SLUG}/investigation`);
console.log(`C investigation    ${investigation.status} ${investigation.elapsedMs}ms ${JSON.stringify(investigation.body)}`);

const revisit = await must(
  player,
  "revisit",
  `/api/quests/${SLUG}/companion`,
  json({ message: "Revisit my earlier theory against the shared investigation evidence. Does it hold?" }),
);
console.log(`C revisit          ${revisit.status} ${revisit.elapsedMs}ms mode=${revisit.body.mode}`);
console.log(`C reply            ${String(revisit.body.reply).replace(/\s+/g, " ").slice(0, 700)}`);

// --- B. live Story Lab generation for a fictional shop ----------------------
const lab = await must(makeClient("merchant"), "story lab", "/api/merchant/story-drafts", json({
  businessName: "Paper Kite Records",
  location: "Yeonnam-dong, Seoul (fictional)",
  history:
    "A fictional second-hand record shop that opened in 2009. The owner claims the listening booth has been repaired eleven times.",
  product: "a hand-stamped mixtape",
  season: "late autumn",
  props: "a letterpress sleeve",
  atmosphere: "narrow, warm, slightly cluttered",
}));
console.log(`B story lab        ${lab.status} ${lab.elapsedMs}ms mode=${lab.body.mode} model=${lab.body.model ?? "null"}`);
console.log(`B note             ${lab.body.note}`);
for (const [index, concept] of (lab.body.concepts ?? []).entries()) {
  console.log(`B concept ${index + 1}         ${concept.title}`);
  console.log(`B   premise        ${String(concept.premise).replace(/\s+/g, " ").slice(0, 300)}`);
  console.log(`B   clues          ${(concept.onlineClues ?? []).length} online · product clue: ${String(concept.productClue).slice(0, 120)}`);
}
