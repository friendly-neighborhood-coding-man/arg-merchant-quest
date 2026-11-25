# MagicBlock support report — shuttle deposit credit never applied (devnet)

**Status: draft. Not posted anywhere.** No credentials, private keys or AI transcripts
are included; everything below is public chain data or endpoint behaviour.

## Environment

- Cluster: **devnet** (base RPC `https://api.devnet.solana.com`)
- Rollup: **`devnet-as`**, `https://devnet-as.magicblock.app`
  - `getIdentity` → `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`
  - `getHealth` → `ok`
- eSPL program: `SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2`
- Mint (test USDC, 6 decimals): `61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1`
- API used: `https://api.magicblock.app` (`/v1/spl/deposit`, `/v1/spl/transfer`,
  `/v1/spl/is-mint-initialized`, `/v1/spl/transfer-queue/ensure-crank`)
- SDK version the API documents: `@magicblock-labs/ephemeral-rollups-sdk@0.17.1`

## Accounts

| Role | Address |
| --- | --- |
| Owner A (player) | `GnMyuvhxr1p3U6oQwcfiTVR3RSNbvfE4DfEWGnsLgR68` |
| Owner A base ATA | `FZwX8oAkyVAVNnNbE88t3EdGJpmk4BHHaTH9TT2DJ2jj` |
| Owner A eATA | `DTW6qGnaz5pjAWcgLtchXke9LVPtcvXT7TAKnBo2uyKG` |
| Owner A shuttle eATA (shuttleId 1458347789) | `56Vj9pZD7TTkrRBthinWJEnL3mW6rXxoCZ8fTbskKtLB` |
| Owner A shuttle ATA state | `64QmiopFjBkSZbV1QHXTqMprXf6fXtwhNnLGQYTRaVrA` |
| Owner A shuttle wallet ATA | `EMefyTGaEVXMTLCvwCFZr8RRBxeyK4mwtXK6W3wwwpCK` |
| Owner B (merchant) | `DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N` |
| Owner B eATA | `AiPd7ZJ1geBr8abUNEhAfjqgsDvoUPWgBLexPZVzkrsr` |
| Owner B shuttle ATA state (shuttleId 1859757000) | `AQqgN4D2CYCNEE9ufAP6sRAtP94P9o2RapaddzAfnQLe` |
| Global vault | `6n4xr4gJoh5AtwXSjCd8NjYNQWWvHc4Ec2GFgVqEoUMw` |
| Global vault token account | `5nZS2KkP1B5fXDv4jjWJ58Zy6xu1u5FSvUCnHjuvezgA` |
| Rent PDA | `4RvdEGaUyChj3AketeBZoY1EotNtPveMFUXL8DVetrAp` |
| Transfer queue (per mint/validator) | `4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91` |

## Mint initialization (succeeded)

`POST /v1/spl/initialize-mint` → base tx
`3RtPpp1iVpAsXYrbYQ6DkhkUsAco77ZVz72BjjavRUT83VDt4JVEktqQm3UUizLpJk4Wmkc71B52dNrD9EzoHWCv`
(7 instructions, `rentPda` above, `transferQueue` above). `is-mint-initialized` now reports
`true` for this validator and mint.

## Deposits (both confirmed on base, both uncredited)

**Deposit 1 — 200,000 base units**
`47SnkBhJSQ1Wuy65Zd2zJh4JsWr1zXJXzAntPj7rkKhnBQewWq84Gx6naJJjN36ZcGcKMnRSuHhbgizLo8jGkDCx`

Instructions (eSPL program): `1` init vault → ATA creates → `0` init eATA → `6` permission →
`4` delegate eATA → **`24` setup+delegate shuttle+merge** (`shuttleId 1458347789`,
`amount 200000`, `validator MAS1Dt9…`). `err = null`.

**Deposit 2 — 1 base unit (probe)**
`3J6d2wZwpRcnwd2H3TVYBwd5VKx8Mci1r2qPG9EQYAUi8NpJw7Uj3KmFjk2qzBLUYRYYi2QN1gQMyBJdj1xvswun`
same shape, `shuttleId 719154766`, `amount 1`. `err = null`.

**Merchant setup deposit — 1 base unit**
`2p6u6J3qW5yV5RhBLTcJeoee66GhT6McdSyhPJyC4ZdCWbEepDfr1eSPzDitfZFLBeCfHW6xC8KV4nz4oqAeKxGX`
`shuttleId 1859757000`, `amount 1`. `err = null`.

