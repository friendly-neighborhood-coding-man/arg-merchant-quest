#!/usr/bin/env node
/**
 * Read-only feasibility probe for P3 native MagicBlock payment.
 *
 * It answers, with no wallet, no signature and no submission:
 * 1. Which x402 kinds MagicBlock advertises for devnet.
 * 2. Whether the merchant-checkout offer schema can name a mint at all
 *    (it cannot: the API rejects an unknown `mint` key).
 * 3. Whether our reward mint has a transfer queue on the devnet validator.
 * 4. What the treasury's base balance / delegation state is for that mint.
 * 5. What the exact `initialize-mint` and `deposit` builds look like, and what
 *    they would cost, by SIMULATING the unsigned transactions (a simulation
 *    changes no state and is not a payment).
 * 6. What the ER transfer build reports for fees on the ephemeral route.
 *
 * Nothing here registers a merchant, signs a transaction or submits one.
 *
 * Usage: node scripts/p3/native-payment-feasibility.mjs [--no-simulate]
 */

const API = "https://api.magicblock.app";
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const MINT = process.env.ARG_REWARD_MINT ?? "61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1";
const TREASURY = process.env.ARG_TREASURY_PUBKEY ?? "DUonyYGVwJ3d1vMNfUWTCiFXHUJ6AgUyWGmPuSgpxr3N";
const VALIDATORS = {
  "devnet-as (default)": "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
  "devnet-us (v2.0)": "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd",
};
const SIMULATE = !process.argv.includes("--no-simulate");

const usd = (lamports) => `${(Number(lamports) / 1e9).toFixed(5)} SOL`;

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: json };
}

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await response.json();
  return json.result;
}

async function simulate(transactionBase64) {
  if (!SIMULATE) return null;
  const result = await rpc("simulateTransaction", [
    transactionBase64,
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" },
  ]);
  const value = result?.value ?? {};
  const delta = value.preBalances?.[0] !== undefined ? value.postBalances[0] - value.preBalances[0] : null;
  return { err: value.err ?? null, units: value.unitsConsumed ?? null, delta };
}

function report(label, sim) {
  if (!sim) return;
  console.log(`  sim would fail:      ${sim.err === null ? "no (succeeds)" : JSON.stringify(sim.err)}`);
  console.log(`  sim compute units:   ${sim.units ?? "?"}`);
  console.log(`  sim fee-payer delta: ${sim.delta === null ? "?" : `${sim.delta} lamports (${usd(-sim.delta)} spent)`}`);
}

console.log(`mint      ${MINT}`);
console.log(`treasury  ${TREASURY}`);
console.log(`cluster   devnet`);
console.log(`mode      ${SIMULATE ? "build + simulate (nothing submitted)" : "build only"}\n`);

const supported = await call("GET", "/v1/x402/supported");
console.log(`1. x402 supported: HTTP ${supported.status}`);
for (const kind of supported.body.kinds ?? []) {
  console.log(
    `   ${kind.scheme} · ${kind.network} · ${kind.extra?.cluster} · ${kind.extra?.settlement} · ${kind.extra?.paymentFlow}`,
  );
}

const offer = await call("POST", "/v1/payment-links", {
  amount: "200000",
  cluster: "devnet",
  externalReference: "p3-feasibility-probe",
  mint: MINT,
});
console.log(`\n2. payment-links offer schema: HTTP ${offer.status}`);
console.log(`   ${JSON.stringify(offer.body.error?.issues ?? offer.body.error ?? offer.body).slice(0, 300)}`);
console.log("   (an offer cannot name a mint: merchant checkout settles USDC for the cluster)");

console.log("\n3. transfer queue per validator");
for (const [name, validator] of Object.entries(VALIDATORS)) {
  const state = await call(
    "GET",
    `/v1/spl/is-mint-initialized?mint=${MINT}&cluster=devnet&validator=${validator}`,
  );
  const body = state.body;
  console.log(
    `   ${name}: HTTP ${state.status} initialized=${body.initialized} queue=${body.transferQueue ?? "?"}`,
  );
}

const balance = await call("GET", `/v1/spl/balance?address=${TREASURY}&mint=${MINT}&cluster=devnet`);
console.log("\n4. treasury balance for this mint");
console.log(`   ${JSON.stringify(balance.body).slice(0, 300)}`);

const init = await call("POST", "/v1/spl/initialize-mint", {
  payer: TREASURY,
  mint: MINT,
  cluster: "devnet",
});
console.log(`\n5. initialize-mint build: HTTP ${init.status}`);
if (init.body.error) {
  console.log(`   ${JSON.stringify(init.body.error).slice(0, 300)}`);
} else {
  console.log(
    `   kind=${init.body.kind} sendTo=${init.body.sendTo} ix=${init.body.instructionCount} signers=${(init.body.requiredSigners ?? []).join(",")}`,
  );
  console.log(`   transferQueue=${init.body.transferQueue} rentPda=${init.body.rentPda}`);
  report("initialize-mint", await simulate(init.body.transactionBase64));
}

const deposit = await call("POST", "/v1/spl/deposit", {
  owner: TREASURY,
  mint: MINT,
  amount: 200000,
  cluster: "devnet",
  initIfMissing: true,
  initAtasIfMissing: true,
  initVaultIfMissing: true,
});
console.log(`\n6. deposit build (player leg): HTTP ${deposit.status}`);
if (deposit.body.error) {
  console.log(`   ${JSON.stringify(deposit.body.error).slice(0, 300)}`);
} else {
  console.log(
    `   kind=${deposit.body.kind} sendTo=${deposit.body.sendTo} ix=${deposit.body.instructionCount} signers=${(deposit.body.requiredSigners ?? []).join(",")}`,
  );
  report("deposit", await simulate(deposit.body.transactionBase64));
}

const transfer = await call("POST", "/v1/spl/transfer", {
  from: TREASURY,
  to: TREASURY,
  mint: MINT,
  amount: 200000,
  cluster: "devnet",
  visibility: "public",
  fromBalance: "ephemeral",
  toBalance: "ephemeral",
});
console.log(`\n7. ER transfer build (payment leg): HTTP ${transfer.status}`);
if (transfer.body.error) {
  console.log(`   ${JSON.stringify(transfer.body.error).slice(0, 300)}`);
} else {
  console.log(
    `   kind=${transfer.body.kind} sendTo=${transfer.body.sendTo} ix=${transfer.body.instructionCount} fees=${JSON.stringify(transfer.body.fees)}`,
  );
}

console.log(
  "\nNo merchant was registered, no transaction was signed, and nothing was submitted." +
    (SIMULATE ? "\nSimulation runs against Devnet RPC and changes no state." : ""),
);
