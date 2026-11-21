# ARG Merchant Quest

> **Status: P0.4 delivered — the complete journey works end to end.** A merchant creates a campaign, an operator publishes it, a player walks a staged online → in-store trail, submits camera evidence, an operator verifies it, and the player claims a **real SPL transfer on Devnet**. On approval the app increments a campaign completion counter **on a MagicBlock Ephemeral Rollup** and commits it back to Solana. Solving the optional extended mystery issues a **demo secret-menu coupon**, which staff look up and redeem once at `/staff`, and `/merchant` reports the verified completions, payouts and coupon lifecycle. Everything is a fictional Devnet demonstration.

A real-world ARG advertising experience powered by Solana and MagicBlock. Merchants publish clue-driven campaigns; visitors discover approved online/in-store clues, solve a counter question, photograph the target object, and (later) earn a fixed visit reward plus a merchant-specific secret-menu coupon.

**KR:** 매장과 온라인 단서를 연결한 위치 기반 ARG 광고 플랫폼. 실제 방문 탐색과 고정 보상, 선택형 스토리, 비밀 메뉴 쿠폰을 하나의 경험으로 연결합니다.

## Hackathon objective

**First make one complete journey work.** Focus on a playable E2E and demo quality, not a security framework, legal research, or broad infrastructure.

1. Merchant creates a campaign with social/site clues, an in-store object, optional 3/5-minute hints, and coupon terms.
2. Operator reviews and publishes it.
3. Visitor walks the trail, solves the counter question, captures the object **with the app camera**, and submits permissioned evidence.
4. An operator reviews that evidence and records a verified completion.
5. The prototype sends a **real Solana Devnet test-token transaction** for a fixed reward (P0.3). ✅
6. Completing the optional ARG unlocks a personal achievement and conditional secret-menu coupon (P0.4).

## Non-negotiable product decisions

- **No first-discoverer, fastest-solver, or first-come competitive rewards.**
- Base reward amount is fixed; hint usage and ARG skill do not change it.
- Disclose merchant-specific coupon conditions before participation.
- Use only merchant-approved and visitor-accessible physical spaces.
- Camera and location evidence are **not** cryptographic proof of physical presence, and nothing is auto-verified.
- Initial demo uses **Devnet and valueless test assets only**, never live customer funds or real redeemable coupons.
- Be precise about which functions are actually implemented versus mocked/demo-only.

## What is playable in P0.2

- **One coherent sample ARG**, *The Ninth Cup* at the fictional Umbra Coffee Roasters, plus a second playable Mangwon Records trail.
- **Staged progression**: three online sources unlock one at a time, then two in-store clues; the session lives on the server, so a refresh does not reset or skip anything.
- **A counter question** that is checked on the server. The answer never reaches the player's browser, and the target object is no longer shown in the briefing.
- **Timed hints** at 3 and 5 minutes, measured from the session start. Requests are validated server-side; hints never change the fixed reward.
- **Camera evidence**: in-app capture via `getUserMedia`, a file-input fallback, and a clearly labelled demo simulation for machines without a camera. Location is requested separately and is optional.
- **Human verification**: every submission lands in the operator evidence queue as `pending`. Approving it writes a completion row (reward amount, payout status `pending`, coupon eligibility) that P0.3/P0.4 can consume. Rejecting it leaves the session open for a new photo.
- **Optional extended mystery** with a social-style clue, a website clue, an in-store observation and a final answer, unlocking a second achievement and coupon eligibility.
- **Achievements and progress** on `/quests`, plus progress bars on quest cards.

## What P0.3 adds

