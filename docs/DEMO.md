# Live demo runbook

Status: P0.3 walked end to end — operator approval, MagicBlock Ephemeral Rollup counter, commit back to Devnet, and a real SPL payout to a fresh wallet.

## Setup

- Fictional merchant/store: **Umbra Coffee Roasters**, Seongsu-dong (fictional address)
- Online clue sources: in-app fictional demo pages at `/demo/umbra-roasters/...`
- Merchant website clue: `/demo/umbra-roasters/about`
- In-store observation: the framed 1998 stall photo and the ninth cup on the top shelf (described; no physical prop in this prototype)
- Network: **Solana Devnet**
- Test-token mint: `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1` — valueless **tUSDC / “ARG demo test token”** (6 decimals). This is **not** Circle USDC; the Circle devnet faucet was unusable from this environment (bot check).
- Reward treasury: `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N`
- Completion-counter program: `8q2dWZ81rkxShwUJThe48zuSL3ZURwhDwSzFcqqhPh3C` (program data `GUdp8L5WGi6CyprZjz7euqxfKcgm7YT81KzfjeTEe3Nq`)
- MagicBlock: Ephemeral Rollup, router `https://devnet-router.magicblock.app`, ER endpoint resolved to `https://devnet-as.magicblock.app` for the run below

## Reviewer journey (works today)

1. `/quests` → *The Ninth Cup* → **Start the quest**.
2. Read the three online sources; each opens the next. Click through to the demo pages.
3. Read the two in-store clues (the trail gate enforces online first).
4. Answer the counter: four shelves + one for the ninth cup = `5`.
5. Ask for the 3-minute hint, then the 5-minute hint (they unlock from the session start, not from a refresh).
6. Enable the camera and capture, upload a photo, or use the labelled demo simulation. Share location or decline it.
7. `/operator/evidence` → compare the photo with the private target description → **Approve**. This writes the completion *and* runs the MagicBlock step.
8. Back on the quest page: verified banner, stopped clock (`0:04 · stopped at verification` in the captured run), all five trail steps complete, fixed reward recorded.
9. In **Reward · Solana Devnet**, paste a Devnet address and press **Send 1.00 tUSDC**. Wait for the confirmation; the panel shows the signature, the recipient token account and the before/after balance.
10. Open the second question, read all three parts, answer `11`. The extended achievement appears on `/quests#achievements` and coupon eligibility flips to unlocked.

## Chain evidence from the P0.3 run (2026-11-21)

Campaign *The Ninth Cup* (`the-ninth-cup`), counter PDA `tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN`:

| Step | Signature / address |
| --- | --- |
| Create counter | `24yTF8M11JSyLMw83nsJjeNWb9KWPmDKxMcwDeHWh1gEb5QDCqCkxjcQJYe7Y9nDFGLHeXtbcjtL3jMcMB8fr3kY` |
| Delegate to ER | `2PLQ7xzaMmfSoe9rbUj5jxAEeGgHXfRGQQCoHMu7m2aEnp5fpEFz24EQR5yfWYXmsBvFWDCgwPv8cADKQ84LS4V7` |
| Increment on ER | `SeZzXjEDhj4NMmcQycj5HBxMqRsf46ZNZ2JPhmxYZzid7uV8HEJwTSF1hbu2Ub6CVcVTqgnokcKLqgfPf493TYd` |
| Commit to Solana | `3aQtNLznNUGUH9dfmiBbFuDNa3UknDV8kafWcyUbZXPKCDDqiXroBYksUce9NeSULzQVertMskGVhCecgxxDxFmf` |
| Counter value after | 2 verified completions (base layer) |

Payout to `3PKvZD6Y12WB6Bsidae3AS8CegcLJ4tpewm3RBy8QfnY`:

| Field | Value |
| --- | --- |
| Transfer | `H72C1YWT35Ci8cVavdjmKpWYaB2C9sPBp9HNJ5sxTN7negdoCwxWHGBKXXKA77SQ8RWrE67grbMCQhZ39tx8cpM` |
| Explorer | https://explorer.solana.com/tx/H72C1YWT35Ci8cVavdjmKpWYaB2C9sPBp9HNJ5sxTN7negdoCwxWHGBKXXKA77SQ8RWrE67grbMCQhZ39tx8cpM?cluster=devnet |
| Amount | 1.00 tUSDC = 1,000,000 base units |
| Recipient balance | 1,000,000 (1.000000 tUSDC) after the transfer |

Counter account on Explorer: https://explorer.solana.com/address/tKit7TX2wmCENAG3GmFX9HQrjwCYGsLJEDQDcL7ePvN?cluster=devnet

Reproduce with `node scripts/chain/app-e2e.mjs` against a running dev server, and `npx --yes tsx@4 scripts/chain/selftest.ts` for the chain-only lifecycle.

## Evidence to fill in

- [x] Playable quest, staged clues, timed hints, camera/upload evidence, operator verification, extended mystery
- [x] Real Devnet SPL payout with a confirmed signature and a verified balance change
- [x] MagicBlock execution: delegation, ER increment, commit back to Solana, committed counter value
- [ ] Deployed app URL
- [ ] Coupon issuance and staff redemption (P0.4)
- [ ] Screen recording
- [x] Known limitations / demo-only steps (see README)

**Do not mark done until genuinely observed.** The items above were observed through the app's own API and in the cloud browser; the hosted deployment URL is still missing.
