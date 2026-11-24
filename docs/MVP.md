# MVP — one working vertical slice

**Priority: user experience and function integration, not exhaustive hardening.** P1 “Living ARG”, P1 R2 “Playable Experience & Demo Polish” and P2 “MagicBlock Adaptive Intelligence” are implemented; the live LLM path remains open.

## P0 — full end-to-end

- [x] Merchant creates one campaign: shop details, permitted spot, SNS/site clue URLs, target object, reward, coupon terms. *(P0.1 — object is described in text; evidence capture arrives with P0.2, reference-image upload is still out of scope.)*
- [x] Merchant can correct a campaign while it is a draft or after it is sent back, then resubmit it. *(P0.1 — editing is locked while in review and after publishing.)*
- [x] Operator previews and approves the campaign. *(P0.1 — approve publishes to discovery; reject requires a note that survives resubmission. P0.2 adds a submit gate: no counter answer, no submission.)*
- [x] Visitor selects the shop and solves an easy basic in-store finding mission. *(P0.2 — staged online → in-store trail, a server-checked counter answer, and an in-app evidence step.)*
- [x] Optional hints appear at **3 and 5 minutes**; hint usage does not change the fixed reward. *(P0.2 — unlock time is derived from the session start on the server, not from a page refresh.)*
- [x] Visitor uses **in-app camera**, explicitly permits location, and submits photo/time/location evidence. A limited verifier reports what was checked. *(P0.2 — the verifier is a human operator; camera, upload and a labelled simulation are supported, and location is optional.)*
- [x] One actual Devnet test-token reward transaction is initiated and shown with confirmed chain status and explorer link. *(P0.3 — the visitor pastes a Devnet address after verification; the treasury sends 1.00 tUSDC, confirms it, and the app stores `paid` plus the signature and before/after balance. The asset is a valueless demo token, clearly labelled, not Circle USDC.)*
- [x] MagicBlock is **actually exercised** for a relevant feature, with transaction / execution evidence. *(P0.3 — per-campaign completion counter delegated to an Ephemeral Rollup, incremented on the ER, committed back to Devnet; program, counter address and signatures are shown in the UI and returned by the API.)*
- [x] Optional SNS + website + in-store ARG resolves to an achievement and conditional secret-menu coupon. *(P0.2 — social-style clue, merchant-site clue, in-store observation and a final answer; sets `coupon_eligible`. Coupon issuance itself is P0.4.)*
- [x] Staff opens the issued coupon and completes a redemption action. *(P0.4 — `/staff` looks up the code, shows the campaign terms, requires an explicit demo-condition confirmation, and performs a single-use conditional update. The coupon is a fictional entitlement; no payment is processed.)*
- [x] Merchant dashboard reflects visit, reward transaction and coupon result. *(P0.4 — `/merchant` reports verified demo completions, payouts paid/pending/failed, extended solves, coupons issued/redeemed per campaign, with a recent-activity feed. No revenue or conversion claims.)*
- [x] Replaying the full walkthrough requires no developer-only database patching or pre-recorded 'payment succeeded' screen. *(P0.3 — the reward is a real transfer from the demo treasury; `node scripts/chain/app-e2e.mjs` replays the whole journey through the app's own API.)*

## P1 — make it feel like a product

- [x] One compelling fictional branded ARG (e.g. a lost recipe), not a collection of disconnected tasks. *(P0.2 — The Ninth Cup.)*
- [x] Fast, mobile-friendly screens; functional permission/failed-attempt UX. *(P0.2 — mobile-first single column, denied-camera and denied-location paths, wrong-answer handling, rejected-evidence resubmission.)*
- [x] Coupon condition clearly shown **before** ARG (e.g. demo purchase threshold, expiry, availability). *(P0.1 briefing; P0.2 keeps it on the briefing and in the completion card.)*
- [x] Personal non-financial achievements; no first-to-solve and no race incentives. *(P0.2 — trail-complete and extended-mystery achievements.)*
- [x] Live demo and/or explicitly labeled simulation for physical spaces. *(P0.2 — the demo simulation is labelled on the image and in the operator queue.)*
- [x] Product-contained final clue with a one-time staff handoff, hidden ending and persistent achievement. *(P1 — `optional_mode = 'product_clue'`; the clue is released only after the conditional handoff and never enters the player view before that. The product order is simulated; no payment is processed.)*
- [x] AI investigation companion with revealed-clue context, honest fallback and no private answer leakage. *(P1 — OpenAI-compatible adapter via `ARG_AI_*`, deterministic scripted Mara when unconfigured or unavailable; the final answer and locked clue are filtered out server-side. Live provider path unverified without a key.)*
- [x] Real MagicBlock gameplay state that changes companion guidance. *(P1 — an isolated clue milestone PDA is created/delegated/incremented/committed on the ER at handoff; the companion reads it and changes its next-step guidance. ER failure is recorded, never faked.)*
- [x] Merchant story-drafting aid that separates facts, merchant input and fiction. *(P1 — `/merchant` story lab, draft only, three concepts, local fallback without a key. R2 adds **Use this concept**, which merges one draft into the existing form once and marks unsupplied required fields `INCOMPLETE —`.)*
- [x] Playable-experience pass. *(R2 — objective-first player flow, campaign-aware transitions, generic headings, inline optional invitation, collapsed technical evidence, separated staff coupon/product workflows, mobile safeguards and overflow checks at 390/768/1280 px.)*
- [x] Portable regression suite. *(R2 — `npm test` runs `node scripts/run-tests.mjs`: `tsc -p tsconfig.test.json`, then Node's built-in test runner over the enumerated `*.test.js` files, which Node 22 accepts where a bare directory does not. 30 tests.)*

## P2 — MagicBlock adaptive intelligence

- [x] Real ER milestone state drives what the AI companion may investigate. *(P2 — the campaign clue milestone `milestoneSeedCampaignId(campaignId, "clue")` is read on the server; 0 = none, 1 = first verified handoff, 2+ = shared evidence unlocked. The count records eligible handoffs, not unique people.)*
- [x] Collective evidence cannot leak before the gate. *(P2 — the Ninth Cup fragment is attached to the view/provider prompt/API/HTML only when the live ER value reaches 2; locked states carry status but no text, and `companionContextSnapshot` proves the difference deterministically.)*
- [x] Unavailable, stale or malformed ER reads do not unlock or fabricate progress. *(P2 — a missing/erroring/timed-out read is `unavailable`; an ER value behind the committed base value is marked stale and the committed value wins; both values are shown.)*
- [x] Player-facing shared investigation. *(P2 — compact panel with personal progress, the collective milestone, locked/unlocked state, ER-live versus Solana-committed values, a story event on unlock, and an **Ask Mara to revisit the earlier theories** action.)*
- [x] Preserved behaviour and separate identities. *(P2 — a player's own product clue still depends only on their claim; product-clue mode still never issues a coupon; the fixed reward, hidden ending and scripted guidance are unchanged. 42 tests.)*

## P2 — demo proof

- [x] Reviewer can follow the whole journey without explanation. *(P0.4 — merchant → operator → play → evidence → payout → extended ARG → coupon → staff redemption → dashboard.)*
- [x] Real MagicBlock operation can be independently identified. *(P0.3/P0.4 — counter program, PDA, delegate, ER increment/commit and the committed base-layer value; ER transactions verified through the recorded ER endpoint.)*
- [x] Explorer verifies a Devnet transfer; test token identified honestly. *(P0.3 — signature and before/after balance stored; the asset is labelled tUSDC / demo test token, never Circle USDC.)*
- [ ] Screenshots/recording, issue list, known limitations. *(Screenshots and limitations exist; a recording and hosted URL are still open.)*

## Deferred until after E2E

Custom duplicate-payout prevention, custom coupon anti-replay guards, advanced budget accounting, fraud model, formal security review, mainnet, real-redeemable coupons, complex receipt/group systems, regional payment rails, country-by-country legal research.

**Boundary:** native chain guarantees are reused; they must not be described as providing these application-level guarantees. Camera/location evidence is reviewed by a person and is never claimed as cryptographic proof. Do not use real money while the remaining phases are unimplemented.
