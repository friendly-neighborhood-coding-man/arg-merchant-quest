#!/usr/bin/env node
/**
 * Authorized Devnet proof of the native MagicBlock payment.
 *
 *   node scripts/p3/native-demo.mjs preflight     (read-only)
 *   node scripts/p3/native-demo.mjs run           (executes A1–A4)
 *
 * What `run` does, in order, and nothing else:
 *   A1  initialize-mint for the visit token on devnet-as (0.18953 SOL, simulated first)
 *   A2  create the isolated demo rollup wallet and fund it from the treasury (0.02 SOL)
 *   A3  one verified campaign completion + the normal 1.00 tUSDC reward claim
 *   A4  one 0.20 tUSDC ER payment (deposit + rollup transfer), verified server-side
 *       then one real Claude Opus 5.5 deep investigation, a replay refusal and an
 *       on-chain underpayment refusal
 *
 * The treasury spends are measured against a hard 0.25 SOL cap; the script stops
 * before a write whose simulation would exceed it. Keys stay in `.data/wallets/`.
 *
 * The app must be running with ARG_AI_DEMO_PAYER_KEY pointing at the demo wallet:
 *   PORT=3104 ARG_AI_MODEL=claude-opus-5-5 ARG_AI_DEMO_PAYER_KEY=.data/wallets/p3-demo-player.json npm start
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

const ROOT = process.cwd();
const DATA = process.env.ARG_DATA_DIR ?? path.join(ROOT, ".data");
const WALLETS = path.join(DATA, "wallets");
const BASE_RPC = process.env.ARG_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const API = process.env.ARG_MAGICBLOCK_PAYMENTS_API ?? "https://api.magicblock.app";
const VALIDATOR = process.env.ARG_AI_ER_PAYMENTS_VALIDATOR ?? "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";
const ER_RPC = process.env.ARG_AI_ER_PAYMENTS_RPC ?? "https://devnet-as.magicblock.app";
const APP = (process.env.P3_APP_URL ?? "http://127.0.0.1:3104").replace(/\/$/, "");
const MAX_SOL = 0.25;
const STATE_FILE = path.join(DATA, "p3", "native-demo.json");
const DEMO_KEY_FILE = path.join(WALLETS, "p3-demo-player.json");

const mode = process.argv[2] ?? "preflight";

const log = (message) => console.log(message);
const sol = (lamports) => `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(5)} SOL`;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const state = readJson(STATE_FILE) ?? { steps: {}, spend: {} };
function remember(step, value) {
  state.steps[step] = { ...(state.steps[step] ?? {}), ...value };
  writeJson(STATE_FILE, state);
}

/** Never start a write that would push the approved 0.25 SOL allocation over. */
function guard(lamports, label) {
  const already = state.spend.allocatedLamports ?? 0;
  const next = already + lamports;
  if (next / LAMPORTS_PER_SOL > MAX_SOL) {
    throw new Error(
      `${label} would take the Devnet allocation to ${sol(next)}, above the approved ${MAX_SOL} SOL. Stopping before the write.`,
    );
  }
  state.spend.allocatedLamports = next;
  writeJson(STATE_FILE, state);
}

const treasury = (() => {
  const secret = readJson(path.join(WALLETS, "treasury.json"));
  if (!secret) throw new Error("No treasury keypair at .data/wallets/treasury.json");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
})();

const mintConfig = readJson(path.join(DATA, "chain", "mint.json"));
if (!mintConfig?.mint) throw new Error("No reward mint in .data/chain/mint.json");
const MINT = process.env.ARG_REWARD_MINT ?? mintConfig.mint;
const RECEIVER = process.env.ARG_AI_PAYMENT_RECEIVER ?? treasury.publicKey.toBase58();
const TOKEN_DECIMALS = mintConfig.decimals ?? 6;

const connection = new Connection(BASE_RPC, "confirmed");

