# P3 correction — native MagicBlock payment: feasibility and authorization request

Branch `feature/p3-native-payment-authorization`, based at the preserved commit
`9838c02` (the working token-funded implementation). Devnet only.

**This document is read-only work.** No wallet was funded, no merchant was
registered, no transaction was signed or submitted, no mint was initialized, and
nothing was merged or deployed. Everything below is either quoted from official
sources or measured with unsigned transaction *builds* and Devnet
`simulateTransaction`, which changes no state.

Reproduce every number here with:

```bash
node scripts/p3/native-payment-feasibility.mjs
```

---

## 0. Verdict

| Question | Answer |
| --- | --- |
| Is native `exact-magicblock` x402 live on Devnet? | **Yes** — advertised for `solana:EtWTRABZ…` (`devnet`) and `devnet-private`, `settlement: ephemeral-rollup`, `paymentFlow: upfront` |
| Can native x402 accept the existing reward mint? | **No.** A checkout/offer cannot name a mint at all (measured `422 unrecognized_keys: "mint"`, `additionalProperties: false`). Merchant checkout settles **USDC for the cluster** — devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Does adopting x402 mean changing the reward economy? | **Yes.** It would replace the tUSDC visit token with devnet USDC for this purchase path. Per instruction, that is *not* done silently — it is a product decision you have to make explicitly |
| Is there a genuinely MagicBlock-native path for the existing token? | **Yes** — the official Ephemeral SPL Token (eSPL) payments API accepts an arbitrary `mint`, builds and simulates successfully for our mint, and executes the payment **on the ephemeral rollup**, not as an ordinary base-layer transfer |
| What does that path cost and require? | One `initialize-mint` write paid by us (**measured 0.18953 SOL**), and a per-player `deposit` write paid by the player (**measured 0.01444 SOL** for the first depositor, which creates the per-mint Global Vault). The ER payment leg itself reports **0 lamports / 0 tokens** in fees |
| Is the existing correctness layer reusable? | **Yes** — ledger, idempotency, caps, daily budget, pending/paid/consumed states and the Claude adapter all carry over; only the payment *discovery and verification* module changes |
| Was anything executed? | **No.** See §4 for the exact list of authorizations required before any write |

---

## 1. Priority 1 — native x402 (`exact-magicblock`)

### 1.1 What is advertised (live, 2026-11-25)

```
GET https://api.magicblock.app/v1/x402/supported        HTTP 200
  exact-magicblock · solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp · mainnet        · ephemeral-rollup · upfront
  exact-magicblock · solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp · mainnet-private · ephemeral-rollup · upfront
  exact-magicblock · solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 · devnet         · ephemeral-rollup · upfront
  exact-magicblock · solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 · devnet-private · ephemeral-rollup · upfront
  extensions: ["magicblock"]
```

The x402 surface is `/v1/x402/verify` and `/v1/x402/settle` (facilitator
middleware, `x402Version: 2`, "requires merchant API credentials") plus
`/v1/x402/payments/{id}/pay` for the buyer, with the MPP twin
`/v1/mpp/payments/{id}/pay`.

### 1.2 Can it accept our mint? — measured, no

Three independent checks all say the same thing:

1. **The offer schema has no mint field and rejects one.**
   `POST /v1/payment-links` with our mint added:

   ```
   HTTP 422
   [{"code":"unrecognized_keys","message":"Unrecognized key: \"mint\"","path":[]}]
   ```

   The OpenAPI document declares both `/v1/payments` and `/v1/payment-links`
   with `additionalProperties: false` and exactly these fields: `amount`,
   `cluster`, `description`, `resource`, `requestHash`, `expiresInSeconds`,
   `externalReference` (`payer` added for `/v1/payments`). There is no `asset`,
   `mint` or `token` key anywhere in the checkout contract.

2. **The API's own description says USDC.** The reference index states merchant
   checkout sells "API access and products with **delegated USDC**"; the x402
   tag is described as "challenges, payment credentials and facilitator
   endpoints for **delegated USDC**"; MPP likewise.

