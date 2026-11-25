# Production deployment configuration

Release commit: `2635354` on `feature/p2-er-adaptive-intelligence`.
Scope: one Next.js server, one persistent SQLite database, **Solana Devnet only**.
This document is configuration, not a deployment: nothing here has been executed.

---

## Topology

| Piece | Requirement |
| --- | --- |
| App | `next build` + `next start` (Node 22 LTS or newer; verified here on 26.13), a single long-lived process |
| Database | SQLite file on a **persistent disk**, not the container filesystem |
| Instances | **Exactly one.** SQLite in WAL mode does not support horizontal scaling |
| Network | Solana Devnet RPC + MagicBlock router/ER, outbound HTTPS |
| Ingress | HTTPS in front of the app; `NEXT_PUBLIC_APP_URL` must be the public origin |
| Secrets | AI key and treasury keypair from the platform's secret store, never from the repo |

## Environment variables

Required for the full demo:

| Variable | Example / value | Notes |
| --- | --- | --- |
| `ARG_DATA_DIR` | `/var/lib/arg-merchant-quest` | **Point at the persistent volume.** Defaults to `<cwd>/.data`, which is lost on redeploy |
| `ARG_DB_PATH` | *(optional)* `/var/lib/arg-merchant-quest/arg.db` | Overrides the file inside `ARG_DATA_DIR` |
| `ARG_AI_API_KEY` | secret | Server-side only. The browser never receives it |
| `ARG_AI_MODEL` | `claude-opus-5-5` | Model used by the companion and Story Lab |
| `ARG_AI_BASE_URL` | **leave unset** | Unset uses the official Claude endpoint (`https://api.anthropic.com/v1`), which is the verified path |
| `ARG_SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Base layer |
| `ARG_MAGIC_ROUTER_URL` | `https://devnet-router.magicblock.app` | ER router |
| `ARG_MAGICBLOCK_ER_RPC_URL` | `https://devnet-us.magicblock.app` | Fallback/example region; the app records the endpoint the router actually chose |
| `ARG_COUNTER_PROGRAM_ID` | `8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C` | Completion-counter program |
| `ARG_REWARD_MINT` | `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1` | Valueless ARG demo test token (6 decimals) |
| `ARG_TREASURY_KEYPAIR` | secret path, e.g. `/run/secrets/treasury.json` | Restore from backup; **never regenerate** and never commit |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` | Shown in the UI |
| `NEXT_PUBLIC_APP_URL` | `https://<public-origin>` | Used for absolute links |
| `APP_ENV` | `production` | |
| `DEMO_ONLY` | `true` | Keep on: coupons and rewards stay demo entitlements |

Optional: `ARG_AI_VERSION`, `ARG_AI_WORKSPACE_ID` (only if the key is not workspace-scoped),
`ARG_PREFER_CIRCLE_USDC`, `REWARD_KRW_EQUIVALENT`, `PORT`.

Do **not** set in production: `ARG_ANTHROPIC_ADMIN_KEY` (only the cost script uses it),
`ARG_UPSTREAM_AI_BASE_URL` (capture proxy only), `NEXT_ALLOWED_DEV_ORIGINS` (dev server only).

### Secrets

- `ARG_AI_API_KEY` and `ARG_TREASURY_KEYPAIR` go into the platform secret store, referenced by
  name. They must not appear in the image, in `.env` files in the repository, in build logs or
  in `/proc`-visible command lines.
- The treasury keypair is a **restored backup** of the existing demo treasury
  (`DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N`). If the file is missing, restore it — do not
  create a new treasury, because the documented payout evidence belongs to this one.
- `.env` and `.data/` are gitignored; verify with `git check-ignore -v .env .data/arg.db`.

## Persistent storage

- Mount the volume at `ARG_DATA_DIR`. The app creates the directory and file on first start
  (`fs.mkdirSync(..., { recursive: true })`), then seeds the four demo campaigns if the database
  is empty (`b-side-07`, `the-blue-hour`, `the-eighth-cup`, and the playable `the-ninth-cup`).
- The live files are `arg.db`, `arg.db-wal` and `arg.db-shm`. Back up the database, not just
  `arg.db`, or stop the process first so the WAL is checkpointed.
- Never bake `.data/` into the image: the repository's own database holds local test state,
  including the isolated `p2-locked-fixture` campaign, which must **not** be shipped.
- Restoring a backup replaces all campaigns, sessions, evidence rows, coupons and the stored
  collective authorizations. There are no user accounts, so nothing is merged per user.

## MagicBlock and Devnet configuration

Existing, already-deployed values — do not redeploy the program for this release:

| Item | Value |
| --- | --- |
| Program | `8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C` |
| Completion seed | `["counter", sha256(campaignId)]` |
| Clue-milestone seed | `["counter", sha256(campaignId + "#clue")]` |
| Ninth Cup completion counter | `tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN` (committed 5) |
| Ninth Cup clue milestone | `UdYL9iLzaK7yz8JwuUgiP4bqJUFM3RRT36uacvnohnt` (committed 3) |
| Treasury | `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N` |
| Cluster | Devnet only; no mainnet endpoint anywhere in the config |

The deployment must not write chain state: no counter resets, delegations or handoffs as part of
going live. `npm run chain:state` and `node scripts/chain/pda-reconcile.mjs` are read-only and are
the only chain commands to run around a deploy.

## Build and start

```bash
npm ci                 # lockfile is committed
npm run build          # production build
npm start              # next start on 0.0.0.0:${PORT:-3000}
```

Set `PORT` (and `HOSTNAME=0.0.0.0` if the platform needs it). Health probe: `GET /quests`
returns `200` once the database is reachable. A second instance pointed at the same SQLite file
is not supported.

## Post-deploy verification (read-only)

1. `GET /`, `/quests`, `/merchant`, `/operator`, `/staff` → `200`.
2. `/quests/the-ninth-cup` → **Start the quest** → **Ask Mara**; the drawer must read
   **Live AI · claude-opus-5-5**, not **Scripted guide**. A scripted reply means the key, the
   model name or egress to the Claude endpoint is wrong.
3. The play page's **Investigation · shared** panel reads `ER live 3 · Solana committed 3` and
   shows the ledger fragment. A locked panel on The Ninth Cup means the ER read failed — check
   `ARG_MAGIC_ROUTER_URL` and `ARG_COUNTER_PROGRAM_ID` before touching anything.
4. `npm run chain:state` and `node scripts/chain/pda-reconcile.mjs` reproduce the counter values
   above.
5. Confirm the treasury holds enough Devnet SOL and test tokens for one payout
   (`npm run chain:state` prints both, read-only).

## Rollback

Redeploy the previous release and restore the database backup taken before the deploy. When no
schema change shipped in this release, restoring the old database is sufficient; chain state is
unaffected by rollbacks and must never be "fixed" by resetting a counter.

## Known deployment limits

- One process, one SQLite file: no autoscaling, no multi-region, no background workers.
- No accounts, roles or authenticated staff; `/staff` and `/operator` are open by design for the
  demo and must not be presented as access-controlled.
- Evidence photos are stored on the local disk under the data directory; they are not encrypted
  or mirrored.
- Coupons are fictional demo entitlements. Nothing in this deployment can redeem real value.