## Expected vs actual

| Account | Expected after deposit + delegation | Actual |
| --- | --- | --- |
| Owner A eATA amount | 200,001 | **0** |
| Owner A shuttle ATA state | cleared after merge | **200000** (still pending) |
| Owner A shuttle wallet ATA | 0 after merge | 0 |
| Global vault token account | 200,002 | 200,002 |
| Owner B eATA amount | 1 | **0** |

Read on `https://devnet-as.magicblock.app` `getAccountInfo` and on base; the eATA is
delegated on both sides (base owner `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`,
rollup owner `SPLxh1…`), so the delegation itself completed.

## Rollup transfers (both rejected for lack of balance)

1. `3EXxY5WU61WzBdir6o5Nj5r6uDgzZa4t2uyserGzHNmRFp9QdBxPHoqZBn8gLmFUo6CWj4X6qMP1poJL3EqVqgER`
   → `InstructionError [0, {"Custom":1}]`, `Program log: Error: insufficient funds`
2. `38VWR7vb5XS5Rmn1AxqgX8nwdCdWQHGp5PpU8QFDsHaSmiDo4cggwQPWqYRe5ePqVxv12usummqESmzv5aYF2qac`
   → `InstructionError [1, {"Custom":1}]` — built with
   `fromBalance: "ephemeral", toBalance: "ephemeral", visibility: "public", legacy: true,
   initIfMissing: true, initAtasIfMissing: true`.

## Crank failures

```
POST https://api.magicblock.app/v1/spl/transfer-queue/ensure-crank
{"mint":"61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1",
 "cluster":"devnet","validator":"MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"}
```

- `HTTP 502` `{"error":{"code":"RPC_ERROR","message":"Failed to ensure transfer queue crank",
  "details":{"transferQueue":"4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91",
  "message":"Signature 2KiXMVhmJ9H6WSpMTXahvJbULwxFzforykvhfHkVkGsKNmxePjn6UETHxWjPhdjvw53Sr3qAbtdtt8cN3WF5LJiY has expired: block height exceeded."}}}`
- Retried minutes later: `HTTP 502`, same message with
  `Signature 3vnxgUqFdcGJDQaxXaVzJ13SFJZgtALidUQXN7grWZHw7X69ErLPVEaRPS6f9uH2zHXKdXU61r1YXUXwgsHazNco`.

The stored crank transaction carries a stale blockhash, so every attempt expires before it
can land.

## What we need

1. Is the shuttle **post-delegation merge** (instruction 15 path scheduled by instruction 24)
   expected to run automatically for `shuttleId 1458347789` / `1859757000` on `devnet-as`?
2. Can the pending shuttle credits be replayed or the stale queue-crank signatures refreshed
   for `4af3xC7VfQ8xhc9DYZ2q9UT7ZqrRM6Do1wsJjf1Man91`?
3. If we may run `MergeShuttleIntoAta` (discriminator 15) ourselves from the rollup with
   accounts `[owner, DTW6q…, 56Vj9…, EMefyT…, mint, Tokenkeg…]` and `data [15]`, is that the
   supported recovery for a stuck shuttle, or is it only valid as part of the original
   post-delegation action?
4. If none of the above can credit the delegated eATA, what is the supported way to release
   the 200,002 base units held in the global vault to their owners?

## Minimal reproduction

```bash
# 1. token with an existing global vault, owner without a delegated eATA
# 2. deposit WITHOUT the idempotent flag → the API builds the shuttle variant (ix 24)
curl -sX POST https://api.magicblock.app/v1/spl/deposit -H 'content-type: application/json' \
  -d '{"owner":"<OWNER>","mint":"61xJEuc…","amount":200000,"cluster":"devnet",
       "validator":"MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
       "initIfMissing":true,"initAtasIfMissing":true,"initVaultIfMissing":true}'
# 3. sign and send to base → confirms; vault increases, shuttle state records the amount
# 4. read the owner eATA after >10 minutes:
#    base and rollup both still show amount 0
# 5. ephemeral transfer of any amount → "insufficient funds"
# 6. POST /v1/spl/transfer-queue/ensure-crank → HTTP 502 expired blockhash
```

Control: the same deposit with `"idempotent": false` cannot be used on an already-delegated
eATA — simulation fails with `InstructionError [0, InvalidAccountOwner]`
(`require!(ephemeral_ata_info.owned_by(&crate::ID)) failed, deposit_spl_tokens.rs:41`),
because on base the eATA is owned by the delegation program.
