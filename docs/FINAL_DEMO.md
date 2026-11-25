# Final demo walkthroughs

Two rehearsed runs for the hackathon demonstration: **A · merchant** (create, publish,
read the dashboard) and **B · player** (solve, verify, earn, redeem). Each is a
complete story on its own, and together they form one continuous loop. Concise
runbook and known limitations: `docs/DEMO.md`.

Everything below runs on **Solana Devnet with valueless test tokens**. Shops, staff,
coupons and evidence are fictional demo material. No payment is taken.

---

## Pre-flight (5 minutes before either run)

```bash
npm run db:reset          # optional: only for the exact scripted flow
npm run build && npm start  # production mode, http://0.0.0.0:3000
npm run chain:state       # read-only: treasury, mint, program, counters, committed values
```

- Server: one Next.js process. Production mode is recommended for the live run;
  `npm run dev` is fine for rehearsal.
- AI: `ARG_AI_API_KEY` server-side only, `ARG_AI_MODEL=claude-opus-5-5`. Leave
  `ARG_AI_BASE_URL` unset to use the official Claude endpoint. The Mara drawer shows
  **Live AI · claude-opus-5-5** when a real reply is in use and **Scripted guide**
  when the deterministic fallback answers (each affected message is also labelled
  “scripted fallback”). Say which one is on screen; never call a scripted reply live AI.
- Chain: Program `8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C`, treasury
  `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N`, mint `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1`.
- Keep the read-only reconciliation handy if anyone asks about addresses:
  `node scripts/chain/pda-reconcile.mjs` (program, campaign id, cluster and seeds are
  printed in `docs/DEMO.md`).
- The isolated `p2-locked-fixture` campaign exists only for the locked/unlocked proof.
  It is **not** part of either walkthrough; do not open it in front of the audience.

---

## A · Merchant walkthrough (~6 minutes)

Goal: show a shop owner turning a story into a playable trail, and then reading what
it produced. No chain writes happen in this run.

### A1. Open the studio

1. `/` → **Studio** (`/merchant`). Point at **What your trails produced**: verified
   completions, payouts paid/pending/failed, coupons issued and redeemed, per campaign.
   *Say:* every number here is derived from a player action that actually happened —
   nothing is modelled or estimated.

### A2. Create a campaign

2. **+ New campaign**. Fill the fields in this order so the form reads as one story:
   shop name and area → story → target object → counter question and answer (keep the
   answer out of the visible copy) → one online and one in-store clue → fixed reward →
   optional ending.
3. Leave the reward at the constant. *Say:* the reward is fixed for every verified
   completion. Hints, speed, AI chat and the optional product never change it. There is
   no first-solver bonus.
4. Choose the optional ending. **Demo coupon** issues a fictional entitlement;
   **Product clue** hides a clue in a specific product that staff release by hand.
   *Say:* this is simulated — no POS, no payment, no inventory.
5. **Save draft**.

### A3. Use the Story Lab (optional, ~40 seconds)

6. Open **Studio → Story Lab**, enter a theme, and **Draft**. While it runs the panel
   reads “Drafting concepts…” and notes that a measured live run took about 30 seconds.
7. When three concepts appear, pick one → **Use this concept**. It replaces the form
   text only after confirmation, and it never invents answers on its own: placeholders
   must be filled before saving. *Say:* the draft is text; the shop still owns every
   fact and answer.

### A4. Submit and approve

8. Open the draft → **Submit**. Status becomes *In review* and the campaign is locked
   for edits.
9. `/operator` → review the campaign → **Approve**. It appears on `/quests`.
   *Say:* a human publishes; nothing auto-publishes from an AI draft.

### A5. Close the loop

10. Back on `/merchant`, refresh **Latest from your trails** after the player run to
    show the verified completion, the coupon issue and the staff redemption with
    timestamps.

**Merchant run — what to point at, in one line each:** the fixed reward, the explicit
“in review” gate, the simulation labels on the product/coupon, and the dashboard
counts that are all traceable to real rows.

---

## B · Player walkthrough (~8 minutes)

Goal: one continuous journey from discovery to a redeemed demo coupon, with real
Devnet and MagicBlock evidence at the end.

### B1. Start

1. `/quests` → **The Ninth Cup** → read the briefing → **Start the quest**.
   The clock starts. *Say:* refreshing does not restart the trail or the hint clock.

