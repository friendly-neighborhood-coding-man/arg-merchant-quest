# Live demo runbook

Status: P1 “Living ARG”, P1 R2 “Playable Experience & Demo Polish” and P2 “MagicBlock Adaptive Intelligence”. The API/HTTP journey was already proven with a real Devnet payout and MagicBlock ER counter. R2 re-walked both product-clue campaigns in a real Chromium browser at 375/390/768/1280 px, including the seeded *The Ninth Cup* and a merchant-created *The Midnight Jar*. P2 was proven with two live ER clue handoffs and a Chromium check of the locked and unlocked shared-investigation panel. The live LLM path now runs on the official Claude API (`claude-opus-5-5`) and was exercised for real on 2026-11-25: model access, a genuine completion, the live Story Lab, a merchant→player publish walk and the unlocked collective reply, with the exact provider bytes recorded (see the Live AI run below). A final demonstration pass on 2026-11-25 added an isolated locked-versus-unlocked comparison on a real second milestone, re-derived every counter PDA with a read-only script, rendered the companion's Markdown safely, and re-verified the app in production mode against the default Anthropic endpoint. See *Final demonstration pass* below, and `docs/FINAL_DEMO.md` for the rehearsed merchant and player walkthroughs.

## Setup

- Fictional merchant/store: **Umbra Coffee Roasters**, Seongsu-dong (fictional address)
- Online clue sources: in-app fictional demo pages at `/demo/umbra-roasters/...`
- Merchant website clue: `/demo/umbra-roasters/about`
- In-store observation: the framed 1998 stall photo and the ninth cup on the top shelf (described; no physical prop in this prototype)
- Network: **Solana Devnet**
- Test-token mint: `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1` — valueless **tUSDC / “ARG demo test token”** (6 decimals). This is **not** Circle USDC; the Circle devnet faucet was unusable from this environment (bot check).
- Reward treasury: `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N`
- Completion-counter program: `8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C` (program data `GUdp8L5WGi6CyprZjz7euqxfKcgm7YT81KzfjeTEe3Nq`)
- MagicBlock: Ephemeral Rollup, router `https://devnet-router.magicblock.app`; the run below resolved to `https://devnet-as.magicblock.app`
- Demo coupons: fictional, one per extended completion, no cash value, not redeemable at a real business

Check the live configuration before a rehearsal:

```bash
npm run chain:state
```

This is read-only and prints the treasury address, SOL and token balances, the mint, the program and each campaign counter with its committed value and delegating ER. It never prints the secret key.

## One continuous walkthrough

Start with a clean demo database if you want the exact flow below: stop the dev server, run `npm run db:reset`, then `npm run dev`.

### 1. Merchant creates and submits (P0.1)

1. Open `/merchant` → **+ New campaign**.
2. Fill the campaign: a shop, story, target object, counter question and answer, coupon item, minimum spend and validity. Add at least one online and one in-store clue, and the optional extended mystery.
3. Save the draft, open it, then **Submit**. The campaign becomes *In review* and is locked for edits.

### 2. Operator publishes (P0.1)

4. Open `/operator`, review the campaign, and **Approve**. It appears in player discovery on `/quests`.

### 3. Player solves the trail (P0.2)

5. `/quests` → the campaign → **Start the quest**. The clock starts.
6. Read the online sources one at a time, then the two in-store clues. The in-store half only unlocks after the online trail is read.
7. Answer the counter (for *The Ninth Cup*: four shelves + one for the ninth cup = `5`). The 3- and 5-minute hints unlock from the session start, not from a refresh.
8. Enable the camera and capture, upload a photo, or use the labelled demo simulation. Share location or decline it. Submit.

### 4. Operator verifies, chain records (P0.2 + P0.3)

9. `/operator/evidence` → compare the photo with the private target description → **Approve**.
10. The completion is written, the campaign counter is created/delegated if needed, incremented **on the MagicBlock Ephemeral Rollup**, and committed back to Devnet.
11. Back on the quest page: verified banner, stopped clock, fixed reward, coupon locked until the second question.

### 5. Player claims the real Devnet reward (P0.3)

12. In **Reward · Solana Devnet**, paste a Devnet address and press **Send 1.00 tUSDC**. The panel shows the signature, the recipient token account and the before/after balance.
13. The **ER increment** and **ER commit** rows open `/chain/er/<signature>?endpoint=…`, which reads the transaction from the actual MagicBlock ER. The committed counter value is linked on ordinary Solana Explorer, because that value lives on the base layer.

### 6. Player solves the ARG and receives the coupon (P0.4)

14. Open the second question, read its three parts, answer `11` (nine on the stall + the ninth + the eleventh). Since P1, *The Ninth Cup* is a product-clue campaign, so it unlocks the product request instead (see the P1 run below). Steps 15–21 apply to a **coupon-mode** campaign — create one in `/merchant` with *Optional ending → Demo coupon*.
15. A **demo secret-menu coupon** appears immediately: unique code, merchant and shop, item, minimum purchase, issue time, expiry, status and instructions to show it to staff.
16. `/quests#coupons` shows the same coupon after a refresh or a later visit.

### 7. Staff redeems it once (P0.4)

