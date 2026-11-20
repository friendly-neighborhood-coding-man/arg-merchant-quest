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

## Important distinctions

Knowing the clue answer is not proof that the user visited the referenced social profile. GPS+photo is limited evidence, not proof of continuous dwell. A confirmed Solana transaction does not prove app-level exactly-once reward. Demo coupons must be clearly nonredeemable in real businesses.

These caveats are for transparent UI/evidence, **not** pre-E2E research or security work.
