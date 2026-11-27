# ARG Merchant Quest

> **Status: P2 — MagicBlock adaptive intelligence.** The complete P0/P1 journey still works: a merchant creates a campaign, an operator publishes it, a player walks a staged online → in-store trail, submits camera evidence, an operator verifies it, and the player claims a **real SPL transfer on Devnet**. On approval the app increments a campaign completion counter **on a MagicBlock Ephemeral Rollup** and commits it back to Solana. The optional mystery can end in a **product-contained final clue** (simulated staff handoff), with an **AI investigation companion** (live provider or a labelled scripted fallback), a **separate MagicBlock clue milestone**, a mobile-first adventure UI, and a **merchant story-drafting lab**. R2 tightened the player hierarchy, mobile rendering, generic campaign wording, Story Lab handoff, staff workflows and portable tests. P2 makes the campaign's real MagicBlock clue milestone a **collective investigation gate**: once two eligible handoffs are recorded on the ER, a shared evidence fragment becomes available to the AI companion and to the player, and it is absent everywhere until then. Legacy coupon campaigns and all existing records are preserved. Everything is a fictional Devnet demonstration.

A real-world ARG advertising experience powered by Solana and MagicBlock. Merchants publish clue-driven campaigns; visitors discover approved online/in-store clues, solve a counter question, photograph the target object, and (later) earn a fixed visit reward plus a merchant-specific secret-menu coupon.

**KR:** 매장과 온라인 단서를 연결한 위치 기반 ARG 광고 플랫폼. 실제 방문 탐색과 고정 보상, 선택형 스토리, 비밀 메뉴 쿠폰을 하나의 경험으로 연결합니다.

> **Hackathon submission:** [docs/SUBMISSION.md](docs/SUBMISSION.md) — release branch, demo script,
> verified Devnet/MagicBlock evidence, honest limitations, roadmap and the P3 status. Production
> configuration: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Five-minute judge path:
> [docs/JUDGE_DEMO.md](docs/JUDGE_DEMO.md).

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

## What P1 adds

### A. Product clue and hidden ending

The optional mystery is now a physical-product puzzle for campaigns that opt in (`optional_mode = 'product_clue'`). *The Ninth Cup* is seeded this way: after the free quest is verified, the extended deduction asks how many cups the letter counts in total — answer `11` (nine cups on the 1998 stall plus the two that never went home). The extended answer unlocks a product request, not a coupon.

- The player chooses **The ninth cup pour-over flight** at the counter. The app creates a one-time reference such as `NINTH-CLUE-8BP5` and states plainly that ordering is simulated and never charges anything.
- At `/staff`, the staff member looks up that reference, sees the designated product and the extended deduction, and confirms the fictional handoff. The clue is released only after that single conditional update.
- The clue is a **printed sleeve insert** represented by a digital prop preview, labelled as a simulation of a physical clue. It is never serialized to the player before handoff; the companion context filters it out too.
- The final answer is checked on the server. Wrong answers return non-revealing feedback and increment an attempt counter. The correct answer reveals the hidden ending, “The Nineteenth Pour”, and the persistent achievement “Keeper of the Nineteenth Pour”. No extra cash or token reward is paid.
- Campaigns with the default `coupon` mode keep the P0.4 coupon flow; the seeded legacy *Lantern Ledger* campaign and its issued/redeemed coupon are unchanged.

### B. AI investigation companion

The quest page includes a compact, mobile-friendly companion panel. It answers open questions, summarizes revealed evidence, compares observations, suggests next inspections and refuses to reveal locked clues or final answers. The server builds its context from a **filtered `QuestView`**: revealed clues, stage, timestamps, unlock state and MagicBlock milestone state. Answers, the locked product clue and the final answer are not included.

Configure a live provider (all optional). The default is the official Claude API
through Anthropic's OpenAI-compatible layer:

```bash
ARG_AI_BASE_URL=https://api.anthropic.com/v1   # default
ARG_AI_MODEL=claude-opus-5-5
ARG_AI_API_KEY=...            # server-side only; never commit
```

Any other OpenAI-compatible server works by setting `ARG_AI_BASE_URL`. Claude 4.7
and later reject `temperature`/`top_p` below 1, so the client omits them for those
models instead of spending a request on a 400; older models keep the tuned value
(companion 0.6, Story Lab 0.8). `ARG_AI_VERSION` and `ARG_AI_WORKSPACE_ID` are
optional and used only for Anthropic.