17. Open `/staff`, type the code (for example `NINTH-7Q4K-9XZ2`) and **Look up coupon**.
18. The full ticket appears with the campaign's minimum-spend condition and validity.
19. Tick *I confirm that the fictional purchase condition for this demonstration has been met*, keep or change the demo staff name, and press **Redeem this demo coupon**.
20. The coupon becomes **Redeemed** with the timestamp and staff identity. Looking the same code up again and trying to redeem it is refused: a coupon can only be used once.
21. Try an unknown code (invalid) and a coupon whose expiry has passed (expired): each has its own clear message and no state change.

### 8. Merchant sees the result (P0.4)

22. `/merchant` → **What your trails produced**: verified demo completions, payouts paid/pending/failed, extended ARG solves, coupons issued and coupons redeemed, per campaign and in total.
23. **Latest from your trails** shows the verified completion, the coupon issue and the staff redemption with timestamps.

## What each count means

| Label | Source |
| --- | --- |
| Verified demo completions | `quest_completions` rows written by operator approval |
| Devnet payouts paid | completions with `payout_status = 'paid'` and a stored signature |
| Payouts pending / failed | completions still unclaimed or with a recorded RPC error |
| Extended ARG solved | completions with `extended_solved = 1` |
| Demo coupons issued | `coupons` rows, one per extended completion |
| Demo coupons redeemed | coupons with `status = 'redeemed'` |

No revenue, real purchases, foot traffic or conversion rate is derived from these numbers.

## Chain evidence from the P0.3 run (2026-11-21)

Campaign *The Ninth Cup* (`the-ninth-cup`), counter PDA `tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN`:

| Step | Signature / address |
| --- | --- |
| Create counter | `24yTF8M11JSyLMw83nsJjeNWb9KWPmDKxMcwDeHWh1gEb5QDCqCkxjcQJYe7Y9nDFGLHeXtbcjtL3jMcMB8fr3kY` |
| Delegate to ER | `2PLQ7xzaMmfSoe9rbUj5jxAEeGgHXfRGQQCoHMu7m2aEnp5fpEFz24EQR5yfWYXmsBvFWDCgwPv8cADKQ84LS4V7` |
| Increment on ER | `SeZzXjEDhj4NMmcQycj5HBxMqRsf46ZNZ2JPhmxYZzid7uV8HEJwTSF1hbu2Ub6CVcVTqgnokcKLqgfPf493TYd` |
| Commit intent on ER | `3aQtNLznNUGUH9dfmiBbFuDNa3UknDV8kafWcyUbZXPKCDDqiXroBYksUce9NeSULzQVertMskGVhCecgxxDxFmf` |
| Counter value after | 2 verified completions (base layer) |

The increment and commit are Ephemeral Rollup transactions, visible only from `devnet-as.magicblock.app` — querying `api.devnet.solana.com` for them correctly returns null. Open the completion's ER rows in the app to see the verification page.

Payout to `3PKvZD6Y12WB6Bsidae3AS8CegcLJ4tpewm3RBy8QfnY`:

| Field | Value |
| --- | --- |
| Transfer | `H72C1YWT35Ci8cVavdjmKpWYaB2C9sPBp9HNJ5sxTN7negdoCwxWHGBKXXKA77SQ8RWrE67grbMCQhZ39tx8cpM` |
| Explorer | https://explorer.solana.com/tx/H72C1YWT35Ci8cVavdjmKpWYaB2C9sPBp9HNJ5sxTN7negdoCwxWHGBKXXKA77SQ8RWrE67grbMCQhZ39tx8cpM?cluster=devnet |
| Amount | 1.00 tUSDC = 1,000,000 base units |
| Recipient balance | 1,000,000 (1.000000 tUSDC) after the transfer |

Counter account on Explorer: https://explorer.solana.com/address/tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN?cluster=devnet

Reproduce the chain legs with `node scripts/chain/app-e2e.mjs` against a running dev server, and `npx --yes tsx@4 scripts/chain/selftest.ts` for the chain-only lifecycle.

## P0.4 run (2026-11-21)

A second campaign, **The Lantern Ledger** at Paper Moon Books, was created through the merchant form, submitted, approved in the operator console, played through the staged trail, evidenced with a labelled simulation, verified, paid and solved.

| Step | Signature / address |
| --- | --- |
| Campaign counter PDA | `bDWneSE3FCsuNjHBArvp2NFzH3cFNSFwGe1ZnTuMo2a` |
| Delegate to ER | `66MDTKzCZ2gjjwwTfj53PmVuBaQneaB6qN5PjbnBZU7mGFiAcnwBt4uy3dz9cjpvZmEfy8ExqHY9uWdRPa76yNXr` |
| Increment on ER | `2WRK2tmfeZCKZmS4ehDjBbeRjTY5XK5GaTGboHrDFuYgDrcvHFa1StkKfuVEG8W24t2Pp5atZnTE2vqcmr2b8Pg4` |
| Commit intent on ER | `4ardHobBTpbtXbxMQAxfmLtP3JbXQ4QS257FEwLVKYfwhobzC4hgEyRxehGjKW6pbxubWHCDhPLTq2vXQVUmSoaF` |
| ER endpoint | `https://devnet-as.magicblock.app` (the router chose the Asia region) |
| Committed counter value | 1, read from the base layer |
| Payout | `3KEpDqXCkn3VD5EsyNyZy73PLExDf3YmrEdVr1ccsSTpja8vB17XpZbACuUMT48zFy61SrX4vPXLUACzEBcX58fG` |
| Recipient | `CdhwzBqWcgm6eVkcJeLKnWyvZ4KZDSYUGfRSnVKvyRgD` · 0 → 1,000,000 base units (1.00 tUSDC) |
| Coupon | `LANTER-3T5F-D9T9` · ₩12,000 minimum · valid 7 days · issued 21 Nov 19:25 UTC · redeemed 21 Nov 19:28 UTC by `staff.demo` |

