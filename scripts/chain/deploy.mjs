#!/usr/bin/env node
/**
 * Deploy the completion-counter program to Solana Devnet with paced writes.
 *
 * The public devnet RPC throttles the write transactions that `solana program
 * deploy` fires in a burst, so this script writes the buffer one instruction at
 * a time and retries with the same instruction on failure.
 *
 *   node scripts/chain/deploy.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const ROOT = process.cwd();
const DATA = process.env.ARG_DATA_DIR ?? path.join(ROOT, ".data");
const CHAIN = path.join(DATA, "chain");
const WALLETS = path.join(DATA, "wallets");
const RPC = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const CHUNK = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => console.log(`[deploy] ${message}`);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

const connection = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(readJson(path.join(WALLETS, "treasury.json"))),
);

function loadProgramKeypair() {
  const file = path.join(CHAIN, "program-keypair.json");
  let secret = readJson(file);
  if (!secret) {
    secret = Array.from(Keypair.generate().secretKey);
    fs.writeFileSync(file, JSON.stringify(secret));
  }
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function sendWithRetry(instructions, signers, label, attempts = 6) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction().add(...instructions);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = blockhash;
      transaction.sign(...signers);
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 5,
      });
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (confirmation.value.err) throw new Error(JSON.stringify(confirmation.value.err));
      log(`${label} ok (${signature.slice(0, 16)}…)`);
      return signature;
    } catch (error) {
      lastError = error;
      log(`${label} attempt ${attempt} failed: ${error.message?.split("\n")[0]}`);
      await sleep(1200 * attempt);
    }
  }
  throw new Error(`${label} failed after retries: ${lastError?.message}`);
}

async function createBuffer(buffer, size, lamports) {
  const instruction = new TransactionInstruction({
    programId: LOADER,
    keys: [
      { pubkey: buffer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    // bincode encodes the enum variant as a little-endian u32.
    data: Buffer.from([0, 0, 0, 0]),
  });
  return sendWithRetry(
    [
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: buffer.publicKey,
        lamports,
        space: size,
        programId: LOADER,
      }),
      instruction,
    ],
    [payer, buffer],
    "create buffer",
  );
}

async function writeChunk(buffer, chunk, offset) {
  // bincode: variant u32, offset u32, Vec<u8> (u64 length) then the bytes.
  const data = Buffer.alloc(16 + chunk.length);
  data.writeUInt32LE(1, 0);
  data.writeUInt32LE(offset, 4);
  data.writeBigUInt64LE(BigInt(chunk.length), 8);
  chunk.copy(data, 16);
  const instruction = new TransactionInstruction({
    programId: LOADER,
    keys: [
      { pubkey: buffer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
  return sendWithRetry([instruction], [payer, buffer], `write @${offset}`);
}

async function main() {
  let programKey = loadProgramKeypair();
  const soPath = path.join(CHAIN, "completion_counter.so");
  const bytes = fs.readFileSync(soPath);

  // A half-finished earlier deploy can leave a non-executable program account
  // behind. That address cannot be reused, so move to a fresh program key.
  const preexisting = await connection.getAccountInfo(programKey.publicKey);
  if (preexisting && !preexisting.executable) {
    programKey = Keypair.generate();
    fs.writeFileSync(
      path.join(CHAIN, "program-keypair.json"),
      JSON.stringify(Array.from(programKey.secretKey)),
    );
    log(`previous program address was left half-deployed; using ${programKey.publicKey.toBase58()}`);
  }

  const programId = programKey.publicKey;
  const programData = PublicKey.findProgramAddressSync([programId.toBuffer()], LOADER)[0];
  const existing = await connection.getAccountInfo(programId);
  if (existing?.executable) {
    writeJson(path.join(CHAIN, "program.json"), {
      programId: programId.toBase58(),
      executable: true,
      deployedAt: readJson(path.join(CHAIN, "program.json"))?.deployedAt ?? null,
    });
    log(`program already deployed: ${programId.toBase58()}`);
    return;
  }

  const balance = await connection.getBalance(payer.publicKey);
  log(`payer ${payer.publicKey.toBase58()} has ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  if (balance < 0.6 * LAMPORTS_PER_SOL) {
    throw new Error("The treasury needs at least 0.6 SOL to deploy the program.");
  }

  // The buffer keypair and the written offset are persisted so an interrupted
  // deploy resumes instead of re-uploading everything on a throttled RPC.
  const bufferFile = path.join(CHAIN, "buffer.json");
  let bufferState = readJson(bufferFile);
  if (!bufferState || bufferState.bytes !== bytes.length) {
    bufferState = {
      secretKey: Array.from(Keypair.generate().secretKey),
      bytes: bytes.length,
      offset: 0,
    };
    writeJson(bufferFile, bufferState);
  }
  const buffer = Keypair.fromSecretKey(Uint8Array.from(bufferState.secretKey));

  // The loader wants headroom in the buffer account for its own bookkeeping,
  // so reserve a little more than the program length.
  const bufferSize = bytes.length + 1024;
  let offset = bufferState.offset;
  if (offset === 0) {
    const bufferLamports = await connection.getMinimumBalanceForRentExemption(bufferSize);
    await createBuffer(buffer, bufferSize, bufferLamports);
  } else {
    const bufferAccount = await connection.getAccountInfo(buffer.publicKey);
    if (!bufferAccount) {
      offset = 0;
      bufferState.offset = 0;
      writeJson(bufferFile, bufferState);
      const bufferLamports = await connection.getMinimumBalanceForRentExemption(bufferSize);
      await createBuffer(buffer, bufferSize, bufferLamports);
    } else {
      log(`resuming buffer ${buffer.publicKey.toBase58()} at byte ${offset}`);
    }
  }

  while (offset < bytes.length) {
    const chunk = bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length));
    await writeChunk(buffer, chunk, offset);
    offset += chunk.length;
    bufferState.offset = offset;
    writeJson(bufferFile, bufferState);
    await sleep(350);
  }

  const programLamports = await connection.getMinimumBalanceForRentExemption(36);
  const programAccount = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: programId,
    lamports: programLamports,
    space: 36,
    programId: LOADER,
  });

  // The loader requires max_data_len to be at least the buffer's data length.
  const deployData = Buffer.alloc(12);
  deployData.writeUInt32LE(2, 0);
  deployData.writeBigUInt64LE(BigInt(bufferSize), 4);
  const deployInstruction = new TransactionInstruction({
    programId: LOADER,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: programData, isSigner: false, isWritable: true },
      { pubkey: programId, isSigner: true, isWritable: true },
      { pubkey: buffer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    data: deployData,
  });

  // A separate transaction per instruction keeps each packet small.
  if (!(await connection.getAccountInfo(programId))) {
    await sendWithRetry([programAccount], [payer, programKey], "create program account");
  }
  await sendWithRetry([deployInstruction], [payer, programKey, buffer], "deploy program");
  fs.rmSync(bufferFile, { force: true });

  const deployed = await connection.getAccountInfo(programId);
  if (!deployed?.executable) throw new Error("The program account is not executable after deploy.");
  writeJson(path.join(CHAIN, "program.json"), {
    programId: programId.toBase58(),
    programData: programData.toBase58(),
    executable: true,
    bytes: bytes.length,
    deployedAt: new Date().toISOString(),
  });
  log(`deployed ${programId.toBase58()} (program data ${programData.toBase58()})`);
  log(`explorer: https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`);
}

main().catch((error) => {
  console.error(`[deploy] ${error.message}`);
  process.exit(1);
});
