# P3 — native eSPL implementation and authorized Devnet run: actual results

Branch `feature/p3-native-payment-authorization`, commit on top of `950eff9`.
Devnet only. No Mainnet activity, no new token, no merge, no deployment.

**Outcome in one line:** the native payment path is implemented and regression
tested (98 tests), the approved Devnet writes A1–A3 executed successfully, but
the rollup payment (A4) **did not succeed**. The deposit moved the player's
tokens into the mint's Global Vault, yet the rollup never credited the player's
ephemeral balance, so both rollup transfers failed on chain with SPL
`insufficient funds`. No Claude inference was purchased with tokens, and the
`MAGICBLOCK_NATIVE_INTELLIGENCE_ECONOMY_VERIFIED` status is **withheld** because
the defining event — a successful native payment — did not happen.

---

## 1. What was built

| Piece | File | Purpose |
| --- | --- | --- |
| Rollup fact parser | `src/lib/ai-payments/er/verify.ts` | Turns `getTransaction (jsonParsed)` into memo / SPL transfers / recipient delta |
| Pure verifier | same | Requires success, one transfer of our mint to the quoted ATA, authority = quoted payer, memo = `arg-ai:<intentId>`, amount ≥ price, recipient delta ≥ price |
| Hosted API client | `src/lib/ai-payments/er/client.ts` | `is-mint-initialized`, `balance`, `deposit`, `transfer`, signing (legacy + v0), submit-and-poll, ER `getIdentity`, ER `getTransaction` |
| Execution | `src/lib/ai-payments/er/pay.ts` | Deposit only when the payer has no delegated balance, recipient check, rollup transfer, verify before reporting |
| Ledger | `src/lib/ai-payments/store.ts` | Additive migration: `settlement`, `deposit_signature`, `validator`, `er_endpoint`, four balance columns; `recordNativeSubmission` with UNIQUE-signature replay protection |
| Service | `src/lib/ai-payments/service.ts` | `quote (settlement: er|base)`, `prepareNativeQuote`, `attachNativeSubmission`, `settleNativeQuote`; payer must equal the wallet that claimed the reward |
| Route | `src/app/api/quests/[slug]/ai/route.ts` | `quote`, `er_prepare`, `er_attach`, `settle_er`, `settle` (base fallback), `investigate` |
| UI | `src/components/companion-panel.tsx` | "Pay … on MagicBlock" primary action, real signature lines, ER-not-L1 notice, Solana Pay shown only as a labelled fallback |
| Tests | `tests/ai-native-payments.test.ts` | 20 tests: parsing, nine verification refusals, uninitialized mint, no demo wallet, receiver not delegated, prepare→verify→one inference, replay, underpayment, mint mismatch |

Reused unchanged: quote/TTL/pending caps, daily session and USD caps, the
`ai_payment_intents` / `ai_inference_charges` / `ai_credit_grants` ledger,
idempotent charge, refund-credit-on-failure, and the Claude Opus 5.5 adapter.

Checks: `npm run typecheck` 0, `npm test` **98/98 pass**, `npm run build` clean.
Mobile: the campaign page renders correctly at 390 × 844
(`artifacts/p3-mobile-panel.png`); the rollup payment block was not captured in a
mobile screenshot because the cloud browser repeatedly failed to load the
`/play` route — that part is **unverified in a browser**.

---

## 2. What actually executed on Devnet