The staff checks produced the intended outcomes: unknown code → 404, expired coupon → 410, duplicate redemption → 409, redemption without the explicit demo-condition confirmation → 400. The coupon and its redeemed state survived a full server restart, and `/quests#coupons` still showed it afterwards. The merchant dashboard reported 1 verified completion, 1 paid payout, 1 extended solve, 1 coupon issued and 1 redeemed.

Screenshots from this run: `artifacts/p04-coupon-desktop.png`, `artifacts/p04-coupon-mobile-390.png`, `artifacts/p04-staff-lookup.png`, `artifacts/p04-staff-redeemed.png`, `artifacts/p04-staff-mobile-390.png`, `artifacts/p04-coupons-mobile-390.png` (all under the gitignored `artifacts/` directory).

## Coupon lifecycle states

| State | Meaning | Staff action |
| --- | --- | --- |
| Issued | Earned by a verified completion that solved the extended mystery; inside its validity window | Look up, confirm the demo condition, redeem once |
| Redeemed | A staff member confirmed and redeemed it; timestamp and demo staff name stored | No further redemption possible |
| Expired | The validity window passed before redemption | No redemption; the player keeps the achievement and completion |

## Known limitations for the reviewer

- Coupons are fictional demo entitlements: no cash value, not a real offer, not redeemable at any real business.
- There is no POS integration and no payment verification. Staff tick a box to confirm the fictional purchase condition.
- Staff identity is a typed demo name, not an authenticated account. Anyone with the URL can open `/staff`.
- The reward and the coupon are independent: the coupon is issued even if the player never claims, or the payout fails.
- No notification is sent to the merchant; the dashboard reflects the database.

## P1 “Living ARG” run (2026-11-21)

### One continuous demonstration script

1. **Merchant** — `/merchant` → open *The Ninth Cup* product-mode campaign. Point out the product section: signature item, simulated price, prop and the private clue (revealed only after a handoff). Optionally use the **Story lab** to generate three draft concepts; nothing is auto-published.
2. **Operator** — `/operator` → approve a submitted campaign. The campaign preview now shows the extended deduction, product clue and final answer so the operator can review playability.
3. **Player, free trail** — `/quests/the-ninth-cup` → **Start**. Read three online records, then two in-store observations. Answer `5`. Submit camera, upload or labelled simulation evidence. No purchase is involved at any point.
4. **Operator verifies** — `/operator/evidence` → approve. The app increments the original campaign completion counter on MagicBlock and stores the real signatures.
5. **Player claims** — paste a Devnet address and claim 1.00 tUSDC. This happened **before** the optional mystery in the test run, which proves the fixed reward does not depend on any product order.
6. **Companion (optional)** — open **Mara · investigation companion**. Ask “What have we discovered?”, “How might these two clues be connected?”, “What should I inspect next?” and “I have no idea what to do.” The panel labels the mode: live AI if configured, otherwise **Scripted guide**.
7. **Extended deduction** — open the optional mystery (also reachable from the sticky **Optional mystery** jump on mobile). The question is *how many cups does the letter count in total?* Answer `11` (nine cups on the 1998 stall plus the two that never went home). A wrong answer such as `2` is rejected without revealing anything. This unlocks the product request, not a coupon.
8. **Product request** — press **Request the clue**. A reference such as `NINTH-CLUE-8BP5` appears, with explicit simulation language and no payment. Try the final answer now: the server returns 409 because the clue is still locked.
9. **Staff handoff** — `/staff` → **Product clue handoff** → enter the reference. Confirm the fictional serving condition and press **Confirm handoff**. The app looks up the product and releases the clue once; a second handoff is refused. This is also where the separate clue milestone is created/delegated/incremented on the ER and committed.
10. **Clue reveal** — back on the quest page, the product section shows the digital sleeve-insert prop and the clue. Ask the companion about it; its answer now references the sleeve instruction and the recorded ER milestone.
11. **Hidden ending** — submit a wrong final answer first: useful feedback, no reveal, attempt count increments. Then submit `19`. The hidden ending “The Nineteenth Pour” and the achievement **Keeper of the Nineteenth Pour** appear. No extra payout is made.
12. **Merchant** — `/merchant` shows product clues released, hidden endings, extended solves and the activity feed in **KST**. `/quests#achievements` keeps the achievement after a restart.
13. **Regression** — open the legacy *Lantern Ledger* coupon `LANTER-3T5F-D9T9` at `/staff`; it still reads as redeemed and the campaign still uses coupon mode.

### P1 evidence