Without a key, or when the provider fails, the app answers with a deterministic scripted investigator (“Mara”) and labels the response as a scripted fallback; it never presents the fallback as live inference. Conversation history is stored per quest session in SQLite (last 40 messages loaded), and the existing 3/5-minute explicit hint gates are unchanged. The companion is not a hint bypass: it can discuss revealed material at any time and says when a stronger hint is still time-locked.

### C. MagicBlock clue milestone

The accepted completion counter is untouched. A second, isolated milestone counter uses the same deployed program with campaign id `${campaignId}#clue`, so a product handoff creates `["counter", sha256(campaignId#clue)]` without upgrading or replacing the P0.3 program. On the single successful staff handoff the app creates/delegates the milestone PDA, increments it **on the ER**, commits it and stores the real signatures on the claim. The companion reads this state and changes its guidance: before the handoff it points at the shop evidence; after it, it references the recorded ER milestone and the sleeve instruction. If the ER is unavailable, the handoff still succeeds locally and the claim records the chain error instead of faking success.

### D. UX and mobile polish

The player page opens with a hook and objective, separates online records from the in-store visit, reveals each clue with a deliberate action, and shows a campaign-aware verified transition. **Claim reward** and the optional-product invitation sit before technical evidence; the optional trail is an inline invitation rather than a sticky jump bar. Headings are generic campaign copy where the seeded story used to leak into shared UI, and duplicate article text ("the The Ninth Cup…") is removed. Product-unlock and hidden-ending moments get dedicated cards. Transaction and ER evidence stay in a secondary, collapsible technical section. Merchant/staff timestamps render in **Asia/Seoul** while storage stays UTC. Coupon summaries read real issued/redeemed/expired state.

### E. Merchant story lab

`/merchant` includes a draft-only story lab. The merchant supplies business facts, product, season, props and atmosphere; the app returns three ARG concepts with premise, online clues, in-store observation, product clue, basic puzzle and hidden ending. Output is explicitly split into merchant-provided facts, labelled fictional material and unverified assumptions, and nothing is published automatically. **Use this concept** maps one concept into the existing campaign form (no new schema); fields the lab cannot honestly supply — address, answers, final answer, demo price — are marked `INCOMPLETE —` for review. The form shows a one-time prefill banner, and the concept is merged once so a refresh cannot overwrite later edits. **Placeholders cannot be saved:** server-side validation rejects any `INCOMPLETE` value, nested clue text included, in both coupon and product-clue modes, with one error per field, and a stored draft holding one cannot be sent to the operator queue. **Use this concept** asks before replacing text the merchant has typed but not saved; cancelling keeps every field as it was. It uses the same AI adapter, with deterministic local concepts when no key is configured; product phrases are normalised so inputs like “the honey jar” do not produce “the the” copy.

### P1 R2 browser evidence from this run

A full build was exercised in the Cloud browser against a clean SQLite database (`/tmp/r2-browser-data/arg.db`) at **375, 390, 768 and 1280 px**. Chromium was the installed Playwright headless shell; the machine lacked `libnspr4`, so the Cloud browser was used instead.

| Check | Result |
| --- | --- |
| *The Ninth Cup* full journey at 375 px | 3 online sources → 2 in-store clues → answer `5` → labelled simulation → operator approval → verified transition → optional deduction `11` → product reference → staff release → hidden ending `19` |
| Merchant-made campaign at 390 px | Story Lab concept → form prefill → complete *The Midnight Jar* → operator approval → 3 online + 2 in-store clues → answer `6` → operator approval → optional deduction `5` → product reference `MIDNIG-CLUE-5P9P` → staff release → hidden ending `5` |
| Horizontal overflow | none on `/`, `/quests`, quest detail, play, `/merchant`, `/staff` at 390/768/1280 px |
| Mobile companion | opens as a bottom drawer, wraps long evidence text, closes back to the trail |
| Technical evidence | payout/MagicBlock records stay collapsed by default |
| Legacy coupon path | covered by `tests/flow.test.ts` (issuance after extended solve, single redemption); not replayed in the browser |

Screenshots are written to `artifacts/r2/` during the run; that directory is gitignored. The R2 browser database had no treasury, counter program or AI key, so its payout, MagicBlock and live-companion states correctly showed **not configured / unavailable / scripted**. The prior P1 real-chain evidence below is unchanged.

### P1 evidence from this run

