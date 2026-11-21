import { createHash } from "node:crypto";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  ER_RPC_URL,
  ER_VALIDATOR,
  counterProgramId,
  treasuryKeypair,
} from "./config";
import { baseConnection, ephemeralConnection, getDelegationStatus } from "./connections";

/**
 * Campaign completion counter on MagicBlock Ephemeral Rollups.
 *
 * The counter is a PDA of our `completion-counter` program, derived from a hash
 * of the campaign id, so each campaign has its own on-chain counter. The program
 * delegates that PDA to an ER validator, the ER runs the increment when an
 * operator verifies evidence, and the client commits the state back to Solana.
 */

export const COUNTER_SEED = Buffer.from("counter");
export const INSTRUCTION_INCREMENT = 1;
export const INSTRUCTION_DELEGATE = 2;
export const INSTRUCTION_CREATE = 3;
export const INSTRUCTION_COMMIT = 4;

export interface CounterAddresses {
  counter: PublicKey;
  counterBump: number;
  buffer: PublicKey;
  bufferBump: number;
  record: PublicKey;
  metadata: PublicKey;
  seed: Buffer;
}

export function campaignSeed(campaignId: string): Buffer {
  return createHash("sha256").update(campaignId).digest();
}

export function counterAddresses(programId: PublicKey, campaignId: string): CounterAddresses {
  const seed = campaignSeed(campaignId);
  const [counter, counterBump] = PublicKey.findProgramAddressSync(
    [COUNTER_SEED, seed],
    programId,
  );
  const [buffer, bufferBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), counter.toBuffer()],
    programId,
  );
  return {
    counter,
    counterBump,
    buffer,
    bufferBump,
    record: delegationRecordPdaFromDelegatedAccount(counter),
    metadata: delegationMetadataPdaFromDelegatedAccount(counter),
    seed,
  };
}

export interface ChainEvidence {
  counterAccount: string;
  createSignature: string | null;
  delegateSignature: string | null;
  incrementSignature: string;
  commitSignature: string | null;
  counterValue: number | null;
  committedValue: number | null;
  erEndpoint: string;
  erValidator: string;
  programId: string;
  delegatedAt: string | null;
  updatedAt: string;
  error: string | null;
}

function readCounter(data: Buffer | Uint8Array | null | undefined): number | null {
  if (!data || data.length < 8) return null;
  const value = Buffer.from(data.subarray(0, 8)).readBigUInt64LE(0);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}

function createInstruction(
  programId: PublicKey,
  addresses: CounterAddresses,
  payer: PublicKey,
): TransactionInstruction {
  const data = Buffer.concat([
    Buffer.from([INSTRUCTION_CREATE, addresses.seed.length]),
    addresses.seed,
    Buffer.from([addresses.counterBump]),
  ]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: addresses.counter, isSigner: false, isWritable: true },
      { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Schedules an ER commit through our program's intent builder. */
function commitInstruction(
  programId: PublicKey,
  counter: PublicKey,
  payer: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: counter, isSigner: false, isWritable: true },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([INSTRUCTION_COMMIT]),
  });
}

function delegateInstruction(
  programId: PublicKey,
  addresses: CounterAddresses,
  payer: PublicKey,
): TransactionInstruction {
  const data = Buffer.concat([
    Buffer.from([INSTRUCTION_DELEGATE, addresses.seed.length]),
    addresses.seed,
    Buffer.from([addresses.counterBump, addresses.bufferBump]),
  ]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: addresses.counter, isSigner: false, isWritable: true },
      { pubkey: addresses.buffer, isSigner: false, isWritable: true },
      { pubkey: addresses.record, isSigner: false, isWritable: true },
      { pubkey: addresses.metadata, isSigner: false, isWritable: true },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
      // The program's own account, so it can pass it to the delegation CPI.
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function counterInstruction(programId: PublicKey, counter: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [{ pubkey: counter, isSigner: false, isWritable: true }],
    data: Buffer.from([INSTRUCTION_INCREMENT]),
  });
}

/**
 * Send and confirm by polling. Ephemeral Rollup endpoints do not all expose the
 * websocket subscription that web3.js `confirmTransaction` relies on.
 */
async function send(
  connection: ReturnType<typeof baseConnection>,
  instructions: TransactionInstruction[],
  signers: Keypair[],
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = signers[0].publicKey;
  transaction.recentBlockhash = blockhash;
  transaction.sign(...signers);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: false,
    });
    if (status.value?.err) {
      throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.value.err)}`);
    }
    if (
      status.value?.confirmationStatus === "confirmed" ||
      status.value?.confirmationStatus === "finalized"
    ) {
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Transaction ${signature} was not confirmed in time.`);
}