3. **The mint defaults confirm it.** Where the API *does* accept a mint (the
   SPL endpoints), devnet defaults to `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
   — the devnet USDC mint. The checkout endpoints do not accept a mint, so the
   cluster default is the only asset.

**Conclusion:** native x402 would require devnet USDC. Since the quest's reward,
prices, ledger and UI are denominated in the project's own devnet tUSDC mint,
adopting x402 would silently replace the reward economy — explicitly forbidden.
It is therefore **available but not adopted**; this is a product decision to be
made by you, not an engineering default.

### 1.3 Merchant registration (what it would take)

| Step | Call | Notes |
| --- | --- | --- |
| 1 | `POST /v1/merchants/challenge {wallet, purpose:"register"}` | Returns `{id, wallet, purpose, expiresAt, message}`. Off-chain, free, no transaction |
| 2 | Sign `message` (UTF-8) with the wallet → base64 Ed25519 signature | The wallet becomes the merchant identity |
| 3 | `POST /v1/merchants {wallet, challengeId, signature}` | Returns `merchantId` + `apiKey` (shown once) |
| 4 | Merchant calls | `Authorization: Bearer <apiKey>` + `X-Merchant-Id: <wallet>` |
| 5 | `POST /v1/merchants/rotate-key` | Key rotation, same challenge flow |

Measured during this investigation: `POST /v1/merchants/challenge` with the
all-zero program id returned HTTP 200 with a challenge message, e.g.

```
https://payments.magicblock.app requests merchant register
Wallet: 11111111111111111111111111111111
Nonce: b7434ac9-4d78-4291-8c02-0a7bd22e63ff
Expires: 2026-11-25T18:14:24.339Z
```

That challenge was **never signed** and no merchant was registered. Requesting a
challenge is the only merchant-side action taken, and it created no account.

Registration itself is a signed *message*, not a chain write and not a payment —
but it makes that wallet the merchant of record for this API, so it is listed as
an authorization, not something to do casually.

### 1.4 Buyer flow, signing, verification, settlement

Per the official client contract (MagicBlock dev-skill `private-payments.md`,
§"Merchant Checkouts") and the live OpenAPI:

1. `POST /v1/payments` (or a reusable `POST /v1/payment-links` + per-buyer
   `checkouts`) creates the order; `externalReference` is unique per merchant
   and retries return the same payment; changed terms return `409
   PAYMENT_ORDER_CONFLICT`.
2. `POST /v1/payments/{id}/prepare` returns **one SPL transfer plus a
   `payment:<id>` memo**. The buyer signs and pays a fee that **must be exactly
   zero**.
3. The buyer submits via `POST /v1/payments/{id}/settle`, or through
   `POST /v1/x402/payments/{id}/pay` (`PAYMENT-SIGNATURE` header) or
   `POST /v1/mpp/payments/{id}/pay` (`Payment-Authorization`).
4. The merchant fulfils only after `GET /v1/payments/{id}` reports **`paid`**.
   `paid` means **ER confirmation, not L1 commitment**. A pending response is
   not a payment; poll, never re-sign.

Hard prerequisites, quoted:

> "Both buyer and merchant eATAs must already be delegated to the same
> validator. Checkout performs no deposit, withdrawal, sponsorship, or account
> creation."

> "Stock Solana x402/MPP clients do not understand delegated accounts or ER
> routing."

So even with USDC, each player would need a delegated devnet-USDC eATA before
their first purchase — a deposit they must sign and fund, plus a USDC balance we
would have to supply (devnet USDC is not something the quest currently pays).
That is a second, larger product change.

### 1.5 Expected settlement latency

- ER execution and `paid` state: sub-second (rollup-speed; the whole point of
  `settlement: ephemeral-rollup`). No exact figure is published and we cannot
  measure it without a write.
- Base-layer (L1) commitment after ER settlement: asynchronous, seconds, and
  **not** what `paid` means. If the app needed L1 finality it would have to own
  that observation itself.
- Idempotency and pending semantics are the same shape the current P3 layer
  already models (`quoted → paid → consumed`, 202 for pending, never a paid
  transition on uncertainty).

---

## 2. Priority 2 — native SPL path for the existing reward token

This is the only route that keeps the reward economy exactly as it is **and**
moves the payment onto MagicBlock infrastructure. It uses the official
Ephemeral SPL Token program `SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2` through
the hosted API — no custom contract, no new token.

### 2.1 Measured current state of our mint (2026-11-25)

```
GET /v1/spl/is-mint-initialized?mint=61xJ…&cluster=devnet
{ "validator":"MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
  "transferQueue":"4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91", "initialized":false }

