# ARG Merchant Quest — final submission package

Prepared 2026-11-27 (KST) for the hackathon deadline of **2026-11-27 23:00 KST**.
Not submitted: the owner submits. Everything below was either re-verified on 2026-11-27 or is
marked as recorded evidence from earlier runs.

## 1 · Identifiers

| Item | Value |
| --- | --- |
| Repository | https://github.com/friendly-neighborhood-coding-man/arg-merchant-quest |
| Release branch | `release/hackathon-p2` |
| Release SHA | `9c460e338cdda9aa02721c31b4ca41ca16a121ab` (`9c460e3`) |
| P3 experimental branch | `feature/p3-native-payment-authorization` @ `7968270` — **not merged** |
| Public demo URL | **None yet — blocker, see §7** |
| Demo video | `submission/ARG-Merchant-Quest-demo.mp4` (2:48, 1280×720, H.264, burned-in English captions; sidecar `captions.srt`) |
| Network | Solana **Devnet** only; valueless demo token |
| MagicBlock program (completion-counter) | `8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C` (upgradeable BPF, executable) |
| Reward mint (tUSDC, demo token — not Circle USDC) | `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1` (6 decimals) |
| Demo treasury (public key only) | `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N` — 0.2320 SOL on 2026-11-27 |

## 2 · Project description (paste-ready)

**ARG Merchant Quest** is a location-based alternate-reality advertising platform for independent
shops. A merchant turns its own story into a short trail: public online records, an in-store
observation, a counter question and one photograph of a merchant-approved object. A person — not a
classifier — reviews the photo. A verified completion pays a **fixed** Devnet test-token reward and
increments a campaign counter on a **MagicBlock Ephemeral Rollup**, which commits back to Solana. An
optional deeper mystery hides a clue inside a signature product that staff release by hand, and a
second on-chain counter of those handoffs gates a shared "collective investigation" record that the
AI companion **Mara** (Claude Opus 5.5) may discuss only once the rollup reports the threshold.
Merchants draft campaigns with an AI **Story Lab**; nothing publishes without operator approval.

Design rules: no first-solver race, no speed bonus, a constant reward, disclosed coupon conditions,
only merchant-approved spaces, and explicit labels on everything simulated (orders, coupons,
staff handoffs, the shared story record).

## 3 · Verified chain evidence (re-read from Devnet and MagicBlock RPC on 2026-11-27)

Raw read-back: `submission/chain-readback-2026-11-27.json`.

| Account | Devnet committed | ER live (`devnet-as`) |
| --- | --- | --- |
| Completion counter (Ninth Cup) `tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN` | 5 | 5 |
| Clue milestone (Ninth Cup) `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` | 3 | 3 |
| Clue milestone (isolated fixture `cmp_p2_locked`) `A1MWoo2ksY6yK1UxKpZ1stqXUqHUijzKL5QF5PadY1Xs` | 2 | 2 |

Both PDAs re-derive from `["counter", sha256(campaignId)]` and `["counter", sha256(campaignId#clue)]`.
All three accounts are owned by the delegation program (`DELeGG…`) and delegated to validator
`MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`.

**Devnet transactions (permanent, open in Solana Explorer):**

