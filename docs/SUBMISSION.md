# Hackathon submission — ARG Merchant Quest

Status: **READY_FOR_HACKATHON_SUBMISSION**
Release: `release/hackathon-p2`, from the verified P2 commit `a29f195` plus one security-hardening commit.
Network: **Solana Devnet only.** Valueless demo tokens. All shops, staff, coupons and photos are fictional.

---

## 1 · Public demo

The release is built and was exercised in production mode (`next build` + `next start`, `APP_ENV=production`)
on 2026-11-27; see the verification log in §12. A **durable public URL is not live yet**: it needs a host
with a persistent disk, which is an infrastructure decision the project owner must approve and pay for
(see `docs/DEPLOYMENT.md` → *Go live checklist*).

What a deployment needs, in one line each:

| Requirement | Value |
| --- | --- |
| Process | one Node 22+ process, `next start`, no autoscaling |
| Disk | `ARG_DATA_DIR` on a persistent volume (SQLite + evidence photos) |
| Secrets | `ARG_AI_API_KEY`, `ARG_ADMIN_PASSWORD`, treasury keypair file |
| Public config | `APP_ENV=production`, `ARG_AI_MODEL=claude-opus-5-5`, Devnet RPC, MagicBlock router |
| Judge access | merchant/operator/staff consoles use HTTP Basic auth with the `ARG_ADMIN_PASSWORD` value, sent to judges privately — never committed |

---

## 2 · Repository

| Item | Value |
| --- | --- |
| Repository | https://github.com/friendly-neighborhood-coding-man/arg-merchant-quest |
| Submission branch | `release/hackathon-p2` (P2 release + access/limits hardening) |
| Base release commit | `a29f195` — *docs(release): prepare deployment config and judge walkthrough* |
| P3 experimental branch | `feature/p3-native-payment-authorization` at `7968270` — preserved, **not merged** |
| Tests | `npm test` → 65 passing on the submission branch (62 release tests + 3 new limiter tests) |
| Build | `npm run build` → success (Next.js 16.4.6) |

The P3 branch is intentionally outside the release. Nothing from P3 is required by the demo.

---

## 3 · Project description

**ARG Merchant Quest** is a location-based alternate-reality advertising platform for independent shops.
A merchant turns its own history into a short trail: public online records, an in-store observation, a
counter question and one photograph of a merchant-approved object. A person — not a classifier —
reviews the photo. A verified completion pays a **fixed** Devnet test-token reward from a demo treasury
and increments a campaign counter on a **MagicBlock Ephemeral Rollup**, which commits back to Solana.
An optional deeper mystery hides a clue inside a product that staff release by hand, and the campaign's
on-chain clue milestone gates a shared "collective investigation" record that an AI companion can
discuss only once the chain says the threshold was reached.

The product decisions matter as much as the code: no first-solver race, no speed bonus, a constant
reward, disclosed coupon conditions, only merchant-approved spaces, and explicit labels on everything
that is simulated.

**KR:** 매장의 이야기를 온라인·매장 단서, 질문, 사진 인증으로 이어지는 짧은 ARG 체험으로 만들고,
검증된 완료에 고정 보상(Solana Devnet)과 MagicBlock ER 카운터를 기록하는 위치 기반 ARG 광고 플랫폼입니다.
쿠폰·상품·직원 핸드오프는 모두 데모 시뮬레이션이며 실제 결제는 없습니다.

---

## 4 · Architecture

```text
                    ┌──────────────────────────────────────────────┐
  Merchant UI ─────▶│  Next.js 16 App Router (one Node process)    │◀───── Judge / player
  /merchant         │  server components + route handlers          │       /quests/[slug]/play
  /operator         │                                              │
  /staff            │  src/lib/store.ts        campaigns, clues    │
                    │  src/lib/quest-store.ts  sessions, evidence, │
                    │                          completions         │
                    │  src/lib/coupons.ts      entitlements        │
                    │  src/lib/collective.ts   ER gate + grant     │
                    │  src/lib/companion.ts    AI context + calls  │
                    │  src/lib/reward-service.ts  payout + ER step │
                    └───────┬──────────────────────────┬───────────┘
                            │ node:sqlite (WAL)        │ HTTPS
                            ▼                          ▼
                 ARG_DATA_DIR/arg.db          Solana Devnet  ◀── MagicBlock ER
                 + evidence photos            api.devnet      devnet-router →
                                              .solana.com     devnet-{as,us,eu}
                                                            │
                                              programs/completion-counter (native Rust)
                                              PDA ["counter", sha256(campaignId)]
                                              PDA ["counter", sha256(campaignId#clue)]
```

