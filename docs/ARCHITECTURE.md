# Architecture sketch

```text
MERCHANT UI --create campaign--> CAMPAIGN STORAGE <--approve-- OPERATOR UI
                                   |
VISITOR UI --online/in-store clues + hints + camera/location evidence
                                   |
                           EVIDENCE CHECK (offchain)
                                   |
                      BASIC COMPLETE / ARG COMPLETE
                         |                    |
                 DEVNET TEST REWARD     ACHIEVEMENT +
                   + MAGICBLOCK         DEMO COUPON
                    INTEGRATION               |
                         |                STAFF REDEEM
                         +----------+---------+
                                    |
                            MERCHANT DASHBOARD
```

## Proposed boundaries

- **Offchain:** merchant content, clue answer checking, photo/location and permissions, campaign approvals, UI and redemption workflow.
- **MagicBlock:** choose one meaningful supported operation and integrate it for real, validating which network and feature it supports.
- **Solana:** real Devnet test-token transaction, receipt signature, explorer verification.
- **One app first:** avoid services and microVM orchestration before working E2E.

## P0.2 quest engine (as built)

```text
BROWSER (anonymous cookie) --> /api/quests/[slug]/{start,progress,answer,evidence,extended}
                                   |
                            quest-store.ts
                                   |
   campaigns.answer / hint_1 / hint_2 / ext_*  (never serialized to players)
   quest_sessions   (start time, clues read, hints used, answer + extended state)
   evidence         (photo file under .data/evidence, kind, time, optional location, status)
   quest_completions(verified reward + coupon_eligibility + payout_status for P0.3/P0.4)
                                   |
OPERATOR UI --> /api/evidence/[id]/review (approve / reject with note)
```

- Hint availability is derived from `quest_sessions.started_at` on every request, so a refresh cannot reset the clock.
- The answer is compared in `quest-store.ts`; only the question text is sent to the client.
- Every submission starts as `pending`. Approval writes the completion row inside one transaction; rejection leaves the session open for a new photo.
- Verification is a human operator in this build. There is no image recognition, and the simulation capture is labelled on the image and in the queue.

## P0.3 chain layer (as built)

```text
OPERATOR APPROVE --> reviewEvidence() --> verifyCompletionOnChain(campaign, completion)
                                              |
                    programs/completion-counter  (native Rust, no Anchor)
                    counter PDA = ["counter", sha256(campaign_id)]
                      |  create (once)  -> base layer
                      |  delegate        -> base layer, CPI to the delegation program
                      |  increment       -> sent to the ER endpoint the router returns
                      |  commit          -> ER instruction 4, MagicIntentBundleBuilder CPI
                      v
explorer-visible program / counter / delegate / increment / commit signatures

PLAYER CLAIM --> POST /api/quests/[slug]/reward { wallet }
                    |
            reward-service.ts -> reward.ts
                    |  create recipient ATA if missing (idempotent)
                    |  SPL transfer from the treasury, fixed 1.000000 tUSDC
                    v
completions.payout_status = paid | failed, signature, before/after balances
```

- The counter belongs to the demo program; the ER state is committed back to Devnet, so the committed value is readable with a plain `getAccountInfo`.
- The ER step runs after the operator's approval, not on the player's say-so; it records that this app verified a completion, nothing more.
- The payout is separate and player-triggered: pasting an address is enough, the treasury pays the fee and creates the token account. This is demo custody, not a production wallet flow.
- Chain failures never fake success: the completion stores `payout_status = 'failed'` with the RPC error and the UI shows it.

## P0.4 coupons (as built)

```text
EXTENDED ANSWER ACCEPTED --> advanceExtended()
                                 |  quest_completions.extended_solved = 1
                                 |  issueCouponForCompletion(session_id)
                                 v
                            coupons (UNIQUE completion_id)
                                 code, merchant/shop, item, min spend,
                                 validity, issued_at, expires_at, status
                                 |
PLAYER  /quests/[slug]/play  <---+--> /quests#coupons
        coupon ticket with code, terms, status
                                 |
STAFF   /staff -> /api/coupons/lookup?code=...   (read only)
              -> /api/coupons/redeem             (single conditional UPDATE)
                                 |
MERCHANT /merchant  <- merchantActivity(merchant_id)  (SQL aggregates + recent events)
```

- Issue-time snapshot: coupon terms are copied from the campaign, so editing the campaign cannot rewrite an issued entitlement.
- `UNIQUE(completion_id)` makes one coupon per verified extended completion; `UPDATE ... WHERE status = 'issued' AND expires_at > now` makes redemption single-use without an anti-fraud framework.
- Expiry is derived from `expires_at` and the server clock, so no background job is needed.
- Coupon issuance never depends on `payout_status`; the reward and the coupon are separate features.
- Staff identity is a typed demo name. There is no authentication, POS integration or payment verification in this prototype.

## P1 product clue, companion and milestone (as built)

