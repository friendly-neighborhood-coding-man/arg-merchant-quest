# ARG Merchant Quest

> **Status: P0.3 delivered — real Devnet payout and real MagicBlock execution.** A published campaign can be started, walked as a staged online → in-store trail, solved at the counter, evidenced with an in-app camera (or upload), reviewed by a human operator, and completed. On approval the app increments a campaign completion counter **on a MagicBlock Ephemeral Rollup** and commits it back to Solana, and after verification the visitor can claim a **real SPL transfer on Devnet** to their own wallet. An optional extended mystery awards a second achievement and coupon eligibility. Coupon issuance/redemption is still P0.4; coupon copy stays terms-only.

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
npm run chain:state        # prints the current on-chain state
ARG_SOLANA_RPC_URL=https://rpc.magicblock.app/devnet \
  npx --yes tsx@4 scripts/chain/selftest.ts   # delegate → ER increment → commit → real transfer
node scripts/chain/app-e2e.mjs               # the same journey through the app's HTTP API
```

Keys, program keypairs and chain state live under the gitignored `.data/` directory and are never committed.

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
8. Paste a Devnet address in **Reward · Solana Devnet** and claim. The transfer is sent, confirmed and shown with the signature, the amount and the recipient's new balance.
9. Scroll to **the second question**, open its three parts, answer `11` (nine on the stall + the ninth + the eleventh). Coupon eligibility unlocks and the second achievement appears on `/quests#achievements`.

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
- Coupon issuance/redemption is not implemented; completions record coupon *eligibility* only.
- Campaign slugs do not change on title edits; published campaigns remain uneditable.

See [MVP](docs/MVP.md) and [AGENTS.md](AGENTS.md) for the remaining phases.

MagicBlock docs: https://docs.magicblock.gg · Solana docs: https://solana.com/docs