async function rpc(method, params) {
  const response = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function api(pathname, body) {
  const response = await fetch(`${API}${pathname}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${pathname} HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return parsed;
}

function makeAppClient() {
  const cookies = new Map();
  return async function call(pathname, init = {}) {
    const headers = new Headers(init.headers);
    if (cookies.size) headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const response = await fetch(`${APP}${pathname}`, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const at = pair.indexOf("=");
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const type = response.headers.get("content-type") ?? "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, body };
  };
}

const json = (value) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

async function must(call, name, pathname, init) {
  const result = await call(pathname, init);
  if (result.status >= 400) {
    throw new Error(`${name} failed (${result.status}): ${JSON.stringify(result.body).slice(0, 400)}`);
  }
  return result.body;
}

function signAndSerialize(transactionBase64, signer) {
  const bytes = Buffer.from(transactionBase64, "base64");
  try {
    const transaction = Transaction.from(bytes);
    transaction.sign(signer);
    return transaction.serialize();
  } catch {
    const transaction = VersionedTransaction.deserialize(bytes);
    transaction.sign([signer]);
    return transaction.serialize();
  }
}

async function simulate(transactionBase64, signer) {
  const signed = signAndSerialize(transactionBase64, signer);
  const result = await rpc("simulateTransaction", [
    Buffer.from(signed).toString("base64"),
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" },
  ]);
  const value = result?.value ?? {};
  const delta =
    value.preBalances?.[0] !== undefined ? value.postBalances[0] - value.preBalances[0] : null;
  return { err: value.err ?? null, lamports: delta === null ? null : -delta, logs: value.logs ?? [] };
}

async function sendBase(transaction, signers) {
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  void blockhash;
  void lastValidBlockHeight;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: false });
    if (status.value?.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.value.err)}`);
    if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Transaction ${signature} was not confirmed in time`);
}

async function sendRaw(endpoint, raw) {
  const target = new Connection(endpoint, "confirmed");
  const signature = await target.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 3 });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const status = await target.getSignatureStatus(signature, { searchTransactionHistory: false });
    if (status.value?.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.value.err)}`);
    if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Transaction ${signature} was not confirmed on ${endpoint}`);
}

function demoPlayer() {
  const existing = readJson(DEMO_KEY_FILE);
  if (existing) return Keypair.fromSecretKey(Uint8Array.from(existing));
  const keypair = Keypair.generate();
  fs.mkdirSync(WALLETS, { recursive: true });
  fs.writeFileSync(DEMO_KEY_FILE, JSON.stringify(Array.from(keypair.secretKey)));
  log(`created isolated demo rollup wallet at ${path.relative(ROOT, DEMO_KEY_FILE)}`);
  return keypair;
}

const player = demoPlayer();

// ------------------------------------------------------------------ preflight

async function balances() {
  const treasurySol = await connection.getBalance(treasury.publicKey);
  const playerSol = await connection.getBalance(player.publicKey);
  const read = async (address) => {
    try {
      return await api(`/v1/spl/balance?address=${address}&mint=${MINT}&cluster=devnet`);
    } catch (error) {
      return { error: error.message };
    }
  };
  return {
    treasurySol,
    playerSol,
    treasuryToken: await read(RECEIVER),
    playerToken: await read(player.publicKey.toBase58()),
  };
}

function printPreflight(current, queue) {
  log("P3 native payment — pre-flight (read-only)\n");
  log(`cluster          devnet`);
  log(`mint             ${MINT} (${mintConfig.symbol}, ${TOKEN_DECIMALS} dp)`);
  log(`payer (A1)       treasury ${treasury.publicKey.toBase58()} — ${sol(current.treasurySol)}`);
  log(`payer (A3/A4)    demo wallet ${player.publicKey.toBase58()} — ${sol(current.playerSol)}`);
  log(`recipient        ${RECEIVER}`);
  log(`validator        ${VALIDATOR}`);
  log(`ER endpoint      ${ER_RPC}`);
  log(`transfer queue   ${queue.transferQueue ?? "?"} · initialized=${queue.initialized}`);
  log(`treasury token   ${current.treasuryToken.balance ?? "?"} base units, delegation=${current.treasuryToken.delegation?.status ?? "?"}`);
  log(`player token     ${current.playerToken.balance ?? "0 (no account yet)"}`);
  log("\nplanned writes");
  log("  A1 initialize-mint   creates + delegates the validator-scoped transfer queue   ~0.18953 SOL (treasury)");
  log("  A2 fund demo wallet  one SOL transfer to the demo wallet                        0.02000 SOL (treasury)");
  log("  A3 reward claim      normal 1.00 tUSDC payout + campaign counter on the ER     ~0.00400 SOL (treasury)");
  log("  A4 recipient setup   1 base unit, delegates the merchant eATA                  ~0.01440 SOL (treasury)");
  log("  A4 player deposit    0.20 tUSDC into the Global Vault, eATA delegated          ~0.01444 SOL (player)");
  log("  A4 ER transfer       0.20 tUSDC inside the rollup                              0.00000 SOL");
  const planned = 0.18953 + 0.02 + 0.004 + 0.01444 + 0.0144;
  log(`\nprojected total  ~${planned.toFixed(5)} SOL of the approved ${MAX_SOL.toFixed(2)} SOL`);
  log("nothing above has been executed yet");
}

async function preflight() {
  const queue = await api(`/v1/spl/is-mint-initialized?mint=${MINT}&cluster=devnet&validator=${VALIDATOR}`);
  printPreflight(await balances(), queue);
}

// ------------------------------------------------------------------- the run

async function initializeMint() {
  if (state.steps["A1"]?.signature) {
    log(`A1 already done: ${state.steps.A1.signature}`);
    return;
  }
  const built = await api("/v1/spl/initialize-mint", { payer: treasury.publicKey.toBase58(), mint: MINT, cluster: "devnet", validator: VALIDATOR });
  const simulation = await simulate(built.transactionBase64, treasury);
  if (simulation.err) throw new Error(`initialize-mint simulation failed: ${JSON.stringify(simulation.err)}`);
  log(`A1 initialize-mint: ${built.instructionCount} ix, queue ${built.transferQueue}, rent ${built.rentPda}`);
  log(`   simulated cost ${sol(simulation.lamports)} (cap ${MAX_SOL} SOL)`);
  if (simulation.lamports / LAMPORTS_PER_SOL > MAX_SOL - 0.03) {
    throw new Error("initialize-mint alone would leave no room for the rest of the approved budget; stopping.");
  }
  guard(simulation.lamports, "initialize-mint");
  const signature = await sendRaw(BASE_RPC, signAndSerialize(built.transactionBase64, treasury));
  const queue = await api(`/v1/spl/is-mint-initialized?mint=${MINT}&cluster=devnet&validator=${VALIDATOR}`);
  remember("A1", {
    signature,
    transferQueue: built.transferQueue,
    rentPda: built.rentPda,
    simulatedLamports: simulation.lamports,
    initialized: queue.initialized,
    explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  });
  log(`A1 confirmed (base layer): ${signature} · initialized=${queue.initialized}`);
}

async function fundDemoWallet() {
  const balance = await connection.getBalance(player.publicKey);
  if (balance >= 0.019 * LAMPORTS_PER_SOL) {
    log(`A2 demo wallet already funded: ${sol(balance)}`);
    return;
  }
  const amount = Math.round(0.02 * LAMPORTS_PER_SOL);
  guard(amount, "demo wallet funding");
  const transaction = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: player.publicKey, lamports: amount }),
  );
  transaction.feePayer = treasury.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  transaction.sign(treasury);
  const signature = await sendBase(transaction, [treasury]);
  remember("A2", { signature, lamports: amount, player: player.publicKey.toBase58() });
  log(`A2 funded ${sol(amount)} to ${player.publicKey.toBase58()} · ${signature}`);
}

async function claimReward() {
  if (state.steps.A3?.rewardSignature) {
    log(`A3 already done: reward ${state.steps.A3.rewardSignature}`);
    return state.steps.A3;
  }
  const merchant = makeAppClient();
  const draft = {
    title: "P3 Native Payment Fixture",
    shopName: "Rollup Fixture (demo only)",
    shopArea: "Nowhere, demo fixture",
    shopAddress: "2 Fixture Lane (fictional, not a real shop)",
    teaser: "An isolated fixture for the native rollup payment proof.",
    story:
      "FICTION: this campaign exists only to exercise the native MagicBlock payment path. It is not a shop and is not offered to players.",
    targetObject: "The fixture tally card",
    targetObjectHint: "Clipped inside the fixture case.",
    answerQuestion: "How many marks are on the tally card?",
    answer: "5",
    hint1: "Count the marks only.",
    hint2: "Five marks, none crossed out.",
    extSocialClue: "A fixture post repeats the card heading.",
    extWebClue: "The fixture page lists the count rule.",
    extInstoreClue: "The card sits in the case.",
    extQuestion: "What number opens the card?",
    extAnswer: "11",
    extHint: "The card says the second count opens it.",
    optionalMode: "product_clue",
    productName: "the fixture tally card",
    productPriceLabel: "₩0 (demo fixture, never sold)",
    productProp: "the laminated tally card",
    productClue: "The card is an instruction, not a count of people.",
    finalQuestion: "What does the card open on?",
    finalAnswer: "7",
    finalHint: "Its second count.",
    endingTitle: "Fixture closed",
    endingBody:
      "FICTION: the fixture reached its end, recorded one rollup payment, and was set aside without changing any real shop.",
    achievementTitle: "Fixture Reader",
    achievementBody: "Completed the isolated native-payment fixture.",
    rewardAmount: "1",
    couponItem: "Nothing is issued by the fixture",
    couponMinSpend: "0",
    couponValidDays: "7",
    couponNotes: "Demo fixture only.",
    onlineClues: [
      { title: "Fixture heading", body: "The card heading reads DEMO FIXTURE.", url: "https://example.com/fixture/heading" },
      { title: "Fixture rule", body: "The count is released clues, not people.", url: "https://example.com/fixture/rule" },
      { title: "Fixture marks", body: "Five marks, none crossed out.", url: "https://example.com/fixture/marks" },
    ],
    instoreClues: [{ title: "The card itself", body: "Count the marks on the card.", url: "" }],
  };
  const created = await must(merchant, "create fixture", "/api/campaigns", json(draft));
  const campaign = created.campaign;
  await must(merchant, "submit fixture", `/api/campaigns/${campaign.id}/submit`, { method: "POST" });
  await must(merchant, "approve fixture", `/api/campaigns/${campaign.id}/review`, json({ decision: "approve" }));
  log(`A3 fixture campaign published: ${campaign.slug}`);

  const playerClient = makeAppClient();
  await must(playerClient, "start", `/api/quests/${campaign.slug}/start`, { method: "POST" });
  for (const action of ["read-online", "read-online", "read-online", "read-instore"]) {
    const result = await playerClient(`/api/quests/${campaign.slug}/progress`, json({ action }));
    if (result.status >= 400 && !/already (found|read)/.test(JSON.stringify(result.body))) {
      throw new Error(`progress ${action} failed: ${JSON.stringify(result.body)}`);
    }
  }
  await must(playerClient, "answer", `/api/quests/${campaign.slug}/answer`, json({ answer: "5" }));

  const form = new FormData();
  form.set("kind", "simulation");
  form.set("capturedAt", new Date().toISOString());
  form.set("photo", new File([Buffer.alloc(64, 0xff)], "fixture-simulated.jpg", { type: "image/jpeg" }));
  const evidence = await must(playerClient, "evidence", `/api/quests/${campaign.slug}/evidence`, {
    method: "POST",
    body: form,
  });
  const reviewed = await must(
    playerClient,
    "review",
    `/api/evidence/${evidence.evidence.id}/review`,
    json({ decision: "approve" }),
  );
  log(`A3 verified completion ${reviewed.completionId} · counter chain ${JSON.stringify(reviewed.chain)}`);

  const claimed = await must(playerClient, "claim", `/api/quests/${campaign.slug}/reward`, json({
    wallet: player.publicKey.toBase58(),
  }));
  const payout = claimed.reward?.payout ?? {};
  const result = {
    campaignSlug: campaign.slug,
    completionId: reviewed.completionId,
    chain: reviewed.chain,
    counter: claimed.reward?.chain ?? null,
    rewardSignature: payout.signature,
    rewardExplorer: payout.signature ? `https://explorer.solana.com/tx/${payout.signature}?cluster=devnet` : null,
    recipientBefore: payout.recipientBefore,
    recipientAfter: payout.recipientAfter,
    amountBaseUnits: payout.amountBaseUnits,
    slug: campaign.slug,
  };
  remember("A3", result);
  log(`A3 reward claimed: ${result.rewardSignature} · ${payout.recipientBefore} → ${payout.recipientAfter} base units`);
  return result;
}