/**
 * Record one operator-verified completion on the ER and commit it to Solana.
 * The first call for a campaign also creates and delegates the counter PDA.
 */
export async function recordVerifiedCompletion(campaignId: string): Promise<ChainEvidence> {
  const programId = counterProgramId();
  if (!programId) {
    throw new Error(
      'No completion-counter program configured. Run "npm run chain:setup" to build and deploy it to Devnet.',
    );
  }

  const treasury = treasuryKeypair();
  const base = baseConnection();
  const addresses = counterAddresses(programId, campaignId);
  const counterAccount = addresses.counter.toBase58();

  const evidence: ChainEvidence = {
    counterAccount,
    createSignature: null,
    delegateSignature: null,
    incrementSignature: "",
    commitSignature: null,
    counterValue: null,
    committedValue: null,
    erEndpoint: ER_RPC_URL,
    erValidator: ER_VALIDATOR,
    programId: programId.toBase58(),
    delegatedAt: null,
    updatedAt: new Date().toISOString(),
    error: null,
  };

  // 1. Create the campaign counter PDA when it does not exist yet.
  const existing = await base.getAccountInfo(addresses.counter);
  if (!existing) {
    evidence.createSignature = await send(
      base,
      [createInstruction(programId, addresses, treasury.publicKey)],
      [treasury],
    );
  }

  // 2. Delegate it to a MagicBlock Ephemeral Rollup (base layer).
  let status = await getDelegationStatus(counterAccount);
  if (!status.isDelegated) {
    evidence.delegateSignature = await send(
      base,
      [delegateInstruction(programId, addresses, treasury.publicKey)],
      [treasury],
    );
    evidence.delegatedAt = new Date().toISOString();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      status = await getDelegationStatus(counterAccount);
      if (status.isDelegated) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    if (!status.isDelegated) {
      throw new Error("The counter account was not delegated to an Ephemeral Rollup in time.");
    }
  }

  // 3. Increment the counter on the ER itself.
  const erEndpoint = status.fqdn ?? ER_RPC_URL;
  evidence.erEndpoint = erEndpoint;
  const er = ephemeralConnection(erEndpoint);

  evidence.incrementSignature = await send(
    er,
    [counterInstruction(programId, addresses.counter)],
    [treasury],
  );

  const erAccount = await er.getAccountInfo(addresses.counter);
  evidence.counterValue = readCounter(erAccount?.data);

  // 4. Commit the ER state back to Solana. The account stays delegated, so the
  // next verified completion is another fast ER update plus a commit.
  //    The current magic program only accepts the serialized intent-bundle
  //    format, so the commit is scheduled by our own program (instruction 4),
  //    which builds the intent with MagicBlock's SDK inside the program.
  try {
    evidence.commitSignature = await send(
      er,
      [commitInstruction(programId, addresses.counter, treasury.publicKey)],
      [treasury],
    );
  } catch (error) {
    evidence.error = `Commit failed: ${(error as Error).message}`;
    evidence.updatedAt = new Date().toISOString();
    return evidence;
  }

  // 5. Read the committed value from the base layer.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const account = await base.getAccountInfo(addresses.counter);
    const value = readCounter(account?.data);
    if (value !== null && evidence.counterValue !== null && value >= evidence.counterValue) {
      evidence.committedValue = value;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  evidence.updatedAt = new Date().toISOString();
  return evidence;
}

/** Read-only chain facts for the player's evidence panel. */
export async function readCounterState(campaignId: string): Promise<{
  counterAccount: string | null;
  erValue: number | null;
  baseValue: number | null;
  delegated: boolean;
  erEndpoint: string | null;
}> {
  const programId = counterProgramId();
  if (!programId) {
    return { counterAccount: null, erValue: null, baseValue: null, delegated: false, erEndpoint: null };
  }
  const addresses = counterAddresses(programId, campaignId);
  const counterAccount = addresses.counter.toBase58();
  const status = await getDelegationStatus(counterAccount);
  const base = baseConnection();
  const baseAccount = await base.getAccountInfo(addresses.counter);
  const erEndpoint = status.fqdn ?? ER_RPC_URL;
  let erValue: number | null = null;
  if (status.isDelegated) {
    try {
      const erAccount = await ephemeralConnection(erEndpoint).getAccountInfo(addresses.counter);
      erValue = readCounter(erAccount?.data);
    } catch {
      erValue = null;
    }
  }
  return {
    counterAccount,
    erValue,
    baseValue: readCounter(baseAccount?.data),
    delegated: status.isDelegated,
    erEndpoint: status.isDelegated ? erEndpoint : null,
  };
}