| Step | Value |
| --- | --- |
| Free reward (claimed before product) | `4Cf5gGwPsnvjFJyyeNeTWqnMizKV9dX5oMzUKXP9um9VEtoDmghg1CASCgxSBRynNTw9CSt7m7FSNbEE7LVt7fwU` |
| Recipient | `6zn8exb9h6Qjwz7ZVS2yDkds5b7ba2LZnxRKo7hZ4zsS` · 0 → 1.00 tUSDC |
| Campaign counter | `tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN`, committed value 3 |
| Clue milestone PDA | `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` (derived from `cmp_the_ninth_cup#clue`) |
| Milestone create | `4pvs4iddPt1SD2dCNcc4n8rFwFkBExDseVGpYnjojz6Y17su9qidCjZsurYf53Lx3WXNjYPUZz8UkpzVk5n9BATj` |
| Milestone delegate | `2G8fpc16bWCq2AEcxMT84HTebB6GxUFCakBL7nuwtrG8NzajwjewoAv3bjF8TvM1fPKmaw2y7aosKhr6TAyrFxu5` |
| Milestone ER increment | `43YZJb8PjL1ZxoyQka2MYRmwB1wWj1hvNYBYrFwk8b3ppmRsCxoegxnsnZnqXLtV3kHHuxrDxAEBhHSqAtgrG8Tf` |
| Milestone commit | `5QcNv2iYiuQsw6UYPfjaj2qBs7suU4dsR72JwfJoEJeqJ1y4oL2f8Kwyah11jJRfU3RpiePcJC7vQVijBDvwL3dd` |
| ER endpoint / committed value | `https://devnet-as.magicblock.app/` · 1 |
| Product reference | `NINTH-CLUE-8BP5` (single handoff, duplicate 409) |
| Final answer | `19`; premature submit 409, wrong answer 422 with hint, attempts recorded |
| AI mode in this run | scripted fallback (no `ARG_AI_*` key in the environment); provider-failure path tested with a deliberately unreachable compatible endpoint and returned the labelled fallback |

### AI companion setup and context

The companion is a server route (`/api/quests/[slug]/companion`) with GET history and POST message. With `ARG_AI_BASE_URL`, `ARG_AI_MODEL` and `ARG_AI_API_KEY` it calls an OpenAI-compatible chat endpoint; the defaults target the official Claude API (`https://api.anthropic.com/v1`, model `claude-opus-5-5`) through Anthropic's OpenAI-compatible layer. Without them, or on any provider error, it answers with a deterministic scripted investigator and includes a note that live AI was unavailable. The prompt contains only the filtered quest view — revealed online/in-store clues, stage, verified state, extended solved state, claim status, released product clue and MagicBlock milestone state — plus prior conversation. It never receives the private counter answer, extended answer, final answer or the unreleased clue. Conversation rows are stored in SQLite and capped for loading; no browser message is trusted as chain state. P2 adds the campaign-wide collective block: phase, eligible-handoff count, ER-live and Solana-committed values and staleness are always described, while the shared evidence text (labelled as a prewritten story fragment) is present in the prompt only when this session is authorized. A verified unlock is stored per `(session, campaign)` in `collective_authorizations`, so a later ER outage keeps the session's earlier access, clearly marked as previously verified with its count and timestamp. History rows that contain fragment text are filtered out of the API response and the provider request unless the current policy allows them.

### Claude provider configuration and capture

The defaults point at the official Claude API through Anthropic's OpenAI-compatible
layer: `ARG_AI_BASE_URL=https://api.anthropic.com/v1`,
`ARG_AI_MODEL=claude-opus-5-5`, `ARG_AI_API_KEY` server-side only. A request goes
to `POST /v1/chat/completions` with the key as a bearer token and an
`anthropic-version` header (`2023-06-01` unless `ARG_AI_VERSION` overrides it).
`ARG_AI_WORKSPACE_ID` is only needed when the key is not scoped to one workspace.

Claude 4.7 and later — `claude-opus-5-5` included — return HTTP 400 for any
`temperature` or `top_p` below 1. The client removes both fields before the first
request for those models, so the companion's 0.6 and the Story Lab's 0.8 are kept
only on models that accept them (`claude-opus-4-6`, for example). A 400 that names
`max_tokens` is retried once with `max_completion_tokens`, and any other failure
reaches the labelled scripted fallback.

To capture the exact provider bytes for evidence, put the loopback proxy in front
of the app instead of calling Anthropic directly:

```bash
# terminal 1 — records every request to .data/demo/provider-capture.jsonl
ARG_UPSTREAM_AI_BASE_URL=https://api.anthropic.com/v1 ARG_AI_API_KEY=... \
  CAPTURE_PORT=8891 node scripts/demo/provider-capture.mjs

# model access for this key, without spending a completion
ARG_UPSTREAM_AI_BASE_URL=https://api.anthropic.com/v1 ARG_AI_API_KEY=... \
  node scripts/demo/provider-capture.mjs --models

# terminal 2 — the app talks only to the proxy
ARG_AI_BASE_URL=http://127.0.0.1:8891/v1 ARG_AI_MODEL=claude-opus-5-5 npm run dev
```

`node scripts/demo/provider-capture.mjs --cost 2` prints the organization cost
report and needs `ARG_ANTHROPIC_ADMIN_KEY`. The promotional credit balance, and
which credit a call is drawn from, appear only in Console → Billing: the API
reports spend, not the credit bucket.

Each captured line stores the request messages, parameters, upstream status,
elapsed time, token usage and the header names sent, with the key redacted. The
file is gitignored.

### Live AI run (2026-11-25, `claude-opus-5-5`)

Every AI reply below came through `scripts/demo/provider-capture.mjs` on
`127.0.0.1:8891`, so the request parameters, upstream status, elapsed time and
token usage were recorded from the wire. The key was never printed or written to
the capture file.

