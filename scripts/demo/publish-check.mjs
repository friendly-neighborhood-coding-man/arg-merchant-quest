#!/usr/bin/env node
/**
 * Merchant publish walk: live Story Lab idea -> campaign -> submit -> operator
 * approval -> published -> reachable from a *separate* player session.
 *
 * It uses the same public HTTP API the merchant and operator pages use. The
 * concept text is the live Story Lab output captured during this demo run; it is
 * left in the script so the walk is reproducible without spending another
 * generation. Nothing here creates chain state.
 */
import process from "node:process";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");

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

const merchant = makeClient();

const draft = {
  title: "The Eleventh Repair",
  shopName: "Paper Kite Records",
  shopArea: "Yeonnam-dong, Seoul (fictional)",
  shopAddress: "12 Fictional-ro, Yeonnam-dong, Seoul (fictional)",
  teaser: "The listening booth has been repaired eleven times. The tags disagree.",
  story:
    "FICTION: in this game, an unnamed repair technician left a stamped note inside the listening booth after each repair. The shop is fictional and this backstory is invented for the trail.",
  targetObject: "The repair tag taped inside the listening booth",
  targetObjectHint: "Inside the booth, on the right panel, behind the headphone hook.",
  answerQuestion: "How many repairs does the tag strip record?",
  answer: "11",
  hint1: "Count the stamps on the tag strip, not the years.",
  hint2: "Eleven stamps are visible; the twelfth line is blank, so it is not a repair yet.",
  extSocialClue: "A fictional post shows the booth with a different number of tags.",
  extWebClue: "The shop's fictional about page says the booth was serviced twice in one year.",
  extInstoreClue: "The tag strip hangs beside the booth, one line still blank.",
  extQuestion: "How many service years does the booth's fictional page claim?",
  extAnswer: "6",
  extHint: "Two services in three of those years.",
  optionalMode: "product_clue",
  productName: "a hand-stamped mixtape",
  productPriceLabel: "₩11,000 (demo simulation)",
  productProp: "a letterpress sleeve",
  productClue:
    "The hand-stamped mixtape's sleeve is stamped: take your completed repair list, subtract the number of the track you last played, and the remainder is the shelf order. It is an instruction, not another fact.",
  finalQuestion: "What shelf order does the sleeve give?",
  finalAnswer: "7",
  finalHint: "Eleven repairs minus the fourth track.",
  endingTitle: "Side C",
  endingBody: "FICTION: the booth's blank twelfth line was reserved for a repair that never happened.",
  achievementTitle: "Booth Listener",
  achievementBody: "You closed the booth's repair ledger on the demo trail.",
  rewardAmount: "1",
  couponItem: "Sleeve-insert mixtape (demo, not issued in product mode)",
  couponMinSpend: "0",
  couponValidDays: "7",
  couponNotes: "Fictional demo entitlement, no cash value.",
  onlineClues: [
    {
      title: "A fictional repair log post",
      body: "The booth's tag strip is photographed with the twelfth line still blank.",
      url: "https://example.com/paper-kite/repair-log",
    },
    {
      title: "The shop's fictional about page",
      body: "It claims the booth was serviced twice in one year, which the tag strip cannot support.",
      url: "https://example.com/paper-kite/about",
    },
    {
      title: "A customer's fictional photo",
      body: "The headphone hook hides half of the tag strip in every photo.",
      url: "https://example.com/paper-kite/booth",
    },
  ],
  instoreClues: [
    {
      title: "The tag strip itself",
      body: "Count the stamps at the counter; the last line has no stamp.",
      url: "",
    },
  ],
};

const created = await merchant("/api/campaigns", json(draft));
if (created.status !== 201) {
  console.log("create failed", created.status, JSON.stringify(created.body).slice(0, 900));
  process.exit(1);
}
const campaign = created.body.campaign;
console.log(`create            201 id=${campaign.id} slug=${campaign.slug} status=${campaign.status}`);

const submitted = await merchant(`/api/campaigns/${campaign.id}/submit`, { method: "POST" });
console.log(`submit            ${submitted.status} status=${submitted.body.campaign?.status ?? JSON.stringify(submitted.body).slice(0, 300)}`);

const approved = await merchant(`/api/campaigns/${campaign.id}/review`, json({ decision: "approve" }));
console.log(`approve           ${approved.status} status=${approved.body.campaign?.status ?? JSON.stringify(approved.body).slice(0, 300)}`);

const listed = await fetch(`${BASE}/api/campaigns`).then((response) => response.json());
const shown = (listed.campaigns ?? []).find((entry) => entry.id === campaign.id);
console.log(`public listing    ${shown ? `present status=${shown.status} title=${shown.title}` : "MISSING"}`);

// A separate client with its own cookies is the "separate player session".
const player = makeClient();
const page = await player(`/quests/${campaign.slug}`);
console.log(`player page       ${page.status}`);
const started = await player(`/api/quests/${campaign.slug}/start`, { method: "POST" });
console.log(`player start      ${started.status} session=${started.body.sessionId ?? "none"}`);

const ask = await player(
  `/api/quests/${campaign.slug}/companion`,
  json({ message: "My hypothesis: the blank line means the twelfth repair was cancelled. Does that fit?" }),
);
console.log(`player companion  ${ask.status} mode=${ask.body.mode} model=${ask.body.model ?? "null"} note=${ask.body.note ?? "none"}`);
console.log(`player reply      ${String(ask.body.reply).replace(/\s+/g, " ").slice(0, 500)}`);