- **A real Devnet payout.** After the operator approves the evidence, the player pastes a Devnet address and the app pays a fixed reward from a demo treasury wallet: an SPL transfer to the recipient's associated token account, confirmed on chain, with the signature and the recipient's before/after balance stored with the completion and shown in the UI with an Explorer link.
- **A real MagicBlock Ephemeral Rollup step, tied to the quest.** Each campaign has a completion counter — a PDA of the demo `completion-counter` program (`["counter", sha256(campaign_id)]`). The first verified completion creates it, delegates it to an ER validator, increments it **on the ER**, then commits that state back to the base layer. The UI and API both show program, counter address, delegate/increment/commit signatures, the ER endpoint and the committed counter value, which anyone can read from Devnet.
- **A stated conversion rule.** The 100-credit reward rule is unchanged; for the demo it is paid as **1.00 test token (1 credit = 0.01 test token)**, 6 decimals. The app says this explicitly instead of implying 100 credits equal any USDC amount.
- **Honest asset labelling.** Circle's Solana Devnet USDC faucet could not be used from this environment (bot check), so the demo pays a valueless SPL test token created for this prototype, mint `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1`, labelled **tUSDC / “ARG demo test token”**. Nothing in the app calls it Circle USDC; if the treasury ever holds Circle's devnet USDC, `ARG_PREFER_CIRCLE_USDC` makes the app use that mint instead.

### Chain setup (optional, for reproducing the demonstration)

The committed code runs without any of this: if no treasury keypair, mint or program address is present, the app reports the payout and counter as unconfigured instead of pretending. To reproduce the demo chain state on a fresh machine:

```bash
# needs Rust + Solana CLI (cargo build-sbf) and a small amount of Devnet SOL
npm run chain:build        # compiles programs/completion-counter to .data/chain
npm run chain:setup        # treasury wallet, tUSDC mint, program deploy, .data/chain/*.json
npm run chain:state        # read-only: addresses, balances, program, campaign counters
ARG_SOLANA_RPC_URL=https://rpc.magicblock.app/devnet \
  npx --yes tsx@4 scripts/chain/selftest.ts   # delegate → ER increment → commit → real transfer
node scripts/chain/app-e2e.mjs               # the same journey through the app's HTTP API
```

Keys, program keypairs and chain state live under the gitignored `.data/` directory and are never committed. `chain:state` never prints a secret key and never writes anything.

### Treasury backup and restoration

The demo treasury is one hot wallet that pays every reward. It is acceptable for a valueless Devnet demonstration and unacceptable for real funds.

- **Backup.** The keypair is the JSON file at `.data/wallets/treasury.json` (or whatever `ARG_TREASURY_KEYPAIR` points to). Copy it into your own password manager or encrypted secret store, then confirm the public address with `npm run chain:state`. Never paste the secret into a chat, commit it, or put it in a build artifact or screenshot.
- **Restore on a new machine.** Put the backed-up file outside the repository, export `ARG_TREASURY_KEYPAIR=/secure/path/treasury.json`, and also restore the public chain configuration if it is not read from `.data/`: `ARG_COUNTER_PROGRAM_ID=8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C` and `ARG_REWARD_MINT=61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1`. Run `npm run chain:state` — it should print the same treasury address, the program as executable, and the mint with its treasury balance. Do **not** regenerate the treasury, create a new mint or redeploy the program just because local files are missing.
- **If the treasury is genuinely lost**, record `NEEDS_OPERATOR_TREASURY_RESTORE`. Payouts and coupons stay separate: campaign play, evidence review, coupon issuance, staff redemption and the merchant dashboard all keep working without a treasury, while the reward card explains that payouts are unconfigured. A new treasury needs new Devnet SOL and a fresh mint, and would change the published demo addresses.

### Where the ER transactions are verified

The Magic Router may delegate a campaign counter to `devnet-as`, `devnet-us` or `devnet-eu` regardless of the example `ARG_MAGICBLOCK_ER_RPC_URL`, so the app records the endpoint it actually used. Ephemeral Rollup transactions do not exist on the base layer; a normal `explorer.solana.com/...?cluster=devnet` link for them would show nothing. The completion panel links the **ER increment** and **ER commit** to `/chain/er/<signature>?endpoint=…`, which queries that exact ER's `getTransaction` and shows the slot, fee, accounts and instructions. The durable evidence is the committed counter value, read from the base layer and linked on ordinary Solana Explorer.

## What P0.4 adds