| Check | Result |
| --- | --- |
| Model access (`--models`) | HTTP 200, 14 ids, including `claude-opus-5-5` and `claude-opus-4-6` |
| Genuine completion | `mode=live`, HTTP 200, 6 440 ms upstream, 2 152 prompt + 558 completion tokens |
| Hypothesis challenge | live reply names the weakest assumption, separates observed from guessed, ends with a testable question |
| Collective reply (unlocked) | `mode=live`, 6 069 ms, quotes the shared ledger fragment and labels it shop-written story material |
| Story Lab | `mode=live`, 31 745 ms, 3 distinct concepts (The Eleventh Repair / Last Leaf Over Yeonnam / Side C), each with a FICTION-marked premise and an instruction-style product clue |
| Merchant publish walk | `create 201 draft` → `submit pending` → `approve published` → public listing `published` → separate player session `page 200`, `start 200` |
| Player session in the new campaign | `mode=live`, live reply on The Eleventh Repair |
| Parameters on the wire | `{model, max_tokens}` only — no `temperature`, because Claude 4.7+ rejects values below 1; `anthropic-version` forwarded |

**Output limits were not sufficient at first, and the fix is measured.** Claude
Opus 5.5 thinks before answering and those tokens count against `max_tokens`:

| Budget | Observed |
| --- | --- |
| Companion `max_tokens` 240 | `finish_reason=length`, 25 characters of visible text, then 0 characters on the next call |
| Story Lab `max_tokens` 1400 | `finish_reason=length`, no content at all after 16 s |
| Companion `max_tokens` 1200, timeout 30 s | complete reply, 6.4–7.5 s, ~520–560 completion tokens |
| Story Lab `max_tokens` 4000, timeout 90 s | valid JSON, 3 concepts, 32 s, 2 832 completion tokens |

A truncated call is no longer reported as a generic empty reply: both callers now
say the model used the whole output budget before answering, and still fall back
to the labelled scripted/local path.

**Collective locked versus unlocked.** The unlocked side is real: the Ninth Cup's
clue milestone read `ER live 3 · Solana committed 3` from
`https://devnet-as.magicblock.app/` with `authority: live`, and the live reply used
the fragment. In this pass the locked side was captured live too, on an isolated
fixture whose own milestone stood at 1: see *Isolated locked/unlocked fixture* in
the final-pass section below. Nothing was reset or lowered to produce it, and the
Ninth Cup's counters were not touched.

**Spend and credit.** The recorded calls used 8 871 prompt + 4 002 completion
tokens in total (2 152+558, 2 415+517, 336+2 832). The organization cost API
(`/v1/organizations/cost_report`) returned HTTP 401 with this key — it requires an
Admin API key — and the promotional credit balance and which credit a call draws
from are only shown in Console → Billing. Neither was verified here.

**Mobile player check (Chromium, 390 px emulation).** The campaign published in
this run (The Eleventh Repair) opened at a 390 px viewport with no horizontal
overflow. On the play page the online trail advanced 0/3 → 3/3, the in-store
clue button appeared, and the Mara drawer showed `LIVE AI · claude-opus-5-5`.
A hypothesis typed into the drawer returned a live reply that separated observed
from guessed and named the weakest assumption (`artifacts/live-mobile-390.png`).
Evidence upload, operator approval and the Devnet claim were **not** replayed in
the browser this pass; they are covered by the API walk in this run and by the
P2 browser run above.

**Not run for this pass:** physical Android/iOS browsers, the `claude-opus-4-6`
narrative comparison (the client keeps its 0.8 temperature on 4.6, covered by
tests), and any new chain transaction. No on-chain state was written or altered
for this evidence.

### What is real vs simulated

| Component | Real / simulated |
| --- | --- |
| Solana Devnet reward | Real SPL transfer from the demo treasury |
| Campaign completion counter | Real MagicBlock ER create/delegate/increment/commit |
| Clue milestone | Real MagicBlock ER create/delegate/increment/commit on a second PDA |
| Product order / price | **Simulated**; no payment, POS or inventory integration |
| Staff confirmation | Human demo step; no authenticated staff account |
| Physical sleeve insert | **Digital prop preview** of a simulated physical clue |
| AI companion | Live if configured; otherwise labelled scripted fallback |
| Story lab | Draft only; local concepts when no key |
| Coupons | Fictional demo entitlements; legacy campaigns unchanged |

### Product-mode database additions

Additive migrations add `optional_mode`, product fields, final-answer fields and the `product_claims` and `companion_messages` tables. The seed upgrades only the untouched seeded *The Ninth Cup*; existing campaigns, completions, payouts and coupons are preserved. `optional_mode = 'coupon'` is the default, so old campaigns keep their P0.4 behavior.

### Browser testing status (R2)

R2 used the Cloud Chromium browser against the dev server and a clean SQLite database (`/tmp/r2-browser-data/arg.db`). The local Playwright headless shell could not launch because this VM lacks `libnspr4`; the Cloud browser was the working path.