Treasury `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N`,
demo rollup wallet `GnMyuvhxr1p3U6oQwcfiTVR3RSNbvfE4DfEWGnsLgR68`,
validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` (devnet-as),
mint `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1` (tUSDC, 6 dp).

| Step | Signature | Confirmation | Note |
| --- | --- | --- | --- |
| A1 `initialize-mint` | `3RtPpp1iVpAsXYrbYQ6DkhkUsAco77ZVz72BjjavRUT83VDt4JVEktqQm3UUizLpJk4Wmkc71B52dNrD9EzoHWCv` | base, confirmed | 7 ix, queue `4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91`, rent PDA `4RvdEGaUyChj3AketeBZoY1EotNtPveMFUXL8DVetrAp`; `is-mint-initialized` now `true` |
| A2 fund demo wallet | `2g7wAaTkdrfPSy1C83NQYbGabTqVZPCTK8sBnUCgXypekqCnq4e6fyVwhcNy8iDNF63WNZXGmEKiNmiWg4MYGxnK` | base, confirmed | 0.02 SOL |
| A3 completion counter | create `ZwvbMrariVCtm64KH1F8F2qXWmmi1SS4mDR6qReCQStcdg3mbPEGLPT75k9dB18HVdk8YtaoZxx9qmekXrdFF5T`, delegate `36QUh9xJ2PuSD3BMzoJt1aR8meWd45BuJxAnoh3R6avDSc6hRbVwhBd11Hmt2v82AQAmv71TdNJ7yUHt3PcTpWxZ`, increment `51hJRvA99FrNQstsPX2vTnaAotdJZFiNRnbfnXmuVRpurCTibu4Pcc9kqDvdtmVb3ADG3BFQi35FgS1E4cDDvQgk`, commit `4TLuTkV2faCWo5x5WT2cKhjFvZgYzEY8uFhBCjWY1wksJf35nHcbyLeMjdEQ6z8wh9aa8i9y6zd1njEEqQNFRJvb` | create/delegate **base**; increment **ER**; value 1 read on the rollup and **committed** to base (`committedValue 1`) | isolated fixture campaign `p3-native-payment-fixture`, counter `CgcHSnGqEEUwBDTrWz2xwY2PzCEbWXfuoi5TWLgkpjDx`; the Ninth Cup counters were untouched |
| A3 reward claim | `67NUdHf9LxsEXyMQsCd11vZuaXPZsmGNTrmHsPXnzEaYcT9TVYwfSfbNpVB67UDtWF9tVo2kuPA1q79eFyGGbmdE` | base, confirmed | 1.00 tUSDC (1 000 000 base units), recipient balance 0 → 1 000 000 |
| A4 recipient setup (merchant eATA) | `2p6u6J3qW5yV5RhBLTcJeoee66GhT6McdSyhPJyC4ZdCWbEepDfr1eSPzDitfZFLBeCfHW6xC8KV4nz4oqAeKxGX` | base, confirmed | 1 base unit deposited, 0.01091 SOL; `delegation.status = delegated` |
| A4 player deposit | confirmed (tx landed; the client misread the RPC's preflight response) | base, confirmed | 0.20 tUSDC left the player's ATA into the Global Vault; eATA `DTW6qGnaz5pjAWcgLtchXke9LVPtcvXT7TAKnBo2uyKG` delegated |
| A4 rollup transfer #1 | `3EXxY5WU61WzBdir6o5Nj5r6uDgzZa4t2uyserGzHNmRFp9QdBxPHoqZBn8gLmFUo6CWj4X6qMP1poJL3EqVqgER` | **failed on the ER** | `InstructionError [0, Custom 1]`, log: `Program log: Error: insufficient funds` — the builder emitted a plain SPL transfer from the (zeroed) base ATA |
| A4 rollup transfer #2 (correct eSPL route) | `38VWR7vb5XS5Rmn1AxqgX8nwdCdWQHGp5PpU8QFDsHaSmiDo4cggwQPWqYRe5ePqVxv12usummqESmzv5aYF2qac` | **failed on the ER** | `InstructionError [1, Custom 1]` — with `initIfMissing` the request becomes a real eSPL program transfer, and the program still sees no spendable balance |

Confirmation layers, kept distinct: every signature above marked "base" is
base-layer confirmation; the counter increment is **ER confirmation only**; the
counter's commit signature is a **base-layer commit** of that ER state; **no L1
finality was claimed for any token payment**, because none succeeded.

---

## 3. The failure, precisely

1. `POST /v1/spl/deposit` confirmed on the base layer: 0.20 tUSDC left the
   player's ATA and the mint's Global Vault token account
   (`5nZS2KkP1B5fXDv4jjWJ58Zy6xu1u5FSvUCnHjuvezgA`, 233 bytes on the rollup)
   received it.
2. The rollup's own account for the player stayed at **0**: the base ATA clone
   (`FZwX8oAkyVAVNnNbE88t3EdGJpmk4BHHaTH9TT2DJ2jj`) reads `amount = 0`, and the
   eSPL record (`DTW6q…`, 80 bytes, owner `SPLxh1…`) also reads 0 at the amount
   offset. The delegation status returned by the API says `delegated`.
3. Both transfer variants therefore fail inside the token program with
   `insufficient funds`. The deposit's credit step never became spendable.
4. `POST /v1/spl/transfer-queue/ensure-crank` — the official remedy for queue
   state — returned **HTTP 502** twice:
   `Failed to ensure transfer queue crank … Signature … has expired: block height exceeded`.
   That is a server-side MagicBlock failure on this devnet validator/queue, not a
   local transaction error.

This is a genuine integration failure of the hosted deposit → rollup-spend path
with this mint on `devnet-as`, and it is reported as failed rather than papered
over. Per project rules, no payment is described as having happened.

---

## 4. Cost (approved cap: 0.25 SOL)

| Item | SOL |
| --- | --- |
| A1 initialize-mint (simulated 0.189534520, actual ≈ same) | 0.18953 |
| A2 demo wallet funding (executed twice: the first run funded it, a later run topped it up because the balance check ran after the deposit had spent most of it) | 0.04000 |
| A4 recipient setup (measured 0.010912160) | 0.01091 |
| Player deposit + 1-unit probe (measured 0.003005 per deposit) | 0.00601 |
| **Treasury spent, measured** (0.47848 → 0.23204) | **0.24644** |
| Rollup transfers (2 attempts, both failed) | 0.00000 |

**0.24644 of 0.25 SOL used — the run stopped there.** Anthropic spend: **$0.00**,
because no paid inference was reached.

Recoverable state: the player's 200 001 base units sit in the mint's Global Vault
and can be withdrawn with `POST /v1/spl/withdraw` (owner = the demo wallet) if a
future approval covers the base-layer fee. The mint's transfer queue for
`devnet-as` is initialized and stays initialized.

---

## 5. Security boundaries (implemented and tested)

- The server verifies the rollup transaction it recorded; a client-supplied
  signature is only *attached* and then verified (`er_attach` + `settle_er`), and
  an attached transaction that fails any rule is refused (proven on chain with a
  1-base-unit transfer, unit-tested for the refusal path).
- One rollup signature settles at most one quote (`UNIQUE`), and one quote runs at
  most one inference (`UNIQUE intent_id`).
- The quote includes the question hash; the memo binds the payment to that quote.
- The payer must be the wallet that claimed the reward; the demo wallet cannot
  pay another session's quote.
- Inference never starts from `er_prepare`; only `settle_er` (or the base-layer
  `settle`) can mark a quote paid.
- No key is printed or committed; the demo wallet and treasury live in
  `.data/wallets/` (gitignored). The composer script refuses to run above the cap.
- A recipient without a delegated balance now returns `receiver_not_delegated`
  instead of signing a deposit it has no authority over.

---

## 6. Remaining limitations

1. **No successful native payment.** The rollup balance never becomes spendable
   through the hosted deposit for this mint; the queue crank is failing
   server-side.
2. **No paid inference** was demonstrated; the $2 Anthropic allowance is unspent.
3. **Browser check incomplete**: the payment block was not visually verified on
   mobile; only the campaign page was.
4. The player's tokens are parked in the Global Vault until withdrawn.
5. The base-layer Solana Pay path remains the working fallback and is labelled as
   such in the UI; it is not an ER payment and is never described as one.

## 7. What a next attempt needs

A fresh, small authorization (≈0.03 SOL) to try, in order:

1. a deposit built by the SDK (`delegateSpl` from
   `@magicblock-labs/ephemeral-rollups-sdk`) instead of the hosted endpoint, then
   read the eATA before transferring;
2. if the eATA still reads 0, the same flow on `devnet-private` (TEE), where
   `private-balance` exposes the credited balance and the docs' auth path is
   required;
3. a support question to MagicBlock with the two failing signatures, the deposit
   signature and the 502 crank error — the queue for this mint on `devnet-as`
   looks stuck.

Status of this phase:

```
P3_NATIVE_PAYMENT_IMPLEMENTED_ROLLUP_DEPOSIT_BLOCKED
```
