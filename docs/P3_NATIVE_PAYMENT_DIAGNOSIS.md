# P3 native payment — root-cause diagnosis (read-only)

Commit `491a3da` preserved. No on-chain writes were made for this investigation; every
claim below comes from RPC reads, the official program/SDK source, simulations, or
transactions already recorded in the previous phase.

## 1. The canonical lifecycle (from `magicblock-labs/ephemeral-spl-token`)

Program `SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2`. Instruction discriminators are
single bytes:

| # | Instruction | Effect |
| --- | --- | --- |
| 0 | `InitializeEphemeralAta` | create the eATA PDA for `[owner, mint]` |
| 1 | `InitializeGlobalVault` | per-mint vault + its token account |
| 2 | `DepositSplTokens` | **move tokens to the vault and increase the eATA amount, in one tx** |
| 3 | `WithdrawSplTokens` | decrease eATA amount, release tokens from the vault |
| 4 | `DelegateEphemeralAta` | hand the eATA to the rollup |
| 15 | `MergeShuttleIntoAta` | move shuttle-wallet tokens into the destination |
| 24 | `SetupAndDelegateShuttleEphemeralAtaWithMerge` | stage tokens in a **shuttle** and schedule the merge |

The SDK (`@magicblock-labs/ephemeral-rollups-sdk@0.17.1`) confirms the eATA layout:

```js
// lib/instructions/ephemeral-spl-token-program/ephemeralAta.js
function decodeEphemeralAta(info) {
  const owner  = new PublicKey(info.data.subarray(0, 32));
  const mint   = new PublicKey(info.data.subarray(32, 64));
  const amount = BigInt(info.data.readBigUInt64LE(64));
}
function deriveEphemeralAta(owner, mint) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), mint.toBuffer()], SPLxh1…);
}
```

Two deposit variants exist, and which one runs changes everything:

```js
delegateSpl(owner, mint, amount, opts) {
  if (opts?.idempotent === false) return buildDelegateSplInstructions(...);   // ix 0,1,2,(6),4  — synchronous
  return buildIdempotentDelegateSplInstructions(...);                        // ix 0,6,4, then 24  — shuttle
}
```

The project's `buildDeposit` never sent `idempotent`, so the API took the **shuttle**
branch. The official docs describe its consequence: *"deposit … generate `shuttleId`
server-side"*, *"Shuttle flows combine setup, vault deposits or withdrawals, delegation,
and **post-delegation actions**. A merge moves shuttle wallet tokens into the destination
token account"*.

## 2. What our deposits actually executed

Decoded from the base-chain transactions (all confirmed, `err = null`):

| # | Instruction | Accounts | Note |
| --- | --- | --- | --- |
| 0 | `1` init vault | 8 | |
| 1–2 | ATA create | — | vault ATA + owner ATA |
| 3 | `0` init eATA | 5 | eATA `DTW6q…` |
| 4 | `6` eATA permission | 5 | |
| 5 | `4` delegate eATA | 8 | delegates to `MAS1Dt9…` |
| 6 | **`24` shuttle + merge** | 19 | `shuttleId`, `amount`, `validator` |

So the deposit tx **never contains instruction 2**. It stages the tokens and relies on a
**post-delegation merge** to credit the eATA. That merge is the step that did not happen.

## 3. Balances: where the 200,001 base units are

Read directly from base and rollup RPCs:

