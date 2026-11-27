# Production deployment configuration

Release: `release/hackathon-p2` (verified P2 `a29f195` plus the access/limits hardening commit).
Scope: one Next.js server, one persistent SQLite database, **Solana Devnet only**.

The release has been built and exercised in production mode locally on 2026-11-27 (see
`docs/SUBMISSION.md` §10). It has **not** been deployed to a public URL: that needs a persistent disk
and a hosted account, which the owner must approve. Railway is the prepared path (§ Railway below);
follow the go-live checklist at the end.

---

## Railway: the fastest prepared path to a public URL

Railway is the recommended host for the judging window, ahead of a hand-built VPS: it terminates
TLS, provides a public `*.up.railway.app` name, and its volume rules match this app's constraints.

| Requirement | Railway behaviour | Fit |
| --- | --- | --- |
| One persistent SQLite file | Volume mounted at `/data`; files persist across redeploys and restarts | yes |
| Exactly one instance | A service with a volume **cannot** run replicas | enforced by the platform |
| HTTPS | TLS terminated at the edge with a managed certificate | yes |
| Credentials server-side | Service variables injected at runtime, never in the image | yes |
| Storage size | 0.5 GB volume on Free/Trial, 5 GB on Hobby | the demo database is a few MB |

Cost and entitlement: a new Railway account includes a **30-day trial with a one-time $5 credit and
no card**, which covers the judging period. After that the Free plan gives $1/month but **sleeps an
idle service**, and Hobby is $5/month with $5 of usage included. Nothing here has been provisioned
or purchased: the deploy needs the owner's own Railway account (or a project token).

Already in the repository:

- `Dockerfile` pins Node 24 (the app uses `node:sqlite`, which needs 22.5+), installs from the
  lockfile, builds, then runs one `next start` on `0.0.0.0:${PORT}` with `ARG_DATA_DIR=/data`.
- `railway.json` forces the Dockerfile builder, runs `npm start`, healthchecks `/quests` (which
  reads the database), and never enables replicas.
- `.dockerignore` keeps `.data/`, `.env*`, `node_modules`, `.next` and repository extras out of the
  image.

### Railway setup, in order

1. Create a project from `friendly-neighborhood-coding-man/arg-merchant-quest` on branch
   `release/hackathon-p2`. The first deploy starts on an empty `/data` and seeds the four demo
   campaigns.
2. **Add a volume mounted at `/data`.** This *is* the database; without it SQLite is lost on every
   redeploy. Do not add replicas: Railway refuses them on a service with a volume, which is the
   single-instance guarantee this app needs.
3. Set the service variables:

   ```
   APP_ENV=production
   ARG_DATA_DIR=/data
   ARG_ADMIN_PASSWORD=<fresh secret, generated on the deployment host; see step 6>
   ARG_AI_API_KEY=<the existing Claude key>
   ARG_AI_MODEL=claude-opus-5-5
   ARG_SOLANA_RPC_URL=https://api.devnet.solana.com
   ARG_MAGIC_ROUTER_URL=https://devnet-router.magicblock.app
   ARG_COUNTER_PROGRAM_ID=8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C
   ARG_REWARD_MINT=61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1
   ARG_DAILY_PAYOUT_CAP=25
   ARG_AI_DAILY_REPLY_CAP=300
   NEXT_PUBLIC_SOLANA_CLUSTER=devnet
   DEMO_ONLY=true
   ```

   Leave `ARG_AI_BASE_URL` unset (official Claude endpoint). Do not point `ARG_TREASURY_KEYPAIR` at
   anything outside the volume.
4. Settings → Networking → **Generate Domain**, then set `NEXT_PUBLIC_APP_URL=https://<domain>` and
   redeploy so absolute links use the public origin.
5. Restore the treasury onto the volume, not into the image: write the backed-up keypair to
   `/data/wallets/treasury.json` (the default path under `ARG_DATA_DIR`, `chmod 600`) using
   `railway ssh`. Without it the demo still runs — rewards stay unconfigured and the reward card
   says so — but the payout evidence needs this file. Never commit it, never put it in a variable.
6. Replace the passphrase that was used in local testing. Generate a new one on the machine you
   control (`openssl rand -hex 24`), keep it out of the repository, set it as
   `ARG_ADMIN_PASSWORD`, and send it to judges privately through the submission form.
7. Run the post-deploy verification below. Then confirm `/merchant` is **401** without the
   passphrase and **200** with it, over the public `https://` origin.

Redeploys on a service with a volume stop the old container before the new one starts, so expect a
few seconds of downtime per deploy. The SQLite files on the volume are untouched.

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
| `APP_ENV` | `production` | **Required.** With it set, a missing `ARG_ADMIN_PASSWORD` closes the admin surfaces instead of opening them |
| `DEMO_ONLY` | `true` | Keep on: coupons and rewards stay demo entitlements |
| `ARG_ADMIN_PASSWORD` | secret, 16+ chars | **Required for a public URL.** Gates the merchant/operator/staff consoles and every mutation |
| `ARG_DAILY_PAYOUT_CAP` | `25` | 24-hour cap on confirmed Devnet payouts, counted from stored rows |
| `ARG_AI_DAILY_REPLY_CAP` | `300` | 24-hour cap on stored companion replies (live or scripted) |

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