- **One app, one database, one process.** SQLite is opened with `node:sqlite` in WAL mode; there is no
  ORM, no queue and no background worker. This is a deliberate prototype constraint, not a claim about
  production scale.
- **Two independent chain legs.** (a) The completion counter is created once, delegated to an ER
  validator, incremented **on the ER**, then committed to Devnet. (b) The clue milestone uses the same
  deployed program with a derived campaign id, and is the gate for shared evidence.
- **The chain does not verify people or photos.** The operator approves evidence; the counter records
  that this app verified a completion; the SPL transfer records that the treasury paid an address.
- **Reward and coupon are separate.** A coupon or product-clue entitlement is issued for a solved
  optional mystery even if no payout is ever claimed.
- **Access control.** `src/proxy.ts` gates the merchant/operator/staff consoles and every state-changing
  campaign, evidence and coupon API behind one shared passphrase; the public player journey and the
  published campaign listing stay open. `src/lib/limits.ts` adds per-address rate limits and two
  database-derived 24-hour caps (confirmed payouts, stored AI replies).

---

## 5 · Five-minute demonstration

Full scripts: `docs/JUDGE_DEMO.md` (5 minutes) and `docs/FINAL_DEMO.md` (merchant + player rehearsals).

1. **Discover** (`/quests`) → *The Ninth Cup*, a fictional Seongsu-dong roaster.
2. **Start the quest** → read three public records, then the two in-store clues.
3. **Ask Mara** — a live `claude-opus-5-5` reply that separates observation from guesswork and never
   states the answer. The drawer says *Live AI · claude-opus-5-5*; a scripted fallback is labelled.
4. **Answer `5`** at the counter, use the labelled demo capture, and approve it in
   `/operator/evidence` (passphrase required).
5. **Claim the reward** — 1.00 tUSDC on Devnet, with signature and before/after balance.
6. **MagicBlock evidence** — the completion panel's ER increment and commit rows open the real
   transaction on `devnet-as.magicblock.app`; the committed value is readable on Devnet.
7. **Collective gate** — at two eligible clue handoffs the shared investigation record unlocks and
   Mara compares it with the player's theory; at one handoff it stays locked and she says so.
8. **Merchant view** (`/merchant`) — every dashboard number is a count of stored rows, not an estimate.

---

## 6 · Verified evidence

All on **Solana Devnet**. `?cluster=devnet` links are ordinary Explorer; ER transactions only exist on
the rollup, so they are verified through the app's `/chain/er/<signature>` page.