- **Demo coupon issuance.** Solving the optional extended mystery issues exactly one coupon for that verified completion. A unique code, merchant/shop identity, secret-menu item, minimum-spend condition, issue time, expiry and status are stored in SQLite. The conditions are copied from the campaign at issue time, so a later campaign edit cannot rewrite an issued coupon. **Payout success is not required** — the reward and the coupon are separate features.
- **Player coupon experience.** The coupon appears immediately below the extended mystery as a phone-sized ticket: code, merchant, item, minimum purchase, validity, expiry, status and how to show it to staff. `/quests#coupons` keeps every coupon after a refresh or a return visit.
- **Staff redemption.** `/staff` looks up a code, shows the same ticket and the campaign's real terms, requires the staff member to explicitly confirm that the fictional purchase condition was met for the demonstration, and records the timestamp and demo staff identity. The single-use state change is one conditional `UPDATE`, so a redeemed, expired or unknown code cannot be redeemed again. No payment is processed.
- **Merchant activity.** `/merchant` adds database-derived counts for verified demo completions, payouts paid/pending/failed, extended ARG solves, coupons issued and coupons redeemed, per campaign and in total, plus a recent-activity feed. The labels stay honest: no revenue, real purchases, foot traffic or conversion-rate claims.
- **P0.3 corrections.** ER increment/commit now link to a real ER RPC verification page instead of a misleading base-layer Explorer transaction; `npm run chain:state` is a working read-only diagnostic; unconfigured payout and counter states are explicit; payout failures always carry useful text; the balance is labelled as the wallet's current balance; the docs cover treasury backup and the Magic Router's ability to select a different ER.

## Repository layout

- `src/app/` — the single web app: merchant, operator, player, staff and demo-source routes plus API routes
- `src/lib/` — SQLite persistence, campaign lifecycle, quest sessions, evidence, validation
- `src/components/` — shared UI (campaign dossier, quest run, evidence review, forms)
- `docs/MVP.md` — prioritized acceptance contract
- `docs/ARCHITECTURE.md` — boundaries and data flow
- `programs/completion-counter/` — the native Solana program used for the MagicBlock counter
- `scripts/chain/` — reproducible chain setup, program deploy, selftest and app E2E
- `docs/DEMO.md` — demo checklist

## Getting started

Requires Node.js 22.5+ (verified on Node 26). Persistence uses the built-in `node:sqlite` module, so there is no native build step.

```bash
npm install
npm run dev          # http://localhost:3000
```

The database is created on first request at `.data/arg.db` and seeded with two fictional merchants and four campaigns: one published and playable (*The Ninth Cup*), one waiting for review, and two drafts. Evidence photos are written to `.data/evidence/` — nothing is committed.

If you already ran P0.1, run `npm run db:reset` once so the seed includes the P0.2 puzzle fields. Existing rows are migrated in place and stay readable; a published campaign without a counter answer is shown as “briefing only” and cannot be started.

No external services, accounts, API keys or credentials are required for P0.2.

### Full player journey (the demo)

1. `/quests` → *The Ninth Cup* → **Start the quest**. A session is created and the clock starts.
2. Read the three online sources (each opens the next). They point at `/demo/umbra-roasters/...` pages hosted by this app because the merchant is fictional.
3. Walk the in-store clues. The page names the shop address and asks you to keep to the public counter area.
4. Answer the counter: *How many pours does the ninth cup's recipe call for?* (four shelves + one for the ninth cup → `5`). Then open the 3- or 5-minute hint to see the timed hints.
5. Enable the camera and capture, or upload, or use the labelled demo simulation. Optionally share location. Submit.
6. `/operator/evidence` → review the photo, compare it with the private target description, **Approve**. The completion is written.
7. Back on `/quests/the-ninth-cup/play`: verified state, stopped clock, fixed reward, achievement, coupon eligibility locked. On approval the app also delegated/incremented/committed the campaign counter on MagicBlock (see the “MagicBlock · campaign completion counter” panel).
8. Paste a Devnet address in **Reward · Solana Devnet** and claim. The transfer is sent, confirmed and shown with the signature, the amount and the recipient's new balance. The ER increment/commit links open the real Ephemeral Rollup transaction check.
9. Scroll to **the second question**, open its three parts, answer `11` (nine on the stall + the ninth + the eleventh). The second achievement appears on `/quests#achievements` and a **demo secret-menu coupon** is issued immediately below the question: code, minimum spend, validity, expiry and status.
10. Open `/staff`, enter the coupon code, read its terms, tick the confirmation that the fictional purchase condition was met, and **Redeem this demo coupon**. A second attempt with the same code is refused as already redeemed.
11. Open `/merchant` → **What your trails produced**. The verified completion, payout, extended solve, issued coupon and redeemed coupon are counted for *The Ninth Cup*, with the redemption in the recent-activity feed.
12. Return to `/quests#coupons`: the same coupon is still there, now marked redeemed. Refreshing or restarting the app does not lose it.