| What | Transaction |
| --- | --- |
| Reward payout 1.00 tUSDC → `3PKvZD6Y…QfnY` (2026-11-21) | [H72C1YWT…8cpM](https://explorer.solana.com/tx/H72C1YWT35Ci8cVavdjmKpWYaB2C9sPBp9HNJ5sxTN7negdoCwxWHGBKXXKA77SQ8RWrE67grbMCQhZ39tx8cpM?cluster=devnet) |
| Reward payout 1.00 tUSDC → `CdhwzBqW…RgD` (2026-11-21) | [3KEpDqXC…58fG](https://explorer.solana.com/tx/3KEpDqXCkn3VD5EsyNyZy73PLExDf3YmrEdVr1ccsSTpja8vB17XpZbACuUMT48zFy61SrX4vPXLUACzEBcX58fG?cluster=devnet) |
| Completion counter create / delegate | [24yTF8M1…r3kY](https://explorer.solana.com/tx/24yTF8M11JSyLMw83nsJjeNWb9KWPmDKxMcwDeHWh1gEb5QDCqCkxjcQJYe7Y9nDFGLHeXtbcjtL3jMcMB8fr3kY?cluster=devnet) · [2PLQ7xza…S4V7](https://explorer.solana.com/tx/2PLQ7xzaMmfSoe9rbUj5jxAEeGgHXfRGQQCoHMu7m2aEnp5fpEFz24EQR5yfWYXmsBvFWDCgwPv8cADKQ84LS4V7?cluster=devnet) |
| Completion counter validator write-backs (ER → Devnet) | [2UqTLzG6](https://explorer.solana.com/tx/2UqTLzG6P2od5jxjTdb6HosPwpChLoSw7zZAsQ5FjJQtcdthZFJ9c55xMwseCcBYVh94rhEQjhD71fnMLEHsvSBQ?cluster=devnet) · [5LA4ogRY](https://explorer.solana.com/tx/5LA4ogRYPD8Er91xUEyUAeGw8m4jjFBC44VEX2raHMG8DCZ2DeFySrAXtzTLUyGbRyWKR7eeLpjuQdvC4Aeo8LLo?cluster=devnet) · [4RucdBXF](https://explorer.solana.com/tx/4RucdBXF1nZNdipgNBERK5UgtV1fob7YJjD1bmQyJDjq9viEgCTVmj4anFXnigTTbF79fg8gWsdU6Ha4yWRBvoLL?cluster=devnet) · [54T599ti](https://explorer.solana.com/tx/54T599tir41ad3fifgZRR2fDECVNmoHCC71TR2HecyoRaicoX3jNujKVTnaiFBmXtMpo1Uwirm61FDsUksA5zh8F?cluster=devnet) · [2AWSqziz](https://explorer.solana.com/tx/2AWSqzizZxzPc4CSuqRSq3KA8HBq27zKgcki5U9AekRRYppDbDn916HbpW3cm4nxKLHAtSbYRNdp7rZkorL2PUjK?cluster=devnet) |
| Clue milestone create / delegate | [4pvs4idd…BATj](https://explorer.solana.com/tx/4pvs4iddPt1SD2dCNcc4n8rFwFkBExDseVGpYnjojz6Y17su9qidCjZsurYf53Lx3WXNjYPUZz8UkpzVk5n9BATj?cluster=devnet) · [2G8fpc16…rFxu5](https://explorer.solana.com/tx/2G8fpc16bWCq2AEcxMT84HTebB6GxUFCakBL7nuwtrG8NzajwjewoAv3bjF8TvM1fPKmaw2y7aosKhr6TAyrFxu5?cluster=devnet) |
| Clue milestone write-backs 1 → 2 → 3 | [2qQZCex4](https://explorer.solana.com/tx/2qQZCex4GHcg1okarNvvb2LNAQgAUtjn229uLwi8zcjK1ty2z7t5pu69GTYYRcCqTJb2WY5fD4eUbtGcWRaUroK8?cluster=devnet) (→1) · [2niFTnQH](https://explorer.solana.com/tx/2niFTnQHifwBc222LEmxmYXbtM7YKL1yTm7othK2bbWYHJQK9eGMWeumb7H1uHvJEU2CDXGxDqXkm1164CZhzT4C?cluster=devnet) (→2) · [4g1dWqG1](https://explorer.solana.com/tx/4g1dWqG1AsELda7rceyVoaDMP1DQ4kyymaLR84ZQhqXsZ2K3K4AjBDbxyxt3XvwMnP3tkDLPa4RPRqjGdEF71f2P?cluster=devnet) (→3) |
| Fixture milestone create / delegate / write-backs | [515nrHyD](https://explorer.solana.com/tx/515nrHyDy6RhJTE9aLFV29puWUSiqe9q9kiDoKLExj5BJUBhGSYZC1n8ZBKNxom7fuacErzYHsUmuDtBNWD4CrXi?cluster=devnet) · [38Hu6AAm](https://explorer.solana.com/tx/38Hu6AAm9vgCaAWPfM7Km18Vmjw32W7V7kJ5JotiC3LqRjktuaaiSxwd6HY3CSePtY6QFwrGUu6wZCZ8pPhNwWvo?cluster=devnet) · [4inndXft](https://explorer.solana.com/tx/4inndXftqNikGqNT2FVwufiCbJvgmYxmPpS7ue66a97jouzF6apcVsKVMdnhdnycyppmFNJDPCjgQMc4iYiE2hCC?cluster=devnet) (→1) · [4GoyFGor](https://explorer.solana.com/tx/4GoyFGorabYp5S3kCaVfYYkUH9zGr1xoPD3zZAx5mQTEKJZAbnDPjm1F6fvmhz1RK7SLGznw6JjM6Ba4vuHGxzuo?cluster=devnet) (→2) |

**Ephemeral Rollup transactions.** ER transactions exist only on the rollup and the rollup keeps a
limited history. On 2026-11-27 the fixture's 1 → 2 transition was still retrievable from
`https://devnet.magicblock.app`:

- increment `3zi9KUW28TWhaV17jLGEmSqvyYU3F14c2fiy7zvt79faBHJ4iLFZaRQrySRqybvZCzvYJ72jphUeZLVbZ2CzkMfo` — log *"completion counter is now 2"* (2026-11-25 16:17:47 UTC)
- commit `HPhhe3Vn6WeuTj1RvBP2J7oqnecr4sHPY1mobdrrkptasbyKeabXtXSPSRzRUKGyNrhWFjMJ4tmaf14b5NnXwDL` — *"commit scheduled"*

Older ER signatures listed in `docs/SUBMISSION.md` §6 (`SeZz…`, `3aQt…`, `3GJX…`, `3NWP…`, `yaeF…`,
`2UoB…`) **are no longer returned by any MagicBlock devnet endpoint** (pruned history). They were
independently verified on chain in the P0.3 and P2 reviews; their durable proof is the Devnet
write-backs above. Use the fixture pair for a live ER check, e.g. the app's
`/chain/er/3zi9KUW2…?endpoint=https://devnet.magicblock.app/`.

## 4 · Architecture (summary)

One Next.js 16 process (App Router, server components + route handlers) with SQLite via `node:sqlite`
(WAL) on a persistent volume. Two independent chain legs share one native Rust program: the
completion counter and the clue milestone, each a PDA delegated to a MagicBlock ER, incremented on the
ER and committed to Devnet. The SPL payout is a separate Devnet transfer from one demo treasury.
`src/lib/collective.ts` reads the clue milestone from the ER (2.5 s timeout) and is the only thing
that can unlock the shared record for the companion. `src/proxy.ts` puts the merchant, operator and
staff consoles behind HTTP Basic auth (`ARG_ADMIN_PASSWORD`); `src/lib/limits.ts` adds rate limits
and 24-hour AI and payout caps. Full diagram: `docs/SUBMISSION.md` §4 and `docs/ARCHITECTURE.md`.

## 5 · What was verified on 2026-11-27 (this handover)

| Check | Result |
| --- | --- |
| Release head | `origin/release/hackathon-p2` = `9c460e3` |
| `npm ci` → `npm run typecheck` → `npm test` | pass · **68/68** on Node 22.23.5 |
| `npm run build` | pass |
| Docker image (repository `Dockerfile`) | **builds and runs.** Base image pulled via `mirror.gcr.io` (Docker Hub rate-limited this sandbox), and a verify-only copy of the Dockerfile added this sandbox's TLS-proxy CA for `npm ci`; build steps otherwise identical. Not needed on Railway. |
| Container smoke test (`-v volume:/data`, `APP_ENV=production`, fresh admin secret) | `/quests` 200, `/quests/the-ninth-cup` 200, `/merchant` 401 → 200 with the secret; SQLite + WAL created on `/data`; **4 campaigns still present after `docker restart`** |
| Production admin auth (`next start`) | public 200; admin 401 without, 200 with the secret |
| Concurrent AI cap (real server, slow stand-in provider, cap 3, 12 simultaneous questions) | **3 answered, 9 refused (429)** |
| Live MagicBlock ER read through the app | Ninth Cup shared panel: `ER live 3 · Solana committed 3 · devnet-as.magicblock.app`, unlocked |
| ER transaction verification page | fixture increment `3zi9…` → *FOUND ON ER · CONFIRMED* |
| Mobile gameplay (390 px Chromium) | briefing → start → 3 online clues → 2 in-store clues → counter answer `5` → evidence step; companion drawer works |
| Chain re-read (§3) | all Devnet transactions found, no errors; counters 5 / 3 / 2 |

Not verified by me (executor-reported, documented in `docs/DEMO.md`): live Claude Opus 5.5 calls
(no `ARG_AI_API_KEY` in this environment), duplicate-payout reservation beyond its unit tests (no
treasury key here, and no new payout was made), physical iOS/Android devices.

## 6 · Video contents (all real application footage, release `9c460e3`, recorded 2026-11-27)

| Time | Scene | Source |
| --- | --- | --- |
| 0:00 | Title | card |
| 0:06 | Home and discovery | desktop app footage |
| 0:22 | Merchant studio, Story Lab (local drafter, labelled), "Use this concept" | desktop app footage (admin-authenticated) |
| 0:56 | Player on a 390 px phone: briefing → clues → counter answer | mobile app footage |
| 1:26 | Mara drawer (labelled **scripted guide**, refuses the answer) | mobile app footage |
| 1:41 | Claude Opus 5.5 recorded live-run figures | card, sourced from `docs/DEMO.md` |
| 1:49 | Shared panel with live ER read (3/3), revisit question, ER verification of `3zi9…` | desktop app footage, live RPC |
| 2:19 | Recorded live Claude replies, locked (1) vs unlocked (2) | card, quotes from `docs/DEMO.md` (abridged) |
| 2:29 | Fixed reward transfer and counters | card, values read live from RPC during recording |
| 2:39 | P3 vision — experimental, blocked at deposit settlement | card |

No new AI response, payment or chain transition was generated or simulated for the video. No
credentials appear in the footage (admin access was sent as an HTTP header, never typed on screen).

## 7 · Remaining blockers

1. **No public HTTPS URL.** No Railway (or other) account or project token is available in this
   environment, and nothing may be purchased. The Docker image is verified, so deploying is:
   import the repository in Railway → add a volume at `/data` → set the variables in
   `docs/DEPLOYMENT.md` (fresh `ARG_ADMIN_PASSWORD`, `ARG_AI_API_KEY`, `ARG_COUNTER_PROGRAM_ID`,
   `ARG_REWARD_MINT`) → upload the treasury keypair as a private file and point
   `ARG_TREASURY_KEYPAIR` at it. Owner action required.
2. **Live Claude Opus 5.5 on a public deployment is untested** until the key is set on the host.
3. **Video narration**: captions only (the brief allowed this); no voice track.

## 8 · Honest limitations (for the form)

- One process, one SQLite file; no autoscaling or replicas.
- Shared admin passphrase, no accounts or roles. Failed-auth throttling is per IP (20 per 10 min),
  so many judges behind one venue IP could briefly lock each other out.
- Demo custody: one hot treasury wallet; caps are per process and demo-grade.
- The chain records that the app verified a completion; it does not prove physical presence.
- Products, orders, staff handoffs and coupons are simulations; the shared investigation record is
  prewritten story text unlocked by an on-chain count, not other players' data.
- ER transaction history is pruned by the rollup; Devnet write-backs are the durable record.
- **P3 native eSPL payments are an experimental feature, blocked at deposit settlement
  verification** (a real 0.20 tUSDC ER deposit reached the shuttle eATA but was not credited; both
  recovery instructions fail). Not merged, not deployed, not claimed as working.
- Mobile tested at viewport level only, not on physical devices.