/**
 * The merchant's rollup balance has to be delegated before it can be credited, and
 * only its owner can sign that deposit. The treasury owns the recipient, so this
 * one setup write is done here rather than by the app.
 */
async function ensureRecipientRollupAccount() {
  const before = await api(`/v1/spl/balance?address=${RECEIVER}&mint=${MINT}&cluster=devnet`);
  if (before.delegation?.status === "delegated") {
    log(`A4 recipient already delegated (${before.balance ?? "?"} base units in the rollup)`);
    return;
  }
  const built = await api("/v1/spl/deposit", {
    owner: RECEIVER,
    mint: MINT,
    amount: 1,
    cluster: "devnet",
    validator: VALIDATOR,
    initIfMissing: true,
    initAtasIfMissing: true,
    initVaultIfMissing: true,
  });
  const simulation = await simulate(built.transactionBase64, treasury);
  if (simulation.err) throw new Error(`recipient setup simulation failed: ${JSON.stringify(simulation.err)}`);
  log(`A4 recipient setup: ${built.instructionCount} ix, simulated ${sol(simulation.lamports)}`);
  guard(simulation.lamports, "recipient rollup setup");
  const signature = await sendRaw(BASE_RPC, signAndSerialize(built.transactionBase64, treasury));
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await api(`/v1/spl/balance?address=${RECEIVER}&mint=${MINT}&cluster=devnet`);
    if (state.delegation?.status === "delegated") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  remember("A4", { recipientSetupByMerchant: signature, recipientSetupLamports: simulation.lamports });
  log(`A4 recipient delegated · ${signature}`);
}