| Account | Address | base | rollup |
| --- | --- | --- | --- |
| Global vault ATA | `5nZS2KkP1B5fXDv4jjWJ58Zy6xu1u5FSvUCnHjuvezgA` | **200002** | 0 |
| Player base ATA | `FZwX8oAkyVAVNnNbE88t3EdGJpmk4BHHaTH9TT2DJ2jj` | 799999 | 1 |
| Player owner **eATA** | `DTW6qGnaz5pjAWcgLtchXke9LVPtcvXT7TAKnBo2uyKG` | **amount 0** | **amount 0** |
| Player shuttle eATA | `56Vj9pZD7TTkrRBthinWJEnL3mW6rXxoCZ8fTbskKtLB` | 72 B record | 72 B record |
| Player shuttle ATA (state) | `64QmiopFjBkSZbV1QHXTqMprXf6fXtwhNnLGQYTRaVrA` | **amount 200000** | amount 200000 |
| Player shuttle wallet ATA | `EMefyTGaEVXMTLCvwCFZr8RRBxeyK4mwtXK6W3wwwpCK` | 0 | 0 |
| Treasury base ATA | `7Ti2w9WrGNiXxh9dNfyashcc8DgKYZv7ADmNuYSqCtH1` | 991999999 | 0 |
| Treasury owner eATA | `AiPd7ZJ1geBr8abUNEhAfjqgsDvoUPWgBLexPZVzkrsr` | amount 0 | amount 0 |
| Treasury shuttle ATA | `AQqgN4D2CYCNEE9ufAP6sRAtP94P9o2RapaddzAfnQLe` | amount 1 | amount 1 |

Arithmetic: reward 1,000,000 − base ATA 799,999 = **200,001** left the player; the vault
holds 200,002 = 200,001 (player) + 1 (merchant setup). Nothing was minted, burned or
moved elsewhere. The shuttle state account still records the pending 200,000.

The eATA amount — the only number the transfer program debits — is **0 for both wallets**,
which is exactly why both rollup transfers failed with SPL `insufficient funds`.

## 4. Why the credit cannot be done from our side

The obvious repair is to re-run the deposit's credit instruction (2) on the base chain.
Simulated against the current state (no write):

```
deposit { idempotent: false, initIfMissing: false } →
  ix  SPLxh1:2  SPLxh1:6  SPLxh1:4
  err {"InstructionError":[0,"InvalidAccountOwner"]}
  log  Program log: require!(ephemeral_ata_info.owned_by(&crate::ID)) failed, deposit_spl_tokens.rs:41
```

The eATA on base is owned by `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` (the delegation
program, because it is delegated), so the eSPL program refuses to credit it. Only
**rollup-side execution** can increment a delegated balance — by design.

## 5. The failing automation

The post-delegation merge and the transfer queue are both driven by MagicBlock's
automation. It is failing:

```
POST https://api.magicblock.app/v1/spl/transfer-queue/ensure-crank
  {"mint":"61xJEuc…","cluster":"devnet","validator":"MAS1Dt9…"}
→ HTTP 502
  {"error":{"code":"RPC_ERROR","message":"Failed to ensure transfer queue crank",
   "details":{"transferQueue":"4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91",
   "message":"Signature 2KiXMVhm… has expired: block height exceeded."}}}
→ retried: HTTP 502, "Signature 3vnxgUqF… has expired: block height exceeded."
```

The rollup itself is healthy (`getIdentity` = `MAS1Dt9…`, `getHealth` = `ok`, blockhash
service answering), so this is a stuck scheduled-crank, not a dead validator.

## 6. Root cause, stated precisely

> The deposit used the shuttle variant (instruction 24) because `idempotent` was omitted.
> That variant only stages funds: it moved 200,001 tUSDC into the mint's global vault and
> recorded the pending 200,000 in the shuttle state account, then delegated the eATA.
> The credit — the shuttle **post-delegation merge** that raises the eATA amount — is
> executed by MagicBlock's automation and never ran; its crank endpoint returns HTTP 502
> with an expired-blockhash error. Because the eATA is delegated, the base-chain deposit
> instruction is unavailable (`InvalidAccountOwner`), so neither the client nor the base
> layer can apply the credit.

Answer to each hypothesis in the brief:

| Hypothesis | Verdict |
| --- | --- |
| Incorrect deposit / delegation instruction sequence | **Contributing.** The sequence is the shuttle one; `idempotent` was never set, so the program chose an asynchronous credit path. The individual instructions were valid and all confirmed. |
| Incorrect eATA derivation or decoding | **No.** `deriveEphemeralAta([owner,mint])` matches both wallets; the 80-byte layout is owner/mint/amount@64 and was read with the SDK's own offsets. |
| Validator mismatch | **No.** Deposits, delegation records and the rollup identity are all `MAS1Dt9…`. |
| Missing post-delegation actions | **Yes — this is the failure.** The merge is the missing post-delegation action. |
| Delayed or failed vault→eATA credit | **Yes.** Tokens are in the vault; the eATA credit is zero and has been for over an hour. |
| Transfer queue / crank infrastructure failure | **Yes, corroborating.** `ensure-crank` 502s on a stale stored signature. |

## 7. Reconciled, recoverable balance

- **Located and intact:** 200,001 tUSDC (200,000 player + 1 merchant) in the global vault
  token account `5nZS2KkP…`; the merchant's 1 unit is mirrored in its shuttle record.
- **Not recoverable today by the client.** It is claimable only through an eATA amount,
  and only a rollup-side action can set that amount. The SDK exposes no base-layer
  "credit an already-delegated eATA" path (proven by simulation).
- **Do not assume the tokens are lost either:** they sit in program-owned vault custody,
  not at a random address, and a successful merge or a MagicBlock-side replay restores
  them to the player's balance.

## 8. Smallest SDK-native recovery procedure (prepared, not executed)

One owner-signed instruction, `MergeShuttleIntoAta` (`15`), sent to the rollup:

```
program SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2, data [15]
0 owner               GnMyuvhxr1p3U6oQwcfiTVR3RSNbvfE4DfEWGnsLgR68   signer
1 destinationAta      DTW6qGnaz5pjAWcgLtchXke9LVPtcvXT7TAKnBo2uyKG   owner eATA (writable)
2 shuttleEphemeralAta 56Vj9pZD7TTkrRBthinWJEnL3mW6rXxoCZ8fTbskKtLB
3 shuttleWalletAta    EMefyTGaEVXMTLCvwCFZr8RRBxeyK4mwtXK6W3wwwpCK   writable
4 mint                61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1
5 tokenProgram        TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
```

- Cost: **0 SOL** (rollup transaction fee is 0; no account is created).
- Accounts: **no new accounts**, no delegation change, no new deposit, no token movement
  outside the program.
- Expected result: destination eATA amount 0 → 200,000; shuttle record cleared.
- Risk: if the merge requires a precondition that the missing post-delegation action would
  have established, the instruction fails and **nothing changes** (fee 0, state untouched).
- Verification afterwards: read `DTW6q…` amount on the rollup; only then run the payment.
- Script: `scripts/p3/recover-native.mjs` (dry-run by default; `--execute` additionally
  requires `--approve`), which also prints the full reconciliation table and refuses any
  deposit.

If the merge is rejected, the remaining path is MagicBlock-side replay of the pending
shuttle credit (support report below) — external, not something we can force.

## 9. Required writes for the full proof (bounded)

If the merge credits the eATA:

| Step | Writes | SOL |
| --- | --- | --- |
| R1 merge shuttle → eATA | 1 rollup instruction, owner-signed | 0.0000 |
| A4 rollup transfer 0.20 tUSDC | 1 rollup tx (eSPL transfer + memo) | 0.0000 |
| settle + verify + Claude Opus 5.5 inference | 0 chain writes | ≤ $0.05 Anthropic |

Total additional SOL: **0.0000**. That is the entire request.

If the merge is rejected and the only way forward is a fresh credit, the cheapest variant
is a new deposit against a **fresh, undelegated eATA** (the base path only works before
delegation), which needs ≈ 0.003 SOL of base fees — and would leave the 200,001 stranded in
the vault until MagicBlock replays it.
