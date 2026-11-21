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

## Important distinctions

Knowing the clue answer is not proof that the user visited the referenced social profile. GPS+photo is limited evidence, not proof of continuous dwell. A confirmed Solana transaction does not prove app-level exactly-once reward. Demo coupons must be clearly nonredeemable in real businesses.

These caveats are for transparent UI/evidence, **not** pre-E2E research or security work.
