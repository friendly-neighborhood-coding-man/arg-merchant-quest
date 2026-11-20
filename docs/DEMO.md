# Live demo runbook

Status: P0.2 walked end to end in a browser. The reward transfer and MagicBlock step are still P0.3, so this runbook stops at a recorded completion.

## Setup

- Fictional merchant/store: **Umbra Coffee Roasters**, Seongsu-dong (fictional address)
- Online clue sources: in-app fictional demo pages at `/demo/umbra-roasters/...`
- Merchant website clue: `/demo/umbra-roasters/about`
- In-store observation: the framed 1998 stall photo and the ninth cup on the top shelf (described; no physical prop in this prototype)
- Network: **Solana Devnet** (P0.3, not yet wired)
- Test-token mint: **TBD (not real USDC unless verified)**
- MagicBlock actual integration: **TBD**

## P0.2 reviewer journey (works today)

1. `/quests` → *The Ninth Cup* → **Start the quest**.
2. Read the three online sources; each opens the next. Click through to the demo pages.
3. Read the two in-store clues (the trail gate enforces online first).
4. Answer the counter: four shelves + one for the ninth cup = `5`.
5. Ask for the 3-minute hint, then the 5-minute hint (they unlock from the session start, not from a refresh).
6. Enable the camera and capture, upload a photo, or use the labelled demo simulation. Share location or decline it.
7. `/operator/evidence` → compare the photo with the private target description → **Approve** (or reject with a note and resubmit).
8. Back on the quest page: verified completion, fixed reward recorded, coupon eligibility locked.
9. Open the second question, read all three parts, answer `11`. The extended achievement appears on `/quests#achievements` and coupon eligibility flips to unlocked.

## Evidence to fill in

- [x] Playable quest, staged clues, timed hints, camera/upload evidence, operator verification, extended mystery
- [ ] Deployed app URL
- [ ] Devnet explorer transaction URL (P0.3)
- [ ] MagicBlock execution proof (P0.3)
- [ ] Coupon issuance and staff redemption (P0.4)
- [ ] Screen recording
- [ ] Known limitations / demo-only steps (see README)

**Do not mark done until genuinely observed.**