| What | Evidence |
| --- | --- |
| Reward payout (P0.3, 2026-11-21) | `H72C1YWT35Ci8cVavdjmKpWYaB2C9sPBp9HNJ5sxTN7negdoCwxWHGBKXXKA77SQ8RWrE67grbMCQhZ39tx8cpM` → 1.00 tUSDC to `3PKvZD6Y12WB6Bsidae3AS8CegcLJ4tpewm3RBy8QfnY` |
| Reward payout (P0.4 lantern campaign) | `3KEpDqXCkn3VD5EsyNyZy73PLExDf3YmrEdVr1ccsSTpja8vB17XpZbACuUMT48zFy61SrX4vPXLUACzEBcX58fG` → 1.00 tUSDC to `CdhwzBqWcgm6eVkcJeLKnWyvZ4KZDSYUGfRSnVKvyRgD` |
| Completion counter (Ninth Cup) | `tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN` — committed value **5** |
| ER increment / commit (completion) | `SeZzXjEDhj4NMmcQycj5HBxMqRsf46ZNZ2JPhmxYZzid7uV8HEJwTSF1hbu2Ub6CVcVTqgnokcKLqgfPf493TYd` / `3aQtNLznNUGUH9dfmiBbFuDNa3UknDV8kafWcyUbZXPKCDDqiXroBYksUce9NeSULzQVertMskGVhCecgxxDxFmf` on `devnet-as` |
| Clue milestone (Ninth Cup) | `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` — committed value **3** |
| Two eligible handoffs (P2, 1→2→3) | ER increments `3GJXHo7nT6WSqMdMctPngQkYWVfko5pChP7KD8FGT97SZrhJPhJg4VPTZpitV84LXAcF94pexZV5HfN7HimkcGEL`, `3NWPKNjemSomL4pYgaomg7a5Afe6MAr3Uh9tUUwACAztpMwSbbNF4NdLmZ5aYR3Jkzjqg2U6w6G3fhzA2bJbLSNF`; commits `yaeFreKi9sgJBrvi8Fr1GtX8bjEAWGnYEDtTNY1FFLBuYPYKmBYLe5MVUbRQ8A8CUbRcKi42zLRkLe3vBQpmU9w`, `2UoBdbmrRfPEi7NQz94tzje8ieLjZLZ9CHDEwKacDoT9MDPSnkv3EWH3PZsF7EyfKxCtXqRsN18RfDSE39s1bjej` |
| Locked case (isolated campaign) | Milestone `A1MWoo2ksY6yK1UxKpZ1stqXUqHUijzKL5QF5PadY1Xs` at count **1** → shared evidence stays locked, Mara asks for a second handoff |
| Live AI (2026-11-27, this release) | one real `claude-opus-5-5` companion reply, `mode: "live"`, `model: "claude-opus-5-5"`, served by the production build |
| ER live read (2026-11-27, this release) | `GET /api/quests/the-ninth-cup/investigation` → `countSource: "er"`, `erLive: 3`, `committed: 3`, endpoint `https://devnet-as.magicblock.app/` |

Read-only reproduction:

```bash
npm run chain:state                       # treasury, mint, program, every counter and its committed value
node scripts/chain/pda-reconcile.mjs      # re-derives both PDAs per campaign from the seeds
```

### Honesty table

| Looks real | Actually is |
| --- | --- |
| Devnet reward transfer | Real SPL transfer of a **valueless demo token** (tUSDC), not Circle USDC, from one hot wallet |
| MagicBlock counter | Real ER transactions by the deployed demo program; it records that this app verified a completion |
| Photo review | A human operator approving a photo; camera and location are supporting evidence, not proof of presence |
| Product clue, order, staff handoff | Simulated. No POS, no payment, no inventory, no purchase |
| Coupons | Fictional demo entitlements; single-use in SQLite, no cash value |
| Shared investigation record | Prewritten shop fiction, unlocked by an on-chain count of eligible handoffs — not other players' data |

---

## 7 · P3 — experimental native payment (not part of this release)

P3 explores paying for AI inference with the player's own MagicBlock-native eSPL tokens instead of an
API key. It is implemented on `feature/p3-native-payment-authorization` (`7968270`) and is **not merged,
not deployed and not claimed as working**.

Current, factual state:

- The rail (intent → ER transfer → server-side verification → Claude call) is implemented and covered by
  tests on that branch.
- A real 0.20 tUSDC ephemeral-rollup deposit reached the MagicBlock **shuttle eATA**
  (`64QmiopF…`, 200 000 base units) but was not credited to the owner's eATA on the base layer.
- The sanctioned recovery instruction (`merge_shuttle_into_ephemeral_ata`, ix 15) refuses both legal
  account mappings: `InvalidAccountOwner` for the owner eATA destination and `InvalidWritableAccount`
  for the canonical ATA destination. `undelegateAndCloseShuttleEphemeralAta` fails with
  `UnsupportedProgramId` on base and `ReadonlyDataModified` on the rollup.
- Conclusion: **`P3_EXTERNAL_INFRASTRUCTURE_BLOCKER_CONFIRMED`.** No further on-chain write was
  attempted, 0 additional SOL was spent, and a draft support report
  (`docs/P3_MAGICBLOCK_SUPPORT_REPORT.md`) is ready to send to MagicBlock.

