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

## Important distinctions

Knowing the clue answer is not proof that the user visited the referenced social profile. GPS+photo is limited evidence, not proof of continuous dwell. A confirmed Solana transaction does not prove app-level exactly-once reward. Demo coupons must be clearly nonredeemable in real businesses.

These caveats are for transparent UI/evidence, **not** pre-E2E research or security work.