### B2. Read the public trail (3 sources)

2. **Read source 1 of 3 · The April post**, then source 2 and 3. Each opens the next.
   The in-store half unlocks only after all three are read.
3. Open **Ask Mara** and ask something the player would actually wonder, for example
   *“What is suspicious about the last clue?”* or *“Compare what I've observed with
   what I'm guessing.”* While it works the drawer reads “Mara is reading the trail…”,
   and replies render bold, italics and bullets as formatting, never as raw asterisks.
   *Say:* Mara is a live Claude model that only sees what this session has unlocked; it
   challenges the theory and never states the answer.

### B3. Walk the shop

4. Read the two in-store clues. Keep to the public counter area. *Say:* only
   merchant-approved spaces, and camera/location are requested only at the evidence
   step.

### B4. Answer the counter

5. Answer `5` (four shelves plus the one for the ninth cup).
   A wrong answer returns a hint and records the attempt; it is not a lockout.

### B5. Evidence and verification

6. Enable the camera and capture, upload a photo, or use the **labelled demo
   simulation**. Share location or decline it — declining never blocks submission.
   *Say:* a photo and coordinates are supporting evidence, not cryptographic proof, and
   a person reviews it.
7. `/operator/evidence` → compare with the private target description → **Approve**.
   The completion is written, the campaign counter increments **on the MagicBlock
   Ephemeral Rollup** and commits to Devnet.
   *Say:* that commit is the campaign's real on-chain record; open the ER rows to read
   the transaction from `devnet-as.magicblock.app`.
8. Back on the quest: verified banner, stopped clock, fixed reward.

### B6. Claim the reward

9. **Reward · Solana Devnet** → paste a Devnet address → **Send 1.00 tUSDC**.
   The panel shows the signature, the recipient token account and the before/after
   balance. *Say:* valueless test tokens, same amount for everyone.

### B7. The optional deeper story

10. Follow the optional deduction (`11`), then request the product clue. A demo
    reference appears; on `/staff` confirm the fictional handoff. The clue is released
    once, and the campaign-wide clue milestone increments on the ER and commits.
11. On the play page, the **Investigation · shared** panel now reads *Shared evidence
    unlocked* with `ER live N · Solana committed N`, the story event, and its
    attribution as a prewritten story fragment. *Say:* the fragment is shop-written
    fiction, unlocked by the campaign's MagicBlock milestone; the number counts eligible
    handoffs, not unique people, and the panel says so.
12. Solve the hidden ending (`19`).
13. For a **coupon-mode** campaign (e.g. one created in run A), a demo coupon is issued
    instead: unique code, item, minimum spend, validity, status.
14. `/staff` → enter the code → review the ticket → tick the confirmation → **Redeem**.
    A second redemption of the same code is refused. *Say:* single use, fictional, not
    redeemable at a real business.

**Player run — what to point at, in one line each:** the staged trail, the honest
evidence wording, the ER increment/commit pair, the fixed Devnet payout, and the
shared-investigation gate that only opens after a real on-chain increment.

---

## Timing and fallbacks

| Situation | Do this |
| --- | --- |
| Live AI is slow | Say “the model is writing”; both panels show a labelled busy state. A 30 s Story Lab run is normal. |
| AI key missing or provider error | The drawer switches to **Scripted guide** and labels the message “scripted fallback”. Continue the run and say it is the deterministic fallback. |
| ER unreachable at the shared panel | The panel shows `ER read unavailable` and, for a session that already unlocked, keeps its earlier access labelled *previously verified*. Do not claim a fresh verification. |
| ER unreachable during evidence approval | The completion still verifies locally; the chain row reports the failure honestly instead of showing a signature. |
| Someone asks about counter addresses | Run `node scripts/chain/pda-reconcile.mjs`; the completion and clue counters are two different PDAs for the same campaign. |
| Time is short | Run **B1 → B5** plus the claim in B6. The optional story in B7 is the only skippable part. |

## Never in the demo

- Real money, mainnet keys, or a claim that the coupon is redeemable.
- A scripted reply presented as live AI.
- Editing, lowering or resetting a counter to show a “locked” state.
- The `p2-locked-fixture` campaign, which exists only for the isolated comparison in
  `docs/DEMO.md`.