GET …&validator=MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd
{ "transferQueue":"JE7CLL968jsmsQpzoMwDxgYPXrS18YzJf8mEGfZfA6ge", "initialized":false }

GET /v1/spl/balance?address=DUony…&mint=61xJ…&cluster=devnet
{ "ata":"7Ti2w9WrGNiXxh9dNfyashcc8DgKYZv7ADmNuYSqCtH1",
  "location":"base", "balance":"993000000", "delegation":{"status":"undelegated"} }
```

The mint is known to MagicBlock but has **no transfer queue on any devnet
validator**, and the treasury's token account is still a plain base-layer ATA.
A transfer queue is per **mint × validator**, so initializing one validator does
not initialize another.

### 2.2 The exact native flow

```
A. initialize-mint        (one-time, WE pay)                0.18953 SOL   [approval A1]
B. deposit / delegate     (player signs, base layer)        0.01444 SOL   [approval A3]
C. ER transfer            (player signs, ephemeral RPC)     0.00000 SOL   [approval A4]  ← the payment
D. merchant eATA balance  (no action)
E. server verification    (read-only: ER tx + balances)
F. withdraw to base       (optional, merchant pays)
```

**A — `POST /v1/spl/initialize-mint`** `{payer, mint, cluster:"devnet"}`
builds 7 instructions (`sendTo: base`, signer = payer). Simulation:

```
kind=initializeMint  ix=7  signer=DUony…
transferQueue=4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91
rentPda      =4RvdEGaUyChj3AketeBZoY1EotNtPveMFUXL8DVetrAp
sim: succeeds, 170 959 CU, fee payer −189 534 520 lamports (0.18953 SOL)
logs: Program DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh success
      Program SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2 success