## Access control and spending limits

The prototype has no user accounts. One shared passphrase protects everything that can change
state or spend money:

| Surface | Guard |
| --- | --- |
| `/merchant`, `/merchant/**`, `/operator`, `/operator/**`, `/staff` | HTTP Basic auth (`ARG_ADMIN_PASSWORD`) |
| `POST /api/campaigns`, `/api/campaigns/**` (except the public `GET` listing) | same |
| `/api/evidence/**`, `/api/coupons/**`, `/api/product-claims/handoff`, `/api/merchant/**` | same |
| Every other `/api/**` | 300 requests/minute per address, then 429 |
| `POST` reward claim | 10 claims/hour per address **and** 25 confirmed payouts per rolling 24 h |
| Companion replies | 30 questions/hour per address **and** 300 stored replies per rolling 24 h |
| Evidence uploads | 20 uploads/hour per address |
| Story Lab drafts | 10 drafts/hour per address |

Implementation: `src/proxy.ts` (Basic auth and the coarse API limit) and `src/lib/limits.ts` (the
route limits and the two database-derived caps). The counts come from `quest_completions` and
`companion_messages`, so a restart does not reset the spending caps; the per-address windows live
in process memory and do reset on restart.

A stored count on its own does not hold under a burst, because each request reads the count and
then awaits a model call or a Devnet transfer. `reserveSpendingSlot` claims the unit synchronously
before that await, and `reservePayoutForCompletion` stops two simultaneous claims for the same
completion from both signing a transfer. Verified on 2026-11-27: twelve simultaneous companion
questions against a deliberately slow provider with a cap of three answer exactly three and refuse
the other nine with 429. Both reservations are per process, which is the other reason the
deployment is exactly one instance.

Browser Basic auth caches the passphrase for the session. Send it to judges separately (the
submission form's access field), never in the public repository or a screenshot. `curl -u` works
for scripted checks.

These are demo guardrails, not a security boundary: there is one shared passphrase, no roles, no
audit log and no per-merchant ownership. Do not present them as production access control.

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

## Go-live checklist

1. Provision **one** server with a persistent volume (1 vCPU / 2 GB is enough) and install Node 22+.
   Nothing else in this document is optional: SQLite cannot live on an ephemeral container filesystem.
2. Mount the volume and set `ARG_DATA_DIR` to it. Start from an **empty** data directory so the seeded
   demo campaigns are created fresh — do not copy `.data/` from a development machine (it contains
   local fixtures such as `p2-locked-fixture` that must not ship).
3. Set the secrets in the platform's secret store: `ARG_ADMIN_PASSWORD` (16+ characters, random),
   `ARG_AI_API_KEY`, and the **restored** treasury keypair file referenced by `ARG_TREASURY_KEYPAIR`.
   Do not regenerate the treasury; the published payout evidence belongs to `DUonyYGV…`.
4. Set the public configuration: `APP_ENV=production`, `NEXT_PUBLIC_APP_URL=https://<origin>`,
   `ARG_AI_MODEL=claude-opus-5-5`, `ARG_SOLANA_RPC_URL`, `ARG_MAGIC_ROUTER_URL`,
   `ARG_COUNTER_PROGRAM_ID=8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C`,
   `ARG_REWARD_MINT=61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1`, `ARG_DAILY_PAYOUT_CAP`,
   `ARG_AI_DAILY_REPLY_CAP`.
5. `npm ci && npm run build`, then run `npm start` under a process manager bound to `0.0.0.0`.
6. Put HTTPS in front. Confirm `/merchant` returns **401** without the passphrase, and **200** with it.
   A 200 without credentials means `ARG_ADMIN_PASSWORD` is not set — stop and fix it.
7. Run the post-deploy verification below. The Mara drawer must read **Live AI · claude-opus-5-5**.
8. Send the passphrase to judges privately (submission form access field), never in the repository.

## Rollback

Redeploy the previous release and restore the database backup taken before the deploy. When no
schema change shipped in this release, restoring the old database is sufficient; chain state is
unaffected by rollbacks and must never be "fixed" by resetting a counter.

## Known deployment limits

- One process, one SQLite file: no autoscaling, no multi-region, no background workers.
- One shared admin passphrase, no accounts or roles: anyone with the passphrase can use every
  merchant and operator action. It must be set for a public URL (`ARG_ADMIN_PASSWORD`); a
  production process without it refuses those routes with 503 rather than serving them open.
- The rate limits and spending caps are single-process and deliberately simple. They protect the
  demo from accidental loops and casual abuse, not from a determined attacker.
- Evidence photos are stored on the local disk under the data directory; they are not encrypted
  or mirrored.
- Coupons are fictional demo entitlements. Nothing in this deployment can redeem real value.
