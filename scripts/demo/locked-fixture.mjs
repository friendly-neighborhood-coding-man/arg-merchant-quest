#!/usr/bin/env node
/**
 * Isolated collective-investigation fixture for the locked/unlocked proof.
 *
 * `cmp_p2_locked` already has a real clue milestone on Devnet at count 1
 * (`A1MWoo2ksY6yK1UxKpZ1stqXUqHUijzKL5QF5PadY1Xs`, re-derived by
 * scripts/chain/pda-reconcile.mjs). Its database row lived in a throwaway
 * database, so this script recreates only that row — same campaign id, so the
 * same on-chain milestone applies — with a demo-only slug whose fragment lives
 * in `src/lib/collective-fixture.ts`.
 *
 * Without `--unlock` it creates/repairs the row, publishes it, and captures the
 * locked state plus one live reply. It never writes chain state.
 *
 * With `--unlock` (only after explicit approval) it walks one player through the
 * trail and performs one staff handoff, which increments the completion counter
 * and the fixture's clue milestone on the ER, then captures the same question
 * again from the unlocked state.
 *
 * Usage: node scripts/demo/locked-fixture.mjs [--unlock] [baseUrl]
 */
import { DatabaseSync } from "node:sqlite";
import process from "node:process";

const args = process.argv.slice(2);
const UNLOCK = args.includes("--unlock");
const BASE = (args.find((value) => value.startsWith("http")) ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const DB = process.env.ARG_DATA_DIR ? `${process.env.ARG_DATA_DIR}/arg.db` : ".data/arg.db";

const FIXTURE_ID = "cmp_p2_locked";
const FIXTURE_SLUG = "p2-locked-fixture";
const FIXTURE_TITLE = "P2 Locked Fixture";
const FIXTURE_ANSWER = "5";
const FIXTURE_EXT_ANSWER = "11";
const QUESTION =
  "What does the shared investigation record say, and how should it change my theory that the answer is nine?";

function makeClient() {
  const cookies = new Map();
  return async function call(pathname, init = {}) {
    const headers = new Headers(init.headers);
    if (cookies.size) headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const response = await fetch(`${BASE}${pathname}`, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const at = pair.indexOf("=");
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const type = response.headers.get("content-type") ?? "";
    return {
      status: response.status,
      body: type.includes("application/json") ? await response.json() : await response.text(),
    };
  };
}

const json = (value) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

async function must(call, name, pathname, init) {
  const result = await call(pathname, init);
  if (result.status >= 400) throw new Error(`${name} failed (${result.status}): ${JSON.stringify(result.body).slice(0, 500)}`);
  return result.body;
}

function readRow() {
  const db = new DatabaseSync(DB);
  try {
    return db
      .prepare("SELECT id, slug, title, status FROM campaigns WHERE id = ? OR slug = ?")
      .get(FIXTURE_ID, FIXTURE_SLUG);
  } finally {
    db.close();
  }
}

const draft = {
  title: FIXTURE_TITLE,
  shopName: "Fixture Records (demo only)",
  shopArea: "Nowhere, demo fixture",
  shopAddress: "1 Fixture Lane (fictional, not a real shop)",
  teaser: "An isolated fixture used only for the locked-versus-unlocked comparison.",
  story:
    "FICTION: this campaign exists only to exercise the collective-investigation gate. It is not a shop, it is not offered to players, and its fragment is prewritten demo material.",
  targetObject: "The demo fixture card",
  targetObjectHint: "Clipped inside the fixture case at the counter.",
  answerQuestion: "How many stamps are marked SAMPLE on the card?",
  answer: FIXTURE_ANSWER,
  hint1: "Count the SAMPLE stamps only.",
  hint2: "Two stamps are marked SAMPLE; the third is unmarked.",
  extSocialClue: "A fixture post repeats the card's heading.",
  extWebClue: "The fixture page lists the count rule, not a visitor history.",
  extInstoreClue: "The card sits inside the case, second clip from the left.",
  extQuestion: "What number opens the card?",
  extAnswer: FIXTURE_EXT_ANSWER,
  extHint: "The card says the second count opens it.",
  optionalMode: "product_clue",
  productName: "the demo fixture case",
  productPriceLabel: "₩0 (demo fixture, never sold)",
  productProp: "the laminated fixture card",
  productClue:
    "The fixture card is an instruction: read the second count as the gate, and never treat it as a count of people. It adds no fact about any shop.",
  finalQuestion: "What does the fixture card open on?",
  finalAnswer: "7",
  finalHint: "The card opens on its second count.",
  endingTitle: "Fixture closed",
  endingBody: "FICTION: the fixture reached its comparison and was set aside.",
  achievementTitle: "Fixture Reader",
  achievementBody: "Completed the isolated locked/unlocked fixture.",
  rewardAmount: "1",
  couponItem: "Nothing is issued by the fixture",
  couponMinSpend: "0",
  couponValidDays: "7",
  couponNotes: "Demo fixture only.",
  onlineClues: [
    { title: "Fixture heading", body: "The card heading reads DEMO FIXTURE.", url: "https://example.com/fixture/heading" },
    { title: "Fixture rule", body: "The count is released clues, not people.", url: "https://example.com/fixture/rule" },
    { title: "Fixture stamps", body: "Both stamps are marked SAMPLE.", url: "https://example.com/fixture/stamps" },
  ],
  instoreClues: [{ title: "The card itself", body: "Count the SAMPLE stamps on the card.", url: "" }],
};

const merchant = makeClient();
let row = readRow();
if (!row) {
  const created = await must(merchant, "create", "/api/campaigns", json(draft));
  const campaign = created.campaign;
  if (campaign.slug !== FIXTURE_SLUG || campaign.id !== FIXTURE_ID) {
    const db = new DatabaseSync(DB);
    try {
      // Fixture only: the id must match the campaign id whose milestone already
      // exists on Devnet. The clue rows are the only children this brand-new
      // campaign has, so both tables move together inside one transaction.
      db.exec("PRAGMA foreign_keys = OFF");
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE clues SET campaign_id = ? WHERE campaign_id = ?").run(FIXTURE_ID, campaign.id);
        db.prepare("UPDATE campaigns SET id = ?, slug = ? WHERE id = ?").run(FIXTURE_ID, FIXTURE_SLUG, campaign.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      } finally {
        db.exec("PRAGMA foreign_keys = ON");
      }
    } finally {
      db.close();
    }
  }
  console.log(`fixture campaign created: ${FIXTURE_ID} / ${FIXTURE_SLUG}`);
  row = readRow();
} else {
  console.log(`fixture campaign already present: ${row.id} / ${row.slug} (${row.status})`);
}

const slug = row.slug;
if (row.status === "draft") {
  await must(merchant, "submit", `/api/campaigns/${row.id}/submit`, { method: "POST" });
  await must(merchant, "approve", `/api/campaigns/${row.id}/review`, json({ decision: "approve" }));
  console.log("fixture submitted and published");
}

const player = makeClient();
await must(player, "start", `/api/quests/${slug}/start`, { method: "POST" });
const state = await must(player, "investigation", `/api/quests/${slug}/investigation`);
console.log(`investigation: ${JSON.stringify(state.collective)}`);

const ask = await must(player, "companion", `/api/quests/${slug}/companion`, json({ message: QUESTION }));
if (!UNLOCK) {
  console.log(`question: ${QUESTION}`);
  console.log(`mode=${ask.mode} model=${ask.model ?? "null"} note=${ask.note ?? "none"}`);
  console.log(`reply: ${String(ask.reply).replace(/\s+/g, " ")}`);
  console.log(
    "\nLocked capture recorded. Re-run with --unlock only after approval: one player journey + one staff handoff increments the fixture's completion counter and clue milestone on the ER.",
  );
  process.exit(0);
}
console.log(`locked reply (this run): ${String(ask.reply).replace(/\s+/g, " ")}`);

async function readEvery(kind) {
  for (let step = 0; step < 8; step += 1) {
    const result = await player(`/api/quests/${slug}/progress`, json({ action: kind }));
    if (result.status < 400) continue;
    const message = JSON.stringify(result.body);
    if (result.status === 409 && /already (found|read) every/.test(message)) return;
    throw new Error(`${kind} failed (${result.status}): ${message.slice(0, 300)}`);
  }
  throw new Error(`${kind} did not settle after 8 reads`);
}

await readEvery("read-online");
await readEvery("read-instore");
await must(player, "answer", `/api/quests/${slug}/answer`, json({ answer: FIXTURE_ANSWER }));
const form = new FormData();
form.set("kind", "simulation");
form.set("capturedAt", new Date().toISOString());
form.set("photo", new File([Buffer.alloc(64, 0xff)], "fixture-simulated.jpg", { type: "image/jpeg" }));
const evidence = await must(player, "evidence", `/api/quests/${slug}/evidence`, { method: "POST", body: form });
await must(player, "review", `/api/evidence/${evidence.evidence.id}/review`, json({ decision: "approve" }));
for (let step = 0; step < 3; step += 1) {
  await must(player, "extended read", `/api/quests/${slug}/extended`, json({ action: "read" }));
}
await must(player, "extended answer", `/api/quests/${slug}/extended`, json({ action: "answer", answer: FIXTURE_EXT_ANSWER }));
const requested = await must(player, "product request", `/api/quests/${slug}/product`, json({ action: "request" }));
const handoff = await must(player, "handoff", "/api/product-claims/handoff", json({
  reference: requested.claim.reference,
  staffName: "staff.fixture",
  handoffConfirmed: true,
}));
console.log(`handoff chain: ${JSON.stringify(handoff.claim?.chain ?? handoff)}`);

const after = await must(player, "investigation after", `/api/quests/${slug}/investigation`);
console.log(`after unlock: ${JSON.stringify(after.collective)}`);
const again = await must(player, "companion after", `/api/quests/${slug}/companion`, json({ message: QUESTION }));
console.log(`mode=${again.mode} model=${again.model ?? "null"}`);
console.log(`reply: ${String(again.reply).replace(/\s+/g, " ")}`);