- **The Ninth Cup, 375 px:** start → read 3 sources → 2 in-store clues → answer `5` → labelled simulation → operator approval → verified transition → optional deduction `11` → product reference → staff release → hidden ending `19`.
- **The Midnight Jar, 390 px:** Story Lab concept → one-time form prefill → complete the merchant campaign → operator approval → read 3 sources → 2 in-store clues → answer `6` → operator approval → optional deduction `5` → reference `MIDNIG-CLUE-5P9P` → staff release → hidden ending `5`.
- **R2 final corrections, 375/390 px:** a Story Lab concept with placeholders cannot be saved (ten field-specific errors, nested clue text included); completing the same draft saves and enters operator review; **Use this concept** asks before replacing unsaved form text, and Cancel keeps every field; the final question is absent from the player payload until staff release the product clue, then appears; the visible milestone line reads `MagicBlock ER · Unavailable · clue release is local only` on a deployment without ER configuration and never claims a commit.
- **Layout:** no horizontal overflow on `/`, `/quests`, quest detail, play, `/merchant` or `/staff` at 390/768/1280 px. Companion drawer and long references wrap; technical evidence starts collapsed.
- **Not covered:** physical iOS/Android devices, real camera hardware, native browser chrome, screen readers. The coupon-mode browser path was not replayed in R2; it is covered by `tests/flow.test.ts`.

Screenshots from the run live in the gitignored `artifacts/r2/` directory.

## P2 “Adaptive intelligence” run (2026-11-24)

This run needed the deployed program, the demo treasury and a fresh database. The seeded campaign id is fixed, so its clue milestone already held 1 from the P1 handoff; the observed transition was 1 → 2 (unlock) → 3.

1. Start the app with `ARG_COUNTER_PROGRAM_ID`, `ARG_TREASURY_KEYPAIR` and `ARG_REWARD_MINT` set, and a throwaway `ARG_DATA_DIR`.
2. Run `node scripts/chain/p2-collective.mjs http://127.0.0.1:3000`. It drives two distinct players through start → clues → counter answer → evidence → operator approval → optional deduction → product request, then performs two staff handoffs.
3. The script prints the ER state before, between and after, both handoff signatures, the base-layer committed value, the ER transaction lookup and Mara's reply at each stage. It exits non-zero if any check fails.

### P2 evidence

| Step | Value |
| --- | --- |
| Milestone PDA | `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` |
| Before | phase `first`, ER live 1, committed 1, **locked**, no evidence |
| First handoff increment | `3GJXHo7nT6WSqMdMctPngQkYWVfko5pChP7KD8FGT97SZrhJPhJg4VPTZpitV84LXAcF94pexZV5HfN7HimkcGEL` |
| First handoff commit | `yaeFreKi9sgJBrvi8Fr1GtX8bjEAWGnYEDtTNY1FFLBuYPYKmBYLe5MVUbRQ8A8CUbRcKi42zLRkLe3vBQpmU9w` |
| After first | phase `unlocked`, ER live 2, committed 2 |
| Second handoff increment | `3NWPKNjemSomL4pYgaomg7a5Afe6MAr3Uh9tUUwACAztpMwSbbNF4NdLmZ5aYR3Jkzjqg2U6w6G3fhzA2bJbLSNF` |
| Second handoff commit | `2UoBdbmrRfPEi7NQz94tzje8ieLjZLZ9CHDEwKacDoT9MDPSnkv3EWH3PZsF7EyfKxCtXqRsN18RfDSE39s1bjej` |
| After second | phase `unlocked`, ER live 3, committed 3 |
| Mara before | “1 eligible handoff … a second verified handoff is still needed” (no shared text) |
| Mara after | quotes the shared record, compares it with “The April post”, asks which assumption to test |
| ER transaction lookup | commit visible on `devnet-as.magicblock.app` (slot 1155272647) |

A separate throwaway campaign (`cmp_p2_locked`) produced the 0 → 1 case on a new milestone account `A1MWoo2ksY6yK1UxKpZ1stqXUqHUijzKL5QF5PadY1Xs`: create `515nrHyDy6RhJTE9aLFV29puWUSiqe9q9kiDoKLExj5BJUBhGSYZC1n8ZBKNxom7fuacErzYHsUmuDtBNWD4CrXi`, delegate `38Hu6AAm9vgCaAWPfM7Km18Vmjw32W7V7kJ5JotiC3LqRjktuaaiSxwd6HY3CSePtY6QFwrGUu6wZCZ8pPhNwWvo`, ER increment `5PT8oQFVWT811pgx2iwZrWje4bzzCcT8ZbQnSnvB5wySfTkJ8ntoxKXsy3JJBLwhm4wNstBBan68Srb6ActkqUqE`, commit `66WxZ16asDkZgnXiq7AvvSA25cES1CKLjuoD2naDSdhKbUJjN7udBMkHbvH4jYYX2SvggYrDbD9JDzteGEWtpcS3`, committed value 1. The app reported phase `first`, count 1, **locked**, and Mara again asked for a second handoff.

### Chromium check of both states

- **Locked (count 1):** the play page panel read “1 handoff · still locked”, “1 eligible handoff · 1 more to unlock”, `ER live 1 · Solana committed 1`, and neither the DOM text nor the HTML contained any shared-evidence wording.
- **Unlocked (count 3):** the panel read “Shared evidence unlocked”, `ER live 3 · Solana committed 3`, showed the story event and the shared record. Clicking **Ask Mara to revisit the earlier theories** opened the companion, which sent the question and replied with the shared record, a comparison point and a challenge to the player's assumption.
- The companion was in **scripted guide** mode in both checks (no AI key configured), which is the intended fallback.

