#!/usr/bin/env node
/**
 * Read-only probe of MagicBlock's Devnet payment capabilities for P3.
 *
 * It answers, without a wallet and without writing anything:
 * 1. Which x402 kinds/schemes/networks MagicBlock advertises (devnet or not).
 * 2. Whether the visit token mint is already initialized for MagicBlock's SPL
 *    payments API on devnet (the step an ER transfer would need).
 *
 * It never registers a merchant, never signs and never sends a chain write.
 *
 * Usage: node scripts/p3/magicblock-capabilities.mjs
 */

const API = "https://api.magicblock.app";
const MINT = process.env.ARG_REWARD_MINT ?? "61xJEucfUnrnf5aUotkmCGuUE41X28WiEn9K6M2YueS1";

function line(label, value) {
  console.log(`${label.padEnd(26)} ${value}`);
}

async function x402Kinds() {
  const response = await fetch(`${API}/v1/x402/supported`, { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  console.log(`x402 supported: HTTP ${response.status}`);
  for (const kind of body.kinds ?? []) {
    line("  kind", `${kind.scheme} · ${kind.network} · ${kind.extra?.cluster ?? "?"} · ${kind.extra?.settlement ?? "?"}`);
  }
  const devnet = (body.kinds ?? []).some((kind) => kind.extra?.cluster?.startsWith("devnet"));
  line("  devnet advertised", String(devnet));
  line("  extensions", (body.extensions ?? []).join(", ") || "none");
}

async function mintState() {
  const attempts = [
    { method: "POST", body: { mint: MINT, cluster: "devnet" } },
    { method: "GET" },
  ];
  for (const attempt of attempts) {
    const url =
      attempt.method === "GET"
        ? `${API}/v1/spl/is-mint-initialized?mint=${MINT}&cluster=devnet`
        : `${API}/v1/spl/is-mint-initialized`;
    try {
      const response = await fetch(url, {
        method: attempt.method,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: attempt.body ? JSON.stringify(attempt.body) : undefined,
      });
      const text = await response.text();
      console.log(`is-mint-initialized (${attempt.method}): HTTP ${response.status} ${text.slice(0, 220)}`);
      if (response.status !== 404 && response.status !== 405) return;
    } catch (error) {
      console.log(`is-mint-initialized (${attempt.method}) failed: ${error.message}`);
    }
  }
}

try {
  line("mint", MINT);
  line("cluster", "devnet");
  await x402Kinds();
  await mintState();
  console.log(
    "\nNote: /v1/merchants/challenge + /v1/merchants are the wallet-signed merchant\n" +
      "registration used by x402/MPP checkout; this probe does not register anything.",
  );
} catch (error) {
  console.error(`probe failed: ${error.message}`);
  process.exit(1);
}