To see the 3/5-minute hints without waiting, start a quest and then shift that session's `started_at` back in the database (for example with a short `node:sqlite` script) — the server recomputes availability from that timestamp.

### How evidence verification actually works

- The browser captures a JPEG (camera canvas, file upload, or a simulated capture that is drawn with the text “SIMULATED CAPTURE — no camera was used”).
- The server stores it under `.data/evidence/` with kind, capture time, optional coordinates/accuracy and an explicit `pending` status. There is no image-recognition call and no automatic approval.
- The operator evidence queue shows the photo next to the merchant's private target description and the expected answer. Approving creates the completion; rejecting records a note and lets the player resubmit.
- Approving a `simulation` row is marked as `operator_review_simulation` in the completion, and the player's completion card says plainly that it is not proof of presence.
- Approval also writes the completion, records coupon eligibility and kicks off the chain step: create/delegate the campaign counter if needed, increment it on the ER, commit it back to Devnet, and store the signatures on the completion.
- The payout is a separate, player-triggered step. The player pastes a Devnet address; the server sends the fixed amount, confirms the transaction and stores `paid` (or `failed` with the RPC error) on the completion. Nothing is paid before the operator's approval.

### Demo path for the P0.1 pipeline (still working)

1. `/merchant` — demo studio for *Umbra Coffee Roasters*. Open the seeded draft “B-Side 07”, or create a campaign.
2. Submit it for review (now requires the counter question and answer), then open `/operator` and approve or reject with a note.
3. If it was rejected, choose *Edit & resubmit*: the form is prefilled and the operator's note stays visible.
4. `/quests` — approved campaigns appear in discovery, playable end to end.

## Known limitations

- No authentication: the player identity is an anonymous browser cookie, and the merchant/operator consoles act as seeded demo roles. Anyone with the URL can review evidence.
- One session per campaign per browser; clearing cookies starts over.
- No image recognition, no duplicate-completion or deep anti-fraud logic; the operator is the verification method.
- Camera and location behaviour was verified in a desktop browser and in a headless/cloud browser without camera hardware. **Not tested on physical iOS/Android devices.**
- **Demo custody, not production custody.** The treasury keypair sits in `.data/wallets/treasury.json` on the server and pays every reward from one hot wallet. That is fine for a Devnet demo and unacceptable for real funds; there is no budget accounting, treasury management, fraud detection or anti-replay framework in this build.
- **The chain does not verify the player or the photo.** The operator remains the verification method; the MagicBlock counter records that *this app* verified a completion, and the SPL transfer records that the treasury paid an address. Neither proves physical presence or prevents the same visitor from claiming twice with a new browser session.
- **The reward asset is a valueless demo token (tUSDC), not Circle USDC**, because the Circle Devnet faucet could not be used here. It is labelled as such everywhere.
- The completion counter is a single-campaign PDA with no access control beyond the program owner and no upgrade authority rotation; it is a demonstration of the ER lifecycle, not a production counter.
- **Coupons are fictional demo entitlements.** They have no cash value, are not real offers and cannot be redeemed at a real business. There is no POS integration and no real payment verification: staff tap a box to confirm the demo condition.
- Staff identity is a typed demo name, not an authenticated account, and anyone with the URL can open `/staff`. The coupon redemption is single-use at the database level, but this build has no accounts, roles or audit signing.
- Coupon conditions are copied from the campaign at issue time; changing a campaign afterwards does not alter coupons already issued. Expiry is evaluated against the server clock when a coupon is read or redeemed.
- The reward and the coupon are independent: a coupon is issued for a solved extended mystery even if the player never claims a payout or the payout fails.
- Campaign slugs do not change on title edits; published campaigns remain uneditable.

See [MVP](docs/MVP.md) and [AGENTS.md](AGENTS.md) for the remaining phases.

MagicBlock docs: https://docs.magicblock.gg · Solana docs: https://solana.com/docs
