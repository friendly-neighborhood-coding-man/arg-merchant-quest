# P3 native payment — authorised recovery attempt and outcome

Branch `feature/p3-native-payment-authorization`, based on `835b416` (diagnosis) and
`491a3da` (implementation + Devnet run). Devnet only.

**No on-chain write was made in this phase.** The authorised recovery instruction was
simulated twice against the current rollup state, failed both times, and was therefore
never sent. The stop condition "merge simulation or execution fails" was reached.

Status:

```
P3_EXTERNAL_INFRASTRUCTURE_BLOCKER_CONFIRMED
```

## 1. Authorisation received

| # | Operation | Allowed |
| --- | --- | --- |
| R1 | one owner-signed `MergeShuttleIntoAta` (`data [15]`) on `devnet-as` | yes |
| A4 | one 0.20 tUSDC ER payment, only after R1 verified | conditional |
| — | one Claude Opus 5.5 inference after payment verification | conditional |
| — | additional SOL | **0** |
| — | Anthropic spend | ≤ $0.05 |
| — | deposits, mint init, validator change, wallet funding, withdrawals, new accounts | **no** |

## 2. Fresh reconciliation (read-only, this run)

| Account | Address | base | rollup | owners |
| --- | --- | --- | --- | --- |
| Global vault ATA | `5nZS2KkP…` | 200002 | 0 | Tokenkeg / Tokenkeg |
| Player canonical ATA | `FZwX8oAk…` | 799999 | 1 | Tokenkeg / Tokenkeg |
| Player owner eATA | `DTW6qGna…` | **0** | **0** | DELEGG… (delegated) / SPLxh1… |
| Shuttle metadata PDA | `56Vj9pZD…` | 72 B | 72 B | SPLxh1 / SPLxh1 |
| Shuttle eATA (`shuttleId 1458347789`) | `64QmiopF…` | **200000** | **200000** | SPLxh1 / SPLxh1 |
| Shuttle wallet ATA | `EMefyTGa…` | **0** | **0** | Tokenkeg / Tokenkeg |

Nothing changed since `835b416`: the vault still holds all 200,002 base units, and the
player's owner eATA is still zero.

## 3. Account roles — verified, and one correction to the diagnosis

Decoding the accounts (not guessing from names) fixes an inversion in the earlier
diagnosis:

- `56Vj9…` is **72 bytes**, field 0 = player `GnMyuv…`, field 1 = rent PDA `4RvdEGa…`,
  `u32@64 = 1458347789`. That is the **`ShuttleMetadata` PDA**.
- `64Qmio…` is **80 bytes**, field 0 = `56Vj9…`, field 1 = the mint, `u64@64 = 200000`.
  That is the **shuttle's ephemeral ATA** — the staged credit.
- `EMefy…` is **165 bytes**, Tokenkeg, amount **0**. That is the **shuttle wallet ATA**.

So the 200,000 is credited to the *shuttle* eATA, and the shuttle *wallet* ATA — the
account `MergeShuttleIntoAta` actually debits — is empty.

Canonical shapes, from the SDK builders `mergeShuttleIntoAtaIx` (data `[15]`) and the
program source `merge_shuttle_into_ephemeral_ata.rs`:

```
ix 15 MergeShuttleIntoEphemeralAta
  0 owner               signer
  1 destinationToken    SPL token account, must be owned by the token program
  2 shuttle             ShuttleMetadata PDA, must be owned by SPLxh1
  3 shuttleWalletAta    writable, token-program owned, must be delegated on the ER
  4 mint
  5 token program
```

## 4. Simulation results (exact instruction, exact accounts, nothing sent)

Both legal mappings of the authorised instruction were simulated signed by the owner
against `https://devnet-as.magicblock.app`:

### 4a. Destination = owner eATA `DTW6q…`

```
err {"InstructionError":[0,"InvalidAccountOwner"]}
Program log: require!(destination_token_info.owned_by(token_program_info.address())) failed,
             merge_shuttle_into_ephemeral_ata.rs:61
Program SPLxh1… consumed 938 of 200000 compute units
Program SPLxh1… failed: Invalid account owner
```

The merge can only pay a token-program-owned token account. The eATA on the rollup is
owned by the eSPL program, so it is not a legal merge destination.

### 4b. Destination = player canonical ATA `FZwX8…` (the only legal destination)

```
err "InvalidWritableAccount"
Program SPLxh1… success
Immutable account EMefyTGaEVXMTLCvwCFZr8RRBxeyK4mwtXK6W3wwwpCK has been modified
```

`EMefy…` is read-only on the rollup: the shuttle wallet ATA was never delegated, and it
holds zero tokens. The instruction body returns early on an empty source, so even a
"successful" send would be a no-op that changes nothing.

### 4c. For completeness: the shuttle close/undelegate route

`undelegateAndCloseShuttleEphemeralAtaIx` (data `[14]`) was also simulated read-only:

| Endpoint | Result |
| --- | --- |
| base | `{"InstructionError":[0,"UnsupportedProgramId"]}` |
| rollup | `{"InstructionError":[0,"ReadonlyDataModified"]}` — `ScheduleCommit ERR: account EMefy… is required to be writable and delegated in order to be undelegated` |

Both confirm the same fact from a second direction: the shuttle wallet ATA is not a
delegated ER account, so neither the merge nor the undelegate-close path can move a
balance through it.

## 5. Why the deposit stalled, stated precisely