```

**B — `POST /v1/spl/deposit`** `{owner: player, mint, amount, cluster:"devnet",
initIfMissing:true, initAtasIfMissing:true, initVaultIfMissing:true}` wraps the
SDK `delegateSpl(...)` flow: 7 instructions, `sendTo: base`, signer = player.
Simulation with the treasury as owner:

```
kind=deposit  ix=7  signer=DUony…
sim: succeeds, 174 177 CU, fee payer −14 437 680 lamports (0.01444 SOL)
```

The player's real tokens move into the per-mint **Global Vault**, their
**ephemeral ATA** is credited, and the eATA is **delegated** to the validator.
Note the measured cost: this is the *first* deposit for the mint, so it includes
the Global Vault's rent, which every later depositor reuses. Later deposits are
cheaper, but the exact figure cannot be measured without a write.

**C — `POST /v1/spl/transfer`** `{from: player, to: merchant, mint, amount,
cluster:"devnet", visibility:"public", fromBalance:"ephemeral",
toBalance:"ephemeral"}` builds **one** instruction with `sendTo: ephemeral`,
`fees: {lamports:"0", tokens:"0"}`. The player signs and the transaction is
submitted to MagicBlock's ephemeral RPC — this is the ER-executed payment. It is
not the 0.1 % private base→base route, so no privacy fee applies; `visibility`
is `public`, so the transfer is readable, which is exactly what server-side
verification needs.

**D.** The merchant's eATA now holds the balance inside the rollup.

**E — verification (server-side, never trusting the client).** Two independent
facts, both server-observed:

1. the ER transaction signature: fetch it from the ephemeral RPC, require
   `err === null`, parse the inner SPL transfer, and require
   `mint === our mint`, `destination === merchant ATA`, `amount >= price`,
   `authority === the session wallet`, plus our ledger's reference;
2. the merchant eATA balance delta for that signature (`pre/postTokenBalances`
   or the same balance read used above).

The existing `ai_payment_intents` table already stores the reference and a
`UNIQUE` signature; the paid transition stays a conditional SQL update, so a
replayed or concurrent settle cannot double-charge.

**F — `POST /v1/spl/withdraw`** `{owner: merchant, mint, amount, cluster:"devnet"}`
moves the balance out of the Global Vault back to a base-layer ATA
(`idempotent: true` = shuttle flow, which does not need a separate undelegate).
Optional for the demo, required for real cash-out.

### 2.3 What `initialize-mint` is, precisely

- **What it does:** builds an unsigned base-layer transaction that creates and
  delegates a **validator-scoped transfer queue** for one mint, plus a rent PDA.
  For this mint on `devnet-as` the queue is `4af3xC…`; on `devnet-us` it is
  `JE7CLL…`.
- **Who pays:** the `payer` named in the request — us. **Measured 0.18953 SOL**
  including rent and fees.
- **What permissions it grants:** none over the mint. It is not a mint
  authority, does not mint, burn, freeze or thaw anything, and cannot move any
  user's tokens. It only creates program-owned queue accounts and delegates
  them to the chosen validator.
- **What it does not do:** it is not a deposit, does not create an eATA, does not
  touch balances, and does not initialize another validator.
- **Reversibility:** the accounts persist on Devnet; rent recovery is not
  documented. Treat the 0.19 SOL as spent on devnet.
- **One-time:** yes, per mint × validator. `is-mint-initialized` is the check.
  `initIfMissing` on deposit/transfer initializes an **eATA**, not the queue —
  the docs call this out explicitly.

**Important distinction, stated explicitly:** an ordinary public SPL transfer
sent *through* a MagicBlock endpoint is **not** ER payment. It is ER payment only
when the payer's balance is an eATA **delegated to that validator** and the
signed transaction is executed **on the ephemeral rollup** (`sendTo:
"ephemeral"`). Flow C meets both conditions; the current P3 fallback does not,
and this document does not claim it does.

### 2.4 What this costs the player, and why it matters

| Item | Cost | Paid by |
| --- | --- | --- |
| `initialize-mint` (once, per mint × validator) | **0.18953 SOL** (measured) | us |
| First `deposit` (creates Global Vault + eATA) | **0.01444 SOL** (measured) | player |
| Later `deposit` | less (vault already exists); unmeasured | player |
| ER payment transfer | **0.00000 SOL, 0 tokens** (measured build) | player |
| Optional merchant `withdraw` | base fee + rent for destination ATA | merchant |

The purchase itself is free; the **onboarding** costs the player ~0.0144 SOL of
devnet SOL. The quest currently pays players in tUSDC and hands out no SOL, so
this path requires a devnet-SOL faucet step for the player — real friction, and
a real difference from the current Solana Pay fallback, which needs no SOL
because the base-layer transfer fee is paid by the treasury-side flow already in
the app.

Honest comparison: the native path buys ER-speed, MagicBlock-native settlement
and a genuinely different verification story, at the cost of ~0.19 SOL once and
~0.0144 SOL per new player. Whether that is worth it for a valueless devnet
token is a product call.

### 2.5 Reuse map against `9838c02`

| Component | Reuse |
| --- | --- |
| `ai_payment_intents`, `ai_inference_charges`, `ai_credit_grants` | **unchanged** (add `settlement` and `er_slot` columns only) |
| `claimPayment`, `beginCharge`, `oweRefund`, `takeGrant`, caps, budget | **unchanged** |
| `quoteDeepInvestigation` / `settleQuote` / `runDeepInvestigation` | **unchanged** (verifier injected through `ServiceDeps`) |
| Claude adapter, prompt filtering, usage/cost accounting | **unchanged** |
| `verify.ts` (base-layer transfer parser) | replaced by an ER verifier (`erVerify.ts`) |
| `rpc.ts` `findPaymentForReference` | replaced by an ER signature/balance reader |
| UI states and copy | small copy change (deposit step + "pay on rollup") |

Because the verifier is already injected and the ledger is signature-keyed, the
native path is a **module swap**, not a rewrite: roughly 250–350 changed lines,
one new table column pair, and no change to the inference path.

---

## 3. Required authorizations (exact, before any write)

Nothing below has been executed. Each is a Devnet write or an external account
action, listed least-privilege first.

| # | Action | Who signs | Cost | What it can and cannot do | Reversible? |
| --- | --- | --- | --- | --- | --- |
| **A1** | `initialize-mint` for `61xJ…` on `devnet-as` (`MAS1Dt9…`), payer = treasury `DUony…` | treasury | **0.18953 SOL** (measured sim) | Creates the validator-scoped transfer queue + rent PDA and delegates the queue. No mint authority, no token movement, no user balance touched | Accounts persist; rent recovery undocumented |
| **A2** | Create one throwaway Devnet demo-player keypair and fund it with devnet SOL (faucet / treasury transfer) | treasury or faucet | ~0.03 SOL | Lets the demo player pay the deposit fee. Cannot touch treasury tokens beyond the transfer | Yes (devnet only) |
| **A3** | Player `deposit` of 0.20 tUSDC into the eATA (base layer) | demo player | **0.01444 SOL** (measured sim) | Moves the player's own token into the Global Vault and delegates their eATA | Withdrawable |
| **A4** | Player ER `transfer` of 0.20 tUSDC to the merchant wallet | demo player | **0** | The actual native payment; executes on the ephemeral rollup | No (that is the payment) |
| **A5** | *(optional, not requested)* Merchant registration on x402 | treasury wallet | 0 SOL | Only needed if you decide to move the reward economy to devnet USDC | Key rotation exists |
| **A6** | *(not requested)* Anything on mainnet, any new token, any merge, any deployment | — | — | — | — |

**Total devnet SOL for the full native demo: ≈0.234 SOL**, no mainnet activity,
no token issuance, no funding of any real-value asset.

If you approve, the order is A1 → A2 → A3 → A4; each step's signature is
captured and the ER signature for A4 becomes the payment evidence bound to one
question, exactly as the existing ledger expects.

If you prefer to keep the reward economy untouched **and** avoid all writes, the
current `9838c02` implementation stays the shipping fallback — this report does
not change it.

---

## 4. Correction to the earlier capability report

`docs/P3_MAGICBLOCK_NATIVE_AI_PAYMENTS.md` said the mint "must be initialized
once … before ER transfers/deposits". Measured today, that is too strong: the
`initialize-mint` requirement is real for the **transfer queue** (queue-backed
settlement and withdraw routes), while a `deposit` build **simulates
successfully without it**. The earlier document has been corrected to say this
and to point here.

---

## 5. Limits and risks of the native path

1. **Player SOL requirement** — the largest product change; the trail, hints,
   reward and free companion stay untouched and un-paywalled regardless.
2. **Transfer queue is per mint × validator** — moving validators means another
   0.19 SOL queue.
3. **Withdrawal cost and shuttle semantics** — merchant funds sit in the ER
   until withdrawn; `idempotent: true` is the shuttle flow.
4. **No final-settlement endpoint** — the docs state plainly that the API has no
   general "final settlement status" endpoint, so pending/settled/failed
   reconciliation is the application's job. The existing state machine already
   models this.
5. **Cluster program drift** — devnet runs eSPL through #161; mainnet lacks #158
   and #161. Devnet-only work is unaffected but must not be assumed portable.
6. **Undocumented rent recovery** for `initialize-mint`.
7. **Devnet resets** can wipe queue/eATA state; the demo procedure must re-run
   A1 in that case.
8. **x402 remains USDC-only**, so the two priorities cannot be merged into one
   rail for this token.

---

## 6. Status

```
MAGICBLOCK_NATIVE_PAYMENT_AUTHORIZATION_READY
```

Read-only feasibility complete; the current implementation at `9838c02` and all
78 tests are untouched; every write above waits on your explicit approval.