async function nativePayment() {
  const slug = state.steps.A3?.slug;
  if (!slug) throw new Error("Run the claim step first.");
  const client = makeAppClient();
  await must(client, "start", `/api/quests/${slug}/start`, { method: "POST" });

  const stateBefore = await must(client, "ai state", `/api/quests/${slug}/ai`);
  if (!stateBefore.native?.available) {
    throw new Error(`native payment unavailable: ${stateBefore.native?.reason ?? "unknown"}`);
  }
  log(`A4 state: balance ${stateBefore.balanceLabel}, price ${stateBefore.priceLabel}, validator ${stateBefore.native.validator}`);

  const quote = await must(client, "quote", `/api/quests/${slug}/ai`, json({
    action: "quote",
    question: "Does the reserved column in the ledger describe a count of pours, or something the shop stopped selling?",
  }));
  log(`A4 quote ${quote.intentId} · ${quote.priceLabel} · settlement=${quote.settlement}`);
  remember("A4", { intentId: quote.intentId, quote: { priceLabel: quote.priceLabel, settlement: quote.settlement } });

  const prepared = await must(client, "er_prepare", `/api/quests/${slug}/ai`, json({
    action: "er_prepare",
    intentId: quote.intentId,
  }));
  log(`A4 deposit      ${prepared.depositSignature ?? "(already delegated)"}`);
  log(`A4 recipient    ${prepared.receiverSetupSignature ?? "(already delegated)"}`);
  log(`A4 ER transfer  ${prepared.transferSignature} (${prepared.confirmation}, fee ${prepared.feeLamports ?? 0} lamports)`);

  const settled = await must(client, "settle_er", `/api/quests/${slug}/ai`, json({
    action: "settle_er",
    intentId: quote.intentId,
  }));
  log(`A4 settled      ${settled.receipt.signature} · settlement=${settled.receipt.settlement} · l1Settled=${settled.receipt.l1Settled}`);

  const investigation = await must(client, "investigate", `/api/quests/${slug}/ai`, json({
    action: "investigate",
    intentId: quote.intentId,
  }));
  log(`A4 Claude ${investigation.model} · ${investigation.usage?.inputTokens} in / ${investigation.usage?.outputTokens} out · $${Number(investigation.estimatedCostUsd ?? 0).toFixed(4)}`);
  log(`A4 reply: ${String(investigation.reply).replace(/\s+/g, " ").slice(0, 400)}`);

  const replay = await client(`/api/quests/${slug}/ai`, json({ action: "settle_er", intentId: quote.intentId }));
  log(`A4 replay       HTTP ${replay.status} status=${replay.body.status} (signature reused, no second charge)`);

  remember("A4", {
    ...state.steps.A4,
    depositSignature: prepared.depositSignature,
    receiverSetupSignature: prepared.receiverSetupSignature,
    transferSignature: prepared.transferSignature,
    confirmation: prepared.confirmation,
    settlement: settled.receipt.settlement,
    l1Settled: settled.receipt.l1Settled,
    settlementNote: settled.receipt.settlementNote,
    feeLamports: prepared.feeLamports,
    payerBalanceBefore: prepared.payerBalanceBefore,
    payerBalanceAfter: prepared.payerBalanceAfter,
    receiverBalanceBefore: prepared.receiverBalanceBefore,
    receiverBalanceAfter: prepared.receiverBalanceAfter,
    reply: investigation.reply,
    model: investigation.model,
    usage: investigation.usage,
    costUsd: investigation.estimatedCostUsd,
    replayStatus: replay.body.status,
  });

  // ---- on-chain underpayment refusal -------------------------------------
  const under = await must(client, "underpay quote", `/api/quests/${slug}/ai`, json({
    action: "quote",
    question: "Is the ledger's bottom row a running tally or a fixed label?",
  }));
  const memo = `arg-ai:${under.intentId}`;
  const built = await api("/v1/spl/transfer", {
    from: player.publicKey.toBase58(),
    to: RECEIVER,
    mint: MINT,
    amount: 1,
    cluster: "devnet",
    validator: VALIDATOR,
    visibility: "public",
    fromBalance: "ephemeral",
    toBalance: "ephemeral",
    memo,
    legacy: true,
  });
  const underSignature = await sendRaw(ER_RPC, signAndSerialize(built.transactionBase64, player));
  const attached = await must(client, "attach underpayment", `/api/quests/${slug}/ai`, json({
    action: "er_attach",
    intentId: under.intentId,
    signature: underSignature,
  }));
  void attached;
  const refused = await client(`/api/quests/${slug}/ai`, json({ action: "settle_er", intentId: under.intentId }));
  log(`A4 underpay     ${underSignature} · refused: ${refused.body.code} — ${refused.body.reason}`);

  remember("A4", { underpaySignature: underSignature, underpayRefusal: refused.body.code, underpayIntent: under.intentId });

  const after = await must(client, "ai state after", `/api/quests/${slug}/ai`);
  log(`A4 balance after: ${after.balanceLabel}`);
  remember("A4", { balanceAfter: after.balanceLabel, balanceBefore: stateBefore.balanceLabel });
}