The hosted builder (`POST /v1/spl/deposit` without `idempotent`) emitted instruction 24
`SetupAndDelegateShuttleEphemeralAtaWithMerge`. That instruction:

1. moved 200,000 base units from the player ATA into the mint's global vault;
2. created the shuttle metadata (id 1458347789), the **shuttle eATA** and the shuttle
   **wallet ATA**;
3. credited the **shuttle eATA** with 200,000;
4. delegated the owner's eATA (`DTW6q…`), whose amount stayed 0;
5. left the shuttle wallet ATA empty and **undelegated**;
6. relied on a post-delegation merge (`[15]`) to move tokens from the shuttle wallet ATA
   into the destination.

Step 6 needs a funded, delegated source account. Neither condition holds, so the merge can
never succeed — and because the owner eATA is delegated, the base-layer credit is also
impossible (`deposit_spl_tokens.rs:41`, `InvalidAccountOwner`, reproduced in `835b416`).

The tokens are not lost: **200,002 base units are intact in the global vault token account
`5nZS2KkP…`**, fully backed, and the player's 200,000 is still recorded in the shuttle eATA
`64Qmio…`. But no key we hold can move that record: `MergeShuttleIntoAta` debits a
different account, `WithdrawSplTokens` would have to be signed by the shuttle metadata PDA,
and `deposit_spl_tokens` refuses a delegated eATA.

## 6. Double-credit check

The credit cannot be counted twice:

- `64Qmio…` still shows 200000, so nothing has been credited anywhere else.
- The player's owner eATA and canonical ATA are 0 and 1 respectively; the only "1" is the
  earlier probe's change, not this deposit.
- The vault holds exactly 200,002 = 200,001 (player) + 1 (merchant setup), unchanged since
  the deposit; the 1-base-unit probe's tokens are also in the vault.
- No merge executed, so no second credit path has fired. If MagicBlock later credits the
  owner eATA, the correct check before spending is "owner eATA = 200,000 **and** shuttle
  eATA = 0 / closed"; a state where both are non-zero must be treated as double-counted and
  the payment refused.

## 7. Effects on the rest of the sequence

| Step | Outcome |
| --- | --- |
| R1 merge | **not executed** — simulation failed twice, nothing sent |
| A4 0.20 tUSDC ER payment | **not attempted** — precondition (funded owner eATA) not met |
| Claude Opus 5.5 inference | **not attempted** — no verified payment |
| Additional SOL | **0 spent**; treasury still 0.23204 SOL |
| Anthropic spend | **$0.00** of the $0.05 allowance |

Stop conditions hit: *merge simulation fails*; *account ownership/balance differs from
expectations* (the balance is on the shuttle eATA, not the owner eATA); *payment cannot be
bound to a verified balance*.

## 8. Replay protection

No charge occurred, so no on-chain replay was possible. The guards themselves are
unchanged and covered by the suite: one rollup signature settles at most one quote
(`UNIQUE` on the signature) and one quote runs at most one inference (`UNIQUE` on
`intent_id`); `er_attach` re-reads the stored signature from the rollup instead of trusting
a client claim; a non-demo payer is refused. `npm test` → **98/98 pass**.

## 9. What would unblock it (all external to this repo)

1. MagicBlock refreshes or re-executes the pending shuttle post-delegation action for
   `shuttleId 1458347789` on `devnet-as`, crediting the owner eATA `DTW6q…` by 200,000.
2. Or MagicBlock confirms a supported instruction/endpoint that settles the shuttle eATA
   `64Qmio…` back to the owner (the internal `undelegateWithdrawAndCloseShuttleEphemeralAta`
   path) — ours cannot reach it because `EMefy…` was never delegated.
3. Or the stuck queue crank for `4af3xC7…` is refreshed (the `ensure-crank` 502 with an
   expired blockhash).

The support report is updated and ready at `docs/P3_MAGICBLOCK_SUPPORT_REPORT.md`. It is
**not posted**.

## 10. Reproduce this phase

```bash
node scripts/p3/recover-native.mjs   # reconcile + both simulations, refuses to send, exit 1
```

It writes `.data/p3/recovery-attempt.json` (gitignored) with the two simulation receipts
and never submits a transaction.

## 11. Production mobile payment UI — checked

Earlier attempts failed because they requested `/play`, which does not exist (404); the
player route is `/quests/<slug>/play`, and it redirects unless the session cookie has a
claim. Verified in the cloud browser at **390 × 844** on the running production build
(`npm start`, `ARG_AI_MODEL=claude-opus-5-5`, demo payer key):

![Mobile payment panel](artifacts/p3-mobile-payment-panel.png)

What renders, with no overflow or clipping:

- **DEEP INVESTIGATION** with the price `0.200000 tUSDC`
- the honest balance state, `Balance — claim your reward first` (this browser session has
  no linked wallet, and no new claim was made)
- `Rollup payments ready · validator MAS1Dt9q… · payer GnMyuv…`
- the quote button, and the disclosure that the tokens are valueless Devnet test tokens and
  Anthropic does not accept crypto

Not reached: the post-quote `Pay … on MagicBlock` button and the labelled Solana Pay
fallback, because a quote needs a wallet with a balance and this session has none. The
block above is the pre-quote state; the live payment was not exercised (the balance is
not funded — see §5).

During this check the previously running server was stale against the fresh `.next` build
(one JS chunk returned 500 and the page rendered blank); after restarting it the page
rendered normally. Recorded here so the earlier "blank /play page" observation is not
mistaken for an application bug.