### R1 corrective check: provenance, retained access, no fragment without a grant (2026-11-24)

Fresh database, real Devnet base layer and real ER read. The seeded campaign's clue milestone is still at 3.

1. **Live unlock.** A new player started The Ninth Cup. The panel read “Shared evidence unlocked”, `ER live 3 · Solana committed 3 · devnet-as.magicblock.app`, and showed the story event with the new attribution “Prewritten story fragment · unlocked when the campaign's MagicBlock milestone reaches 2.” The database recorded one row in `collective_authorizations`: campaign `cmp_the_ninth_cup`, `verified_count` 3, `verification_source` `er-live`, `collective_unlocked_at` and `last_verified_at` both `2026-11-24T14:34:25Z`.
2. **ER outage, same session.** The server was restarted against the same database with the Magic Router answer replaced by a local stub that still reports the account delegated but points the ER endpoint at a closed local port. The base layer stayed real, so `committed` was still 3. The same browser session showed “Shared evidence · previously verified”, `ER read unavailable · last verified Tue, 24 Nov 2026 14:34:25 GMT · Solana committed 3`, kept the story event, and stated “This session's earlier verification still applies; no new ER read is claimed.” No fresh verification was claimed.
3. **No grant, same outage.** A second player with no grant read `phase unavailable`, `locked true`, `authority none`, `count null`, `committed 3`, no evidence. The page HTML and the companion response contained no fragment. The same was true for a new session on The Ninth Cup started during the outage.
4. **No fragment configured.** The seeded `b-side-07` was published locally for the check. Its API reported `configured false`, and its play page contained neither the shared-investigation panel nor the “eligible handoffs unlock shared evidence” teaser.
5. **Stored history.** A fragment-bearing assistant row was inserted for both sessions. `GET /companion` omitted it for the unauthorized session (`messages 0`) and returned it for the authorized session, so the API and the provider request follow the same gate.

Limitation of this check: clearing the browser context to simulate the second player also removed the preview proxy's owner cookie, so the unauthorized and unconfigured states were verified against the real server through the API and the server-rendered HTML rather than visually in Chromium. The two authorized states (live unlock and retained access) were inspected in Chromium.

## Final demonstration pass (2026-11-25)

Scope: demo preparation only. No product feature was added, no campaign content was
changed, and no merge or deploy was performed.

### Counter reconciliation: why earlier runs showed different PDA addresses

`node scripts/chain/pda-reconcile.mjs` re-derives every counter from the campaign id
stored in the database and reads its committed value. It only reads; it holds no
key and writes nothing.

| Item | Value |
| --- | --- |
| Program | `8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C` |
| Cluster | Solana **Devnet**, base layer `https://api.devnet.solana.com`, ER `https://devnet-as.magicblock.app/` |
| Completion seed | `["counter", sha256(campaignId)]` |
| Clue-milestone seed | `["counter", sha256(campaignId + "#clue")]` |

Current values:

| Campaign id | Counter kind | PDA | Committed |
| --- | --- | --- | --- |
| `cmp_the_ninth_cup` | completions | `tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN` | 5 |
| `cmp_the_ninth_cup#clue` | clue milestone | `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` | 3 |
| `cmp_p2_locked` | completions | `DWg59mdeV5gfMPtfwqvN7Mhok2Q3R5hyehocAnGtpjRA` | 2 |
| `cmp_p2_locked#clue` | clue milestone | `A1MWoo2ksY6yK1UxKpZ1stqXUqHUijzKL5QF5PadY1Xs` | 2 |

Every other campaign id in the database (`cmp_2038baea-…`, `cmp_4ce54286-…`,
`cmp_b095aa8f-…`, `cmp_b_side_07`, `cmp_the_blue_hour`, `cmp_the_eighth_cup`,
`cmp_the_lantern_ledger`) has both PDAs `not created` on Devnet.

The apparent discrepancy in earlier runs is now explained: the two addresses quoted
for *The Ninth Cup* are **two different counters for the same campaign**, not a
moving account. `tKit7TX2…` counts verified completions (5) and `UdYL9iLz…` counts
clue handoffs (3). Both are derived deterministically from the campaign id and the
seed suffix above, so re-running the script returns the same pair.

### Isolated locked/unlocked fixture

The comparison needs a campaign whose clue milestone is below the threshold and
that also has a fragment. The Ninth Cup is at 3 and must not be reset, and
merchant-created campaigns have no fragment by design. The existing real milestone
`cmp_p2_locked#clue` already stood at 1 on Devnet from the earlier throwaway P2 run,
so only its database row was recreated (same campaign id, so the same on-chain
account applies) and published through the normal merchant → operator flow:

| Item | Value |
| --- | --- |
| Campaign id / slug | `cmp_p2_locked` / `p2-locked-fixture` |
| Title | P2 Locked Fixture (labelled demo-only, fictional, never offered to players) |
| Fragment | `src/lib/collective-fixture.ts`, looked up only after production content |
| Script | `node scripts/demo/locked-fixture.mjs [--unlock]` |

One player session, one campaign, one question, two states — the reply is live
`claude-opus-5-5` in both. Question: *“What does the shared investigation record
say, and how should it change my theory that the answer is nine?”*

