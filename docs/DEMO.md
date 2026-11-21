# Live demo runbook

Status: P1 “Living ARG” walked end to end at the API/HTTP level — merchant campaign, operator publication, staged player trail, camera evidence, human verification, real Devnet payout, MagicBlock ER completion counter, extended deduction, product-clue request, staff handoff, real MagicBlock clue milestone, hidden ending, AI companion fallback, legacy coupon regression. Browser rendering and the live LLM path were **not** verified in the P1 session (see limitations).

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

The companion is a server route (`/api/quests/[slug]/companion`) with GET history and POST message. With `ARG_AI_BASE_URL`, `ARG_AI_MODEL` and `ARG_AI_API_KEY` it calls an OpenAI-compatible chat endpoint; without them, or on any provider error, it answers with a deterministic scripted investigator and includes a note that live AI was unavailable. The prompt contains only the filtered quest view — revealed online/in-store clues, stage, verified state, extended solved state, claim status, released product clue and MagicBlock milestone state — plus prior conversation. It never receives the private counter answer, extended answer, final answer or the unreleased clue. Conversation rows are stored in SQLite and capped for loading; no browser message is trusted as chain state.

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

### Browser testing status

No browser was available for the P1 session. The earlier P0.4 screenshots remain in `artifacts/`; there are **no P1 screenshots**. The 375/390 px layout was reviewed in code (single column, sticky optional jump, full-width companion drawer, wrapping reference/ticket fields) but not rendered or tapped. Treat mobile visual quality as unverified pending a Chromium pass.

## Evidence to fill in

- [x] Playable quest, staged clues, timed hints, camera/upload evidence, operator verification, extended mystery
- [x] Real Devnet SPL payout with a confirmed signature and a verified balance change
- [x] MagicBlock execution: delegation, ER increment, commit back to Solana, committed counter value
- [x] Coupon issuance, player coupon ticket, staff single-use redemption, merchant activity report
- [ ] Deployed app URL
- [ ] Screen recording
- [x] Known limitations / demo-only steps

**Do not mark done until genuinely observed.**
