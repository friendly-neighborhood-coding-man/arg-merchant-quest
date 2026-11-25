# Judge walkthrough (5 minutes)

The short path through the demo. Full rehearsed runs: `docs/FINAL_DEMO.md`. Evidence and
limitations: `docs/DEMO.md`. Everything is **Solana Devnet, valueless test tokens**, and all
shops, staff, coupons and photo evidence are fictional.

## 1 · The pitch, in one screen (30 s)

Open `/quests` → **The Ninth Cup**. It is a real playable trail at a fictional shop: three public
sources, two in-store clues, a counter question, a photo reviewed by a person, a fixed Devnet
reward, and an optional deeper mystery hidden in a product.

Say: *a shop can publish a story that sends people to the counter, and the chain records the
completion — not a leaderboard, not a race, one fixed reward.*

## 2 · The shop side (60 s)

`/merchant` → **What your trails produced**, then **+ New campaign**.

Point at three things:

1. The reward is constant. Hints, speed, the AI conversation and the optional product never
   change it, and there is no first-solver bonus.
2. **Submit** moves the campaign to *In review*; nothing publishes itself, and an AI draft is
   still only text until a human approves it in `/operator`.
3. The dashboard numbers are all derived from stored rows — verified completions, payouts
   paid/pending/failed, coupons issued and redeemed.

## 3 · The player side (2 min)

`/quests/the-ninth-cup` → **Start the quest**.

- Read the three public sources, then the in-store clues.
- Open **Ask Mara** and ask something a player would ask. The drawer reads
  **Live AI · claude-opus-5-5**; the answer challenges the theory, separates what was observed
  from what was guessed, and never states the answer.
- Answer `5` (four shelves plus the one for the ninth cup), use the **labelled demo simulation**
  for evidence, and approve it in `/operator/evidence`.
- Back on the quest: verified banner, stopped clock, and the **Reward · Solana Devnet** panel.
  Claiming pays 1.00 tUSDC and shows the signature and the balance change.

Say: *the photo is supporting evidence reviewed by a person, not cryptographic proof of presence.
The reward is the same for every verified completion.*

## 4 · The chain evidence (60 s)

On the verified completion, open the **ER increment** and **ER commit** rows: both are real
MagicBlock Ephemeral Rollup transactions on `devnet-as.magicblock.app`, committed back to Devnet.
`node scripts/chain/pda-reconcile.mjs` (read-only) prints the program, the campaign id, the two
derived PDAs and their committed values.

Say: *the completion counter and the clue milestone are two different accounts for the same
campaign — `tKit7TX2…` counts completions (5) and `UdYL9iLz…` counts clue handoffs (3).*

## 5 · The adaptive part (45 s)

The **Investigation · shared** panel on the play page is gated by the campaign-wide MagicBlock
clue milestone: below the threshold it shows the count and no text; at 2+ it unlocks a prewritten
shop fragment, labelled as story material, and the companion compares it with the player's theory.

This was proven on an isolated fixture, not by editing the demo campaign: the same question, in
the same session, answered live by `claude-opus-5-5` before and after one real handoff
(`3zi9KUW…` increment, `HPhhe3V…` commit) — locked at 1, unlocked at 2. The demo campaign's
counters were never touched.

## What to be honest about

- One process, one SQLite file, no accounts, no autoscaling: this is a working prototype.
- The product clue, the order and the staff handoff are **simulated**; no payment or POS exists.
- The shared fragment is shop-written fiction unlocked by an on-chain count; the count is eligible
  handoffs, not unique people.
- No mainnet, no real money, no claim that coupons are redeemable.

## Evidence to hand over

| Item | Where |
| --- | --- |
| Live AI replies (locked and unlocked, same session) | `docs/DEMO.md` → *Isolated locked/unlocked fixture* |
| Counter reconciliation (program, seeds, PDAs, values) | `docs/DEMO.md` → *Counter reconciliation* |
| Full player and merchant runs | `docs/FINAL_DEMO.md` |
| Production configuration | `docs/DEPLOYMENT.md` |
| Automated checks | `npm test` → 62 passing; `npm run typecheck`; `npm run build` |