| Stage | Gate state | Live reply (abridged) |
| --- | --- | --- |
| Locked | `phase first`, ER live 1, committed 1, `authority none`, `locked true`, `evidence null` | “The shared record is still locked. The campaign-wide count shows 1 eligible clue handoff out of 2 needed … I can't paraphrase it, and the count alone shouldn't move your theory either way … the weakest assumption is that every stamp you're counting actually carries the word SAMPLE.” |
| Handoff | increment `3zi9KUW28TWhaV17jLGEmSqvyYU3F14c2fiy7zvt79faBHJ4iLFZaRQrySRqybvZCzvYJ72jphUeZLVbZ2CzkMfo`, commit `HPhhe3Vn6WeuTj1RvBP2J7oqnecr4sHPY1mobdrrkptasbyKeabXtXSPSRzRUKGyNrhWFjMJ4tmaf14b5NnXwDL`, `committedValue 2` | one player journey plus one staff handoff on the fixture only |
| Unlocked | `phase unlocked`, ER live 2, committed 2, `authority live`, `locked false`, fragment present | “Correction: the shared record is now unlocked at 2 eligible handoffs … It's prewritten fixture text, not anything gathered from players … **Observed:** the card is stamped twice … **Guess:** nine.” |

The unlocked reply separates observed from guessed, quotes the fixture fragment and
labels it prewritten, and still refuses the answer. Nothing in the Ninth Cup changed:
its counters read 5 and 3 before and after, and the reconciliation table above was
taken after the run.

### Companion text rendering and loading feedback

- `src/lib/mara-format.ts` parses a deliberately small subset — paragraphs, bullet
  lines, `**bold**`, `*italic*`, `` `code` `` — into tokens, and
  `src/components/mara-text.tsx` renders them as React elements. There is no
  `dangerouslySetInnerHTML`, so raw HTML in a model reply is displayed as inert
  text rather than markup. `tests/mara-format.test.ts` covers five cases, including
  HTML injection and an unclosed emphasis marker.
- Verified in production with a live reply that contained `**Observed:**` and
  `**Guessing:**`: the DOM held 2 `<strong>` elements and zero literal `**`, and an
  earlier plain-prose reply rendered visually unchanged.
- Loading: the drawer shows **“Mara is reading the trail…”** while a reply is in
  flight and **“Loading the conversation…”** before stored history arrives. The
  reply-in-flight line was observed on the production build; the history line was
  verified in the component and the screenshots only, not caught in a fresh session. The Story Lab shows “Drafting concepts…” with the note that a
  measured live run took about 30 seconds, so a slow generation does not look like
  a hang.

### Default Anthropic endpoint and production mode

- `npm run build` completed, then `npm start` served production mode on `*:3000`
  **without** `ARG_AI_BASE_URL` (`ARG_AI_MODEL=claude-opus-5-5`). The adapter's own
  default (`https://api.anthropic.com/v1`) was therefore the endpoint in use.
- A live completion still returned `mode=live model=claude-opus-5-5`, and the capture
  proxy's log stayed at 15 lines — no request passed through the proxy, which proves
  the default base was used rather than the loopback capture endpoint.
- Production pages: `/`, `/quests`, `/merchant`, `/operator`, `/staff` all `200`;
  `/quests/the-ninth-cup/play` `307` until a session exists, then renders the shared
  panel with `ER live 3 · Solana committed 3 · devnet-as.magicblock.app`.
- Screenshots from this pass are in the gitignored `artifacts/` directory:
  `production-play-locked.png` (full play page), `production-companion-loading.png`
  (“Mara is reading the trail…”) and `production-companion-markdown.png` (rendered
  bold labels).

### Limitations confirmed in this pass

- The locked/unlocked comparison runs on a **demo fixture campaign**, deliberately
  separate from production content. It is published so the gate can be exercised,
  and it is marked fictional and never offered as a player trail.
- Model phrasing varies between identical prompts. One earlier locked capture
  described the closed gate as “the milestone couldn't be read” although the read had
  succeeded and only the phase was locked; the API state and the prompt said “locked —
  1 eligible clue handoff, 2 needed” in every run. Later captures used the correct
  wording. The status text is generated by the model, not templated.
- The cost report still returns HTTP 401 for this key (Admin API key required); the
  promotional credit balance is visible only in Console → Billing.
- Browser checks used Cloud Chromium (desktop and 390 px); no physical Android/iOS
  device, real camera or screen reader was used.
- Production mode here is `next start` on this machine, not a Cloudflare/Workers
  deployment.

## Evidence to fill in

- [x] Playable quest, staged clues, timed hints, camera/upload evidence, operator verification, extended mystery
- [x] Real Devnet SPL payout with a confirmed signature and a verified balance change
- [x] MagicBlock execution: delegation, ER increment, commit back to Solana, committed counter value
- [x] Coupon issuance, player coupon ticket, staff single-use redemption, merchant activity report
- [ ] Deployed app URL
- [ ] Screen recording
- [x] Known limitations / demo-only steps
- [x] P2: ER state changes the companion's permitted context (live two-handoff run above)
- [x] Live Claude provider path captured (model, status, elapsed ms, `live`)
- [x] Locked → unlocked comparison on a real non-production milestone, one session, one campaign
- [x] Counter PDA reconciliation documented (program, campaign id, cluster, seeds, committed values)
- [x] Companion Markdown rendered safely; loading state observed live
- [x] Production build verified against the default Anthropic endpoint

**Do not mark done until genuinely observed.**