```text
FREE QUEST VERIFIED --> extended deduction (ext_answer, server-checked)
                              |
                     POST /product {action:"request"}
                              v
                    product_claims(reference, product snapshot, status=requested)
                              |
STAFF /staff --> /api/product-claims/lookup?reference=...
              --> /api/product-claims/handoff (single conditional UPDATE)
                              |
                 recordGameplayMilestone(campaign_id + "#clue")
                 create -> delegate -> ER increment -> commit
                              v
                    claim.status=handed_off, chain evidence stored
                              |
PLAYER quest view --> optional.clue released only now
                              |
                 POST /product {action:"final"} -- server comparison
                              |
                 final_solved_at, final_answer_attempts, achievement

COMPANION POST /api/quests/[slug]/companion
   filtered QuestView (no answers, no locked clue)
        |
   ARG_AI_* configured ? OpenAI-compatible call : scripted Mara
        |
   companion_messages (per session, capped load)
```

- The campaign counter and the clue milestone are separate PDAs of the same unchanged program. The clue id is `${campaignId}#clue`, so P0.3 counters keep their value.
- Handoff is the only transition that releases the clue; the database update is the source of truth, and the ER call is attempted after it. A chain failure is recorded on the claim and does not fake a signature.
- The player view is assembled server-side. Private answers and locked clue text are excluded before either the page or the LLM sees the object.
- Product mode never issues a coupon. `optional_mode = 'coupon'` retains the P0.4 path exactly.
- The hidden ending is narrative only: no change to `reward_amount`, payout status, or the fixed transfer.

## Important distinctions

Knowing the clue answer is not proof that the user visited the referenced social profile. GPS+photo is limited evidence, not proof of continuous dwell. A confirmed Solana transaction does not prove app-level exactly-once reward. Demo coupons must be clearly nonredeemable in real businesses.

P1 adds: a real ER milestone proves only that *this app* performed a staff-confirmed handoff for a reference; it does not prove a real purchase, delivery or physical clue was handed over. The product clue is a simulation, and the companion is not an authority on the puzzle.

### P1 R2 (as built)

R2 is a presentation and workflow pass with **no schema change**. `src/lib/story-draft.ts` maps a Story Lab concept into the existing campaign form fields; the form merges it once through `sessionStorage` + `?lab=1` and then removes both, so refreshing cannot overwrite merchant edits. Shared player headings are campaign-generic, and `StoryTransition` derives its copy from campaign state rather than the seeded story. The staff page keeps coupon and product lookup as separate cards with anchors; technical payout and MagicBlock records remain in collapsed `<details>`. `scripts/run-tests.mjs` compiles `tsconfig.test.json`, enumerates the compiled `*.test.js` files and passes their explicit paths to Node's built-in test runner (Node 22 rejects a bare directory), so `npm test` works on Windows, macOS and Linux without shell globs.

R2 final corrections. Story Lab placeholder rejection lives in `validateCampaignInput` (`placeholderPaths` walks nested clue content), so an `INCOMPLETE` value cannot be stored in either campaign mode, and `submitCampaignForReview` repeats the scan for drafts saved before that check existed. `getQuestView` serialises the final question only once the product-clue handoff has happened, which also keeps it out of the companion's context until then; `submitFinalAnswer` still validates the answer server-side against the campaign record. `ProductMystery` renders the per-claim `milestoneState` as a visible one-line indicator (`Committed` only for a committed value read back with both signatures; `Unconfirmed`, `Unavailable` and `Not recorded` otherwise) and keeps signatures in the collapsed technical record. The Story Lab shares a tiny client-only dirty check (`src/lib/form-dirty.ts`) with the campaign form, so replacing unsaved input needs an explicit confirmation.

These caveats are for transparent UI/evidence, **not** pre-E2E research or security work.

## P2 collective investigation gate (as built)

```text
ER clue milestone  ["counter", sha256("<campaign_id>#clue")]
        |  create -> delegate -> ER increment -> commit   (unchanged P1 path)
        v
readGameplayMilestone(campaign.id, "clue")          read-only, server side
        |                                             (no mutation per AI message)
        v
collective.ts  validCount -> live ER value
        |  missing / malformed / unreachable / timeout -> phase "unavailable"
        |  committed base value > live ER value        -> stale, committed wins
        v
phase: none (0) | first (1) | unlocked (>=2)
        |
        +--> QuestView.collective (status always; evidence ONLY when unlocked)
        |        |
        |        +--> /quests/[slug]/play   shared-investigation panel + story event
        |        +--> companion provider prompt / scripted reply
        |        +--> GET /api/quests/[slug]/investigation, companion GET/POST
        |
        +--> player's own product clue   (unaffected: still gated by their claim)
```

- The gate is the **live ER value**, not a local row or a client value. A handoff still needs the staff confirmation route, which is the only writer of the milestone.
- `readCollectiveState` never throws; a failure becomes an `unavailable` state with an error string and no fragment. The play page and companion route await it with a 2.5 s timeout, so a slow RPC degrades to "locked", never to an error page.
- `buildCollectiveState` is pure, so the 0/1/2+ thresholds, stale-read rule, malformed values and campaign isolation are unit-tested without a network.
- The companion's context is reduced again in `companion.ts`: even a wrongly attached state can only expose the fragment when `phase === "unlocked"`.
- "ER live" and "Solana committed" are displayed separately, and the UI says the count is handoffs, not people. The app never claims that an ER increment is settled on Solana until the committed value is read back.
- `scripts/chain/p2-collective.mjs` repeats the evidence run (two handoffs, state before/between/after, Mara's permitted context, base-layer read, ER transaction lookup).

Scope held: no VRF, no Private ER, no new on-chain program, no payment change, no general multiplayer infrastructure, and no additional token reward.
