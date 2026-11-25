# P3 (revised) — MagicBlock-native, token-funded Claude access

Branch `feature/p3-magicblock-native-payments`, based on the frozen release
`a29f195`. Devnet only. Nothing was merged, deployed, funded or paid for.

The player experience implemented here:

```
verified merchant visit → existing Devnet reward (1.00 tUSDC) →
optional "deep investigation" quote → player pays the quote from their own
wallet (Solana Pay, same tUSDC mint) → server verifies the transfer on Devnet →
one real Claude Opus 5.5 call → reply + usage + cost + receipt + balance
```

The free trail, timed hints, scripted guide and free companion are untouched and
never require a payment.

---

## 1. Official capability report

Checked against MagicBlock's live API on 2026-11-25 (read-only):

| Capability | Official status | Usable here? |
| --- | --- | --- |
| x402 v2 on Devnet | `GET /v1/x402/supported` advertises `exact-magicblock` for `solana:EtWTRABZ…` (**devnet**) and mainnet, `settlement: ephemeral-rollup`, `paymentFlow: upfront` | **Available, not used** — see §2 |
| MPP on Devnet | `/v1/mpp/payments/{id}/pay` exists alongside `/v1/x402/payments/{id}/pay` | Same onboarding requirement as x402 |
| Merchant registration | `POST /v1/merchants/challenge` (wallet + purpose) then `POST /v1/merchants` with a base64 Ed25519 signature over the challenge | Requires a new MagicBlock merchant identity |
| Merchant checkout | `POST /v1/payment-links` (amount, `cluster: mainnet\|devnet\|mainnet-private\|devnet-private`), then a checkout per buyer, paid via the x402/MPP `pay` route | Needs merchant credentials for `verify`/`settle` |
| Facilitator verify/settle | `POST /v1/x402/verify`, `/v1/x402/settle` — "requires merchant API credentials" | Not available to this app |
| SPL payments API | `/v1/spl/initialize-mint`, `/deposit`, `/transfer`, `/balance`, `/is-mint-initialized`, `/undelegate-ephemeral-ata`; `cluster` accepts **devnet**; the mint is a parameter, so **any mint, including the ARG reward mint**, is addressable | **Official MagicBlock-native alternative for this token** |
| Session keys / sponsored transactions | MagicBlock's private-payment guide documents session-based flows for the SPL API; the ER fee payer path is the app's existing router/validator setup | Not needed for the base-layer flow |

### Is the existing Devnet reward mint supported?

Yes at the API level: the SPL payments API takes `mint` as a parameter and routes
to the devnet ephemeral RPC. The mint must be **initialized once** on MagicBlock
(`POST /v1/spl/initialize-mint` with `{payer, mint, cluster: "devnet"}`) before
ER transfers/deposits. That is a Devnet on-chain write and **has not been
executed** — it needs approval.

Measured state of this repo's reward mint (2026-11-25, read-only):

```
GET /v1/spl/is-mint-initialized?mint=61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1&cluster=devnet
{"mint":"61xJEucfUnr…","validator":"MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
 "transferQueue":"4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91","initialized":false}
```

So the mint is known to MagicBlock's devnet registry but **not initialized**.
Corrected on 2026-11-25: this is required for the **transfer queue** (queue-backed
settlement and withdraw routes), while a `deposit` build *simulates successfully
without it* (measured). The implemented flow does not depend on either step.

Native x402 and the exact eSPL authorizations are analysed in
`docs/P3_NATIVE_PAYMENT_FEASIBILITY.md`.

### Are rewarded tokens deposit-able / delegate-able / spendable?

Yes through the same SPL API (`deposit → delegated ephemeral ATA → transfer →
undelegate`), which is the officially supported Devnet path for spending an
arbitrary SPL token on MagicBlock. What it requires is for the **payer's wallet**
to talk to MagicBlock's ephemeral RPC (challenge/login per wallet), which the
current browser UI does not do.

## 2. Why the implementation verifies a base-layer transfer instead

The x402/MPP merchant checkout is real on Devnet, but using it would mean:

1. registering this app as a MagicBlock merchant with a new signing identity and
   storing merchant API credentials for `verify`/`settle`;
2. pointing the product at a checkout whose references are MagicBlock's own
   payment objects, not the visit-token transfer between two accounts in this
   app;
3. adopting MagicBlock's delegated-asset settlement semantics for a valueless
   demo token whose only purpose is "one visit = one optional deep question".

That is a much larger change than the slice needs, and it would put an external
merchant account in the critical path of a hackathon demo. The alternative used
here is the officially supported Devnet **token-transfer** path: the player's
wallet sends the existing reward token to the app's receiving address, and the
server verifies **amount, mint, recipient, payer, reference binding, status and
age** from the confirmed transaction.

**This is not x402 and not MPP settlement.** No MagicBlock merchant, facilitator
or ephemeral rollup is involved in the payment leg. The app's existing MagicBlock
usage is unchanged: the campaign completion and clue milestones still live in the
deployed ER counter program.

## 3. Exact payment and inference architecture

```
Browser (player)                    Server (Next.js)                       Devnet
────────────────                    ─────────────────                      ──────
Ask a question               ──►  POST /api/quests/:slug/ai
                                    {action:"quote"}
                                    • price = ARG_AI_PAYMENT_PRICE (0.20 tUSDC)
                                    • intent row: unique reference pubkey,
                                      receiver ATA, request hash, 15-min TTL
                             ◄──  {intentId, priceLabel, solana: URI}

Wallet signs the Solana Pay    ─────────────────────────────────────────►  SPL transfer
transfer (same tUSDC mint)                                                 mint → receiver,
                                                                            reference account
"I paid — verify"            ──►  {action:"settle"}
                                    • find tx by reference (bounded search)
                                    • verify success/reference/amount/mint/
                                      recipient/payer/age
                                    • claim intent once (UNIQUE signature)
                             ◄──  {status:"paid", receipt{signature,payer,…}}

Run the deep investigation   ──►  {action:"investigate"}
                                    • paid → consumed (conditional UPDATE)
                                    • one charge row (UNIQUE intent)
                                    • Claude Opus 5.5 via the existing client
                                      with the existing filtered context
                             ◄──  {reply, usage, estimatedCostUsd, receipt,
                                   balanceAfter}
```

Server files:

| File | Role |
| --- | --- |
| `src/lib/ai-payments/config.ts` | price, mint, receiver, TTL, caps, cost rates; Solana Pay URI |
| `src/lib/ai-payments/verify.ts` | pure transaction verification (no trust in the client) |
| `src/lib/ai-payments/rpc.ts` | bounded Devnet lookup by reference, parsed-transaction mapping |
| `src/lib/ai-payments/store.ts` | intents, charges, refund credits, conditional state transitions |
| `src/lib/ai-payments/service.ts` | quote → settle → infer orchestration, limits, refunds |
| `src/app/api/quests/[slug]/ai/route.ts` | GET state, POST quote/settle/investigate |
| `src/components/companion-panel.tsx` | the "Deep investigation" block inside Mara's drawer |
| `src/lib/chain/config.ts` | `treasuryPubkey()` — public key only, for the default receiver |

## 4. Payment correctness

Implemented and covered by `tests/ai-payments.test.ts` (16 new tests):

- **Amount** — the transfer must be ≥ the quoted price; under-payment stays
  `quoted` and can never run inference.
- **Mint** — checked from `transferChecked`, or resolved from the destination
  token account for a plain transfer; anything else is rejected.
- **Recipient** — the exact receiver ATA derived from the configured receiver.
- **Payer** — recorded from the transfer authority, never from the request body.
- **Status and age** — the transaction must have succeeded and be no older than
  the intent (120 s clock tolerance); a failed or stale transfer is rejected.
- **Binding** — the intent's unique reference key must be in the transaction's
  account keys; one payment settles one quote.
- **Replay** — `signature` is UNIQUE; reusing one transaction for another quote
  is refused (`signature_replayed`), and re-settling the same quote returns
  `already_paid` without a second credit.