| Item | Value |
| --- | --- |
| Free quest reward payout | `4Cf5gGwPsnvjFJyyeNeTWqnMizKV9dX5oMzUKXP9um9VEtoDmghg1CASCgxSBRynNTw9CSt7m7FSNbEE7LVt7fwU` — 1.00 tUSDC to `6zn8exb9h6Qjwz7ZVS2yDkds5b7ba2LZnxRKo7hZ4zsS`, claimed **before** any product request |
| Clue milestone counter | `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` |
| Milestone create / delegate | `4pvs4iddPt1SD2dCNcc4n8rFwFkBExDseVGpYnjojz6Y17su9qidCjZsurYf53Lx3WXNjYPUZz8UkpzVk5n9BATj` / `2G8fpc16bWCq2AEcxMT84HTebB6GxUFCakBL7nuwtrG8NzajwjewoAv3bjF8TvM1fPKmaw2y7aosKhr6TAyrFxu5` |
| Milestone ER increment | `43YZJb8PjL1ZxoyQka2MYRmwB1wWj1hvNYBYrFwk8b3ppmRsCxoegxnsnZnqXLtV3kHHuxrDxAEBhHSqAtgrG8Tf` |
| Milestone commit | `5QcNv2iYiuQsw6UYPfjaj2qBs7suU4dsR72JwfJoEJeqJ1y4oL2f8Kwyah11jJRfU3RpiePcJC7vQVijBDvwL3dd` (committed value 1, endpoint `https://devnet-as.magicblock.app/`) |

## What P2 adds

### ER-driven collective investigation

The existing campaign clue milestone `milestoneSeedCampaignId(campaignId, "clue")` is now also the **collective investigation gate**. It is the same deployed program and PDA scheme; no new program, account or transaction type was added.

- count 0 → no collective discovery
- count 1 → the first verified clue handoff is recorded; shared evidence stays locked
- count 2+ → the collective investigation evidence unlocks

The count records eligible handoffs, not unique real-world people. A handoff is still only possible through the app's staff confirmation, and the player never supplies a count.

The milestone is read **on the server** for every play, companion and investigation request through `readGameplayMilestone`, the same MagicBlock ER integration that records it. The **live ER value is the gate**: a missing, malformed, unreachable or timed-out read is `unavailable` and cannot unlock anything. If the committed base-layer value is higher than the live ER value the read is stale, the committed value wins, and the UI shows both numbers. No settlement is claimed before the commit is read back on Solana.

### A deterministic context gate for Mara

`src/lib/collective.ts` produces one state object (phase, count, ER-live value, committed value, endpoint, staleness, error). The prewritten Ninth Cup fragment is copied into the player view, provider messages, JSON APIs and rendered HTML **only** when this session's gate is unlocked; locked states carry status but no fragment. `companionContextSnapshot` and `buildProviderMessages` make the difference testable without a live model.

After unlock Mara compares the shared record with the player's observations, challenges the assumption behind their theory and asks a specific next question. The scripted guide does the same without a key, and **Ask Mara to revisit the earlier theories** opens the companion with that question. Before unlock she says a second handoff is needed and never guesses at the content.

### Player-facing shared investigation

A compact panel under the quest header separates personal progress from the campaign-wide milestone, shows `ER live` and `Solana committed` values with the endpoint, labels the count as handoffs (not people), and explains why the evidence is locked. On unlock it shows a small story event with the shared record and the revisit button. When the chain is unavailable the panel says so and normal play plus scripted guidance keep working. `GET /api/quests/[slug]/investigation` exposes the same read-only state, and the companion responses include it. Campaigns without a configured fragment (everything except The Ninth Cup) render no panel at all, rather than a “2 handoffs unlock” teaser for a record that does not exist.

### Accurate provenance and session-scoped unlocks

The fragment is **prewritten story material**, labelled everywhere as “Prewritten story fragment · unlocked when the campaign's MagicBlock milestone reaches 2.” It is an in-world ledger page written by the shop: it never claims observations from real players, names no answer, and does not describe the product clue as non-arithmetic.

A verified unlock is remembered per `(session, campaign)` in `collective_authorizations` (`collective_unlocked_at`, `verified_count`, `verification_source`, `last_verified_at`). The row is written only after a trustworthy read of that campaign's own milestone, so a new session at count 1, a client-supplied count, another session's row or a local product claim cannot unlock anything.

