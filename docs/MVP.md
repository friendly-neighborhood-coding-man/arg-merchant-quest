# MVP — one working vertical slice

**Priority: user experience and function integration, not exhaustive hardening.** All checkboxes are pending until implemented and demonstrated.

## P0 — full end-to-end

- [ ] Merchant creates one campaign: shop details, permitted spot, SNS/site clue URLs, object image, reward, coupon terms.
- [ ] Operator previews and approves the campaign.
- [ ] Visitor selects the shop and solves an easy basic in-store finding mission.
- [ ] Optional hints appear at **3 and 5 minutes**; hint usage does not change the fixed reward.
- [ ] Visitor uses **in-app camera**, explicitly permits location, and submits photo/time/location evidence. A limited verifier reports what was checked.
- [ ] One actual Devnet test-token reward transaction is initiated and shown with confirmed chain status and explorer link.
- [ ] MagicBlock is **actually exercised** for a relevant feature, with transaction / execution evidence.
- [ ] Optional SNS + website + in-store ARG resolves to an achievement and conditional secret-menu coupon.
- [ ] Staff opens the issued coupon and completes a redemption action.
- [ ] Merchant dashboard reflects visit, reward transaction and coupon result.
- [ ] Replaying the full walkthrough requires no developer-only database patching or pre-recorded 'payment succeeded' screen.

## P1 — make it feel like a product

- [ ] One compelling fictional branded ARG (e.g. a lost recipe), not a collection of disconnected tasks.
- [ ] Fast, mobile-friendly screens; functional permission/failed-attempt UX.
- [ ] Coupon condition clearly shown **before** ARG (e.g. demo purchase threshold, expiry, availability).
- [ ] Personal non-financial achievements; no first-to-solve and no race incentives.
- [ ] Live demo and/or explicitly labeled simulation for physical spaces.

## P2 — demo proof

- [ ] Reviewer can follow the whole journey without explanation.
- [ ] Real MagicBlock operation can be independently identified.
- [ ] Explorer verifies a Devnet transfer; test token identified honestly.
- [ ] Screenshots/recording, issue list, known limitations.

## Deferred until after E2E

Custom duplicate-payout prevention, custom coupon anti-replay guards, advanced budget accounting, fraud model, formal security review, mainnet, real-redeemable coupons, complex receipt/group systems, regional payment rails, country-by-country legal research.

**Boundary:** native chain guarantees are reused; they must not be described as providing these application-level guarantees. Do not use real money while they are not designed and tested.