P3 is therefore described as *an experimental implementation awaiting successful native eSPL settlement
verification*, never as a completed feature.

---

## 8 · Limitations

- **One process, one SQLite file.** No autoscaling, no multi-region, no background jobs; a second
  instance against the same file is unsupported.
- **No accounts.** The player is an anonymous cookie; the merchant/operator/staff consoles share one
  passphrase (`ARG_ADMIN_PASSWORD`). There are no roles, no per-merchant ownership and no audit log.
  In production without that variable the admin surfaces return 503 rather than opening.
- **Guardrails are demo-grade.** Per-address limits live in process memory (reset on restart); the
  payout and AI caps are counted from stored rows over 24 hours. They stop accidents and casual abuse,
  not a determined attacker.
- **Demo custody.** The treasury is one hot wallet on the server; no budget accounting, fraud
  detection or anti-replay beyond "one completion per session".
- **The chain does not prove presence.** A new browser session can replay a trail; the operator is the
  verification method.
- **Camera and mobile were exercised at viewport level** (375/390/768/1280 px), not on physical
  iOS/Android hardware.
- **P3 native payments are unverified** (see §7).
- **No analytics, no revenue claims.** Dashboard numbers are stored-row counts only.

---

## 9 · Roadmap

1. **Unblock P3.** Settle the shuttle eATA with MagicBlock support, then run the authorised 0.20 tUSDC
   ER payment → verification → real inference sequence and publish the evidence.
2. **Accounts and roles.** Real merchant/operator/staff identities, per-merchant ownership, an audit log
   and short-lived sessions replace the shared passphrase.
3. **Durable data layer.** PostgreSQL (or SQLite on a replicated volume) with migrations, plus object
   storage for evidence photos and a retention policy.
4. **Abuse resistance.** Server-side replay protection per wallet, payout ledger with budgets, and
   moderation for uploaded images.
5. **Merchant operations.** Coupon/POS handoff beyond the simulation, campaign scheduling, multi-location
   campaigns and measurable (consented) attribution.
6. **Operations.** Structured logs, health checks, alerting on treasury balance and AI spend, and a
   staging environment with an automated end-to-end chain test.

---

## 10 · Verification log — 2026-11-27 (this release)

Environment: this Cloud VM, Node 26, `npm ci` from the committed lockfile, production build.

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass (exit 0) |
| `npm test` | **65/65 pass** (62 release tests + 3 new limiter tests) |
| `npm run build` | pass; `ƒ Proxy (Middleware)` compiled |
| `next start` on `0.0.0.0:3000`, `APP_ENV=production` | ready, listening |
| Public pages `/`, `/quests`, `/quests/the-ninth-cup`, `/quests/the-ninth-cup/play` | 200 |
| `/merchant`, `/operator`, `/operator/evidence`, `/staff` without credentials | **401**, with `WWW-Authenticate` |
| Same pages with the passphrase | 200 |
| `POST /api/campaigns` without / with credentials | 401 / reached validation (400) |
| `APP_ENV=production` with **no** `ARG_ADMIN_PASSWORD` | `/merchant` → **503**, `/quests` → 200 |
| Merchant create → submit → operator approve (HTTP, authenticated) | campaign published and visible in the public listing |
| Persistence across a real process restart | campaign still present |
| Live Claude inference | real reply, `mode: "live"`, `model: "claude-opus-5-5"` |
| MagicBlock ER read | `erLive 3`, `committed 3`, `devnet-as.magicblock.app` |
| Chain state (read-only) | treasury `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N`, 0.2320 SOL, mint `61xJEuc…` |
| Mobile 390 px (Cloud Chromium) | quest detail and play page render without horizontal clipping; ER and shared-evidence panels read correctly |

Not performed in this pass, deliberately: a **new on-chain payout** (it spends Devnet tokens and needs
the owner's approval — the prior signatures in §6 stand), a **deployment to a public host** (see §1), and
**physical-device** camera tests.