| Situation | Result |
| --- | --- |
| New session, live ER count 2+ | unlocked `live`; grant recorded |
| Session with a grant, ER unreachable | unlocked `previously_verified`; earlier count and timestamp shown, current ER read labelled unavailable |
| Session without a grant, ER unreachable | `unavailable`, evidence locked |
| Grant for campaign A, request for campaign B | campaign B stays locked |

The same policy governs the companion transcript. Stored messages containing a fragment (including the pre-patch wording) stay in SQLite but are excluded from `GET /companion` and from the outbound provider request unless this session is currently authorized. An old assistant message is never treated as authorization.

### P2 live evidence (2026-11-24, Devnet)

Two separate eligible handoffs were executed through the app's own HTTP API for the seeded Ninth Cup campaign. Its campaign id is fixed by the seed, so the milestone account already held 1 from the P1 run: the recorded transition is 1 → 2 (which unlocks) → 3.

| Step | Value |
| --- | --- |
| Milestone PDA | `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` |
| ER endpoint | `https://devnet-as.magicblock.app/` |
| Before any handoff | phase `first`, ER live 1, Solana committed 1, **locked** |
| First handoff ER increment | `3GJXHo7nT6WSqMdMctPngQkYWVfko5pChP7KD8FGT97SZrhJPhJg4VPTZpitV84LXAcF94pexZV5HfN7HimkcGEL` |
| First handoff commit | `yaeFreKi9sgJBrvi8Fr1GtX8bjEAWGnYEDtTNY1FFLBuYPYKmBYLe5MVUbRQ8A8CUbRcKi42zLRkLe3vBQpmU9w` |
| After first | phase `unlocked`, ER live 2, Solana committed 2 |
| Second handoff ER increment | `3NWPKNjemSomL4pYgaomg7a5Afe6MAr3Uh9tUUwACAztpMwSbbNF4NdLmZ5aYR3Jkzjqg2U6w6G3fhzA2bJbLSNF` |
| Second handoff commit | `2UoBdbmrRfPEi7NQz94tzje8ieLjZLZ9CHDEwKacDoT9MDPSnkv3EWH3PZsF7EyfKxCtXqRsN18RfDSE39s1bjej` |
| After second | phase `unlocked`, ER live 3, Solana committed 3 |
| Mara before | “1 eligible handoff … A second verified handoff is still needed” — no shared text |
| Mara after | quotes the shared record, compares it with “The April post”, asks which assumption to test |

A separate throwaway campaign id (`cmp_p2_locked`) produced the 0 → 1 case on its own new milestone account `A1MWoo2ksY6yK1UxKpZ1stqXUqHUijzKL5QF5PadY1Xs`: create `515nrHyDy6RhJTE9aLFV29puWUSiqe9q9kiDoKLExj5BJUBhGSYZC1n8ZBKNxom7fuacErzYHsUmuDtBNWD4CrXi`, delegate `38Hu6AAm9vgCaAWPfM7Km18Vmjw32W7V7kJ5JotiC3LqRjktuaaiSxwd6HY3CSePtY6QFwrGUu6wZCZ8pPhNwWvo`, ER increment `5PT8oQFVWT811pgx2iwZrWje4bzzCcT8ZbQnSnvB5wySfTkJ8ntoxKXsy3JJBLwhm4wNstBBan68Srb6ActkqUqE`, commit `66WxZ16asDkZgnXiq7AvvSA25cES1CKLjuoD2naDSdhKbUJjN7udBMkHbvH4jYYX2SvggYrDbD9JDzteGEWtpcS3`, committed value 1. The server read phase `first`, count 1, **locked**, and Mara still asked for a second handoff.

`node scripts/chain/p2-collective.mjs [baseUrl]` repeats the two-handoff run against a server that has the deployed program and treasury configured. The Chromium check opened the play page in both states: at count 1 the panel read “1 handoff · still locked” with `ER live 1 · Solana committed 1` and the page contained no shared evidence; at count 3 it showed the story event and the revisit button, and clicking the button opened Mara with the shared record in her reply.

## Repository layout

- `src/app/` — the single web app: merchant, operator, player, staff and demo-source routes plus API routes
- `src/lib/` — SQLite persistence, campaign lifecycle, quest sessions, evidence, validation
- `src/components/` — shared UI (campaign dossier, quest run, evidence review, forms)
- `docs/MVP.md` — prioritized acceptance contract
- `docs/ARCHITECTURE.md` — boundaries and data flow
- `programs/completion-counter/` — the native Solana program used for the MagicBlock counter
- `scripts/chain/` — reproducible chain setup, program deploy, selftest and app E2E
- `docs/DEMO.md` — demo checklist, chain evidence and known limitations
- `docs/FINAL_DEMO.md` — rehearsed merchant and player demonstration walkthroughs
- `docs/JUDGE_DEMO.md` — five-minute judge walkthrough
- `docs/DEPLOYMENT.md` — production configuration (persistent SQLite, server-side AI key, Devnet/MagicBlock settings)