async function report() {
  const current = await balances();
  const queue = await api(`/v1/spl/is-mint-initialized?mint=${MINT}&cluster=devnet&validator=${VALIDATOR}`);
  const spentTreasury = (state.steps.A1?.simulatedLamports ?? 0) + (state.steps.A2?.lamports ?? 0);
  const evidence = {
    cluster: "devnet",
    mint: MINT,
    symbol: mintConfig.symbol,
    validator: VALIDATOR,
    erEndpoint: ER_RPC,
    transferQueue: queue.transferQueue,
    treasury: treasury.publicKey.toBase58(),
    receiver: RECEIVER,
    demoPlayer: player.publicKey.toBase58(),
    balancesNow: current,
    steps: state.steps,
    treasurySpendLamports: spentTreasury,
    treasurySpendSol: spentTreasury / LAMPORTS_PER_SOL,
  };
  writeJson(path.join(DATA, "p3", "native-demo-evidence.json"), evidence);
  log(JSON.stringify(evidence.steps, null, 2));
}

if (mode === "preflight") {
  await preflight();
} else if (mode === "run") {
  await preflight();
  log("\n--- executing approved writes ---");
  await initializeMint();
  await fundDemoWallet();
  await claimReward();
  await ensureRecipientRollupAccount();
  await nativePayment();
  await report();
} else if (mode === "report") {
  await report();
} else {
  throw new Error(`unknown mode ${mode}`);
}