- **Idempotent inference** — `ai_inference_charges.intent_id` is UNIQUE and the
  `paid → consumed` transition is conditional, so concurrent or repeated
  requests get the stored reply instead of a second Claude call.
- **Concurrency** — claims are single conditional `UPDATE`s; SQLite serialises
  them and the loser gets a clear refusal.
- **Limits** — per-session daily count, pending-quote cap, aggregate daily
  inference budget (checked before the call), fixed max output tokens.
- **Failed inference** — the charge is marked failed and the same player gets one
  no-cost replacement credit; the next quote is created already `paid` with no
  wallet interaction (`refund_owed` → credit → used).
- **Uncertain** — a lookup that finds nothing returns `pending` (HTTP 202) and
  changes nothing; only a confirmed, verified transaction can transition an
  intent.
- **Secrets** — no treasury key is used by any of this code; the receiver is a
  public address. The Anthropic key stays server-side; the browser never sees it.

## 5. Limits and accounting honesty

- The on-chain transfer is real; its **value is zero** (valueless Devnet test
  token). It buys an optional extra answer, not money.
- The inference is a **real Claude Opus 5.5 request** paid for with the app's
  Anthropic credits. **Anthropic does not accept tokens or cryptocurrency**; the
  token is the app's own access meter, not a payment to Anthropic.
- `estimatedCostUsd` is computed from the provider's reported token usage and
  the configured rates (default $4 / $20 per 1M in/out). It is an estimate, not
  an invoice.
- The "refund" is a server-side replacement request. No automatic treasury
  transfer is made, so a player who paid and got nothing gets the service again,
  not tokens back.
- Balances shown in the UI are read from Devnet for the wallet that received the
  reward; a client-reported balance is never used.

## 6. Estimated integration complexity

| Piece | Size | State |
| --- | --- | --- |
| Config + verification + store + service | ~750 lines | done |
| API route (GET + 3 POST actions) | ~100 lines | done |
| Companion-panel block | ~120 lines | done |
| Tests | 16 | done |
| MagicBlock merchant/x402 onboarding (not taken) | days, new identity + credentials | out of scope |
| ER delegated token flow for the payer wallet (not taken) | needs wallet-side MagicBlock client | out of scope |

## 7. Reproducible end-to-end demonstration (needs approval)

The on-chain steps below have **not** been executed. They require explicit
approval because they write to Devnet.

1. `npm run chain:setup` (or the existing live environment) — treasury holds the
   reward mint and Devnet SOL.
2. Play a campaign to a verified completion and claim the reward to a Devnet
   wallet: record `payout.signature` and the resulting token balance.
3. Open Mara, write a question, press **Quote deep investigation** — the panel
   shows the price (0.20 tUSDC), the receiver and a `solana:` link.
4. Pay it from that wallet (Phantom/CLI, same mint). Record the transfer
   signature.
5. Press **I paid — verify** — the server finds the transaction by reference,
   verifies it and shows the receipt (signature, payer, amount).
6. Press again to run the investigation — a real Claude Opus 5.5 answer appears
   with `input/output` tokens, estimated USD cost, and the wallet balance after.
7. Negative checks: reuse the same signature for a fresh quote (rejected as
   `signature_replayed`), or pay 0.10 instead of 0.20 (rejected as
   `insufficient_amount`, quote stays open).

Expected evidence to capture: reward balance before, transfer signature, balance
after, receipt, Claude reply, usage/cost. `node scripts/p3/magicblock-capabilities.mjs`
captures the MagicBlock-side capability evidence (read-only).

## 8. What is deliberately NOT done

- No MagicBlock merchant registration, no x402/MPP payment, no ER token
  delegation or `initialize-mint` write.
- No new token, no reward change, no paid progression, no purchase required for
  the story or the reward.
- No mainnet, no real money, no wallet funding.
- No merge and no deployment.
- The campaign id stored on an intent is the campaign slug, not the internal id
  (kept small on purpose).