## Getting started

Requires Node.js 22.5+ (verified on Node 26). Persistence uses the built-in `node:sqlite` module, so there is no native build step.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # portable: compiles tests with tsc, then node --test
npm run typecheck
npm run build
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
9. Scroll to **the second question**, open its three parts, answer `11` (nine on the stall + the ninth + the eleventh). The second achievement appears on `/quests#achievements`. Since P1, *The Ninth Cup* is a product-clue campaign, so this unlocks the product request (see **What P1 adds**) instead of a coupon. Steps 10–12 describe a **coupon-mode** campaign (create one in `/merchant` with *Optional ending → Demo coupon*): there a **demo secret-menu coupon** is issued immediately below the question, with code, minimum spend, validity, expiry and status.
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

- **One shared admin passphrase, no accounts.** The player identity is an anonymous browser cookie. On a public deployment `ARG_ADMIN_PASSWORD` gates `/merchant`, `/operator`, `/staff` and every state-changing API behind HTTP Basic auth; local development runs without it. There are no roles, no per-merchant ownership and no audit log, so it is demo access control, not a production identity system.
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
- **The product clue is a simulation.** There is no real purchase, POS, payment, inventory or delivery integration. `/staff` confirms a fictional handoff by hand, and the “physical” clue is a digital prop preview. The demo must not be presented as a real product offer.
- **Live AI was exercised on 2026-11-25 against the official Claude API** (`claude-opus-5-5`, OpenAI-compatible layer): model listing, a genuine companion completion, the live Story Lab (three concepts), a merchant→player publish walk and the unlocked collective reply, all recorded through the loopback capture proxy. Claude 4.7+ rejects `temperature` below 1, so it is omitted for those models, and `max_tokens` had to rise to 1200 (companion) / 4000 (Story Lab) because Opus 5.5's thinking counts against that budget. A final pass on 2026-11-25 added an isolated fixture campaign on the real `cmp_p2_locked` milestone, so the same question was answered live in both the locked (count 1) and unlocked (count 2, after one real handoff) states in one session without touching the demo campaign. Companion Markdown now renders as safe formatting instead of raw asterisks, and the app was re-verified in production mode against the default Anthropic endpoint with no proxy configured. Not covered: the `claude-opus-4-6` narrative comparison, physical devices, and the organization cost report (HTTP 401 without an Admin API key). See `docs/DEMO.md` and `docs/FINAL_DEMO.md`.
- The companion is a narrative aid, not an oracle or a moderation system. It can still be prompted adversarially, and its output is not fact-checked; it is given no private answers or locked clue text.
- **Browser checks are viewport-level, not device-level.** R2 was exercised in the Cloud Chromium browser at 375/390/768/1280 px, including the full Ninth Cup and Midnight Jar journeys. Physical iOS/Android devices, real cameras, screen readers and native browser chrome were not tested; the in-app camera fallback and labelled simulation were the only capture paths used.
- The clue milestone uses the existing deployed program and a derived campaign id. It is a second counter account, not a general-purpose on-chain game state; conversation, location and answers are never written on chain.
- **The collective count is not a user count.** It counts eligible handoffs on one campaign's milestone; the same visitor could appear twice with a new browser session, and different players can be counted on different campaigns. It is not proof of demand, reach or unique participation.
- **Shared evidence is prewritten story material, not generated from other players' behaviour.** The fragment is a fixed Ninth Cup text attached when the threshold is crossed. Campaigns without a fragment still show the milestone but receive no invented evidence.
- The collective gate requires a readable live ER. If MagicBlock is unreachable the shared evidence stays locked even when an older committed value is visible; the panel reports both values so the distinction is visible rather than hidden.
- Each play/companion/investigation request performs read-only RPC calls (with a 2.5 s timeout). There is no cache, indexer or background job, so a slow RPC shortens that request's patience; it never changes game state.

See [MVP](docs/MVP.md) and [AGENTS.md](AGENTS.md) for the remaining phases.

MagicBlock docs: https://docs.magicblock.gg · Solana docs: https://solana.com/docs
