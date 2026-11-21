"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";

export interface RewardPanelData {
  credits: number;
  amount: string;
  symbol: string;
  name: string;
  mint: string;
  isCircleUsdc: boolean;
  conversionCopy: string;
  cluster: string;
}

export interface RewardPayout {
  status: string;
  wallet: string | null;
  signature: string | null;
  error: string | null;
  recipientBefore: number | null;
  recipientAfter: number | null;
  recipientTokenAccount: string | null;
  claimedAt: string | null;
  confirmedAt: string | null;
  explorerUrl: string | null;
  tokenAccountUrl: string | null;
}

export interface RewardChain {
  status: string | null;
  counterAccount: string | null;
  programId: string | null;
  createSignature: string | null;
  delegateSignature: string | null;
  incrementSignature: string | null;
  commitSignature: string | null;
  counterValue: number | null;
  committedValue: number | null;
  erEndpoint: string | null;
  error: string | null;
}

function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function formatUnits(value: number | null, decimals = 6): string {
  if (value === null) return "—";
  return (value / 10 ** decimals).toFixed(2);
}

function ChainRow({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line/40 py-1.5 first:border-0">
      <span className="text-[10.5px] tracking-[0.12em] text-sage/45 uppercase">{label}</span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          className="link max-w-[62%] break-all text-right font-mono text-[10.5px] leading-snug"
        >
          {value}
        </a>
      ) : (
        <span className="max-w-[62%] break-all text-right font-mono text-[10.5px] leading-snug text-sage/75">
          {value}
        </span>
      )}
    </div>
  );
}

export function RewardClaim({
  slug,
  reward,
  payout,
  chain,
  chainError,
  simulated,
}: {
  slug: string;
  reward: RewardPanelData;
  payout: RewardPayout;
  chain: RewardChain;
  chainError: string | null;
  simulated: boolean;
}) {
  const router = useRouter();
  const [wallet, setWallet] = useState(payout.wallet ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  const paid = payout.status === "paid" && Boolean(payout.signature);
  const committed = chain.status === "committed";

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/quests/${slug}/reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The Devnet payout did not go through.");
        setBusy(false);
        router.refresh();
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      setBusy(false);
      setError("Network error — the payout was not submitted.");
    }
  }

  async function verifyBalance() {
    setChecking(true);
    try {
      const response = await fetch(
        `/api/quests/${slug}/reward?wallet=${encodeURIComponent(payout.wallet ?? wallet)}`,
      );
      const data = (await response.json().catch(() => ({}))) as {
        reward?: { recipientBalance?: { amount: string } | null };
      };
      setBalance(data.reward?.recipientBalance?.amount ?? "0.00");
    } catch {
      setBalance(null);
    }
    setChecking(false);
  }

  return (
    <section className="panel border-mint/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label text-mint/80">Reward · {reward.cluster}</p>
        <span
          className={
            paid
              ? "chip border-mint/40 bg-mint/10 text-mint"
              : payout.status === "failed"
                ? "chip border-rust/40 bg-rust/10 text-rust"
                : "chip border-amber/40 bg-amber/10 text-amber-soft"
          }
        >
          {paid ? "Paid on-chain" : payout.status === "failed" ? "Payout failed" : "Ready to claim"}
        </span>
      </div>

      <h2 className="mt-2 font-display text-2xl text-white/95">
        {paid ? "The reward is in your wallet." : `Claim ${reward.amount} ${reward.symbol}`}
      </h2>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
        {reward.credits} credits is the fixed reward. {reward.conversionCopy}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-sage/50">
        {reward.isCircleUsdc
          ? "This is Circle's Solana Devnet USDC — valueless test funds, not real money."
          : `${reward.name}: a valueless SPL test token on Solana Devnet created for this demo. It is not Circle USDC and has no monetary value.`}
      </p>

      {payout.status === "failed" && payout.error ? (
        <div className="mt-3 rounded-xl border border-rust/40 bg-rust/10 px-3.5 py-2.5">
          <p className="text-[12px] font-semibold text-rust">The transfer was rejected on-chain</p>
          <p className="mt-1 break-words text-[11.5px] text-rust/85">{payout.error}</p>
        </div>
      ) : null}

      {paid ? (
        <div className="mt-4 space-y-1 rounded-xl border border-mint/30 bg-mint/5 px-4 py-3">
          <p className="text-[12px] text-mint/85">
            {formatUnits(payout.recipientAfter)} {reward.symbol} in the recipient account
          </p>
          <ChainRow
            label="Transaction"
            value={payout.signature ?? ""}
            link={payout.signature ? explorerTx(payout.signature) : undefined}
          />
          <ChainRow label="Recipient" value={payout.wallet ?? ""} link={payout.wallet ? explorerAddress(payout.wallet) : undefined} />
          <ChainRow
            label="Token account"
            value={payout.recipientTokenAccount ?? ""}
            link={payout.recipientTokenAccount ? explorerAddress(payout.recipientTokenAccount) : undefined}
          />
          <ChainRow
            label="Balance change"
            value={`${formatUnits(payout.recipientBefore)} → ${formatUnits(payout.recipientAfter)} ${reward.symbol}`}
          />
          <ChainRow label="Confirmed" value={payout.confirmedAt ? formatDateTime(payout.confirmedAt) : "—"} />

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => void verifyBalance()}
              disabled={checking}
              className="btn-ghost py-1.5 text-[11.5px]"
            >
              {checking ? "Checking RPC…" : "Verify balance from the chain"}
            </button>
            {balance !== null ? (
              <span className="font-mono text-[11px] text-mint">
                {balance} {reward.symbol}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-sage/40">
            Open the transaction in Solana Explorer to confirm the mint, amount and recipient
            yourself.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <label className="label" htmlFor="reward-wallet">
            Devnet wallet address
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="reward-wallet"
              className="input font-mono text-[12.5px]"
              value={wallet}
              onChange={(event) => setWallet(event.target.value)}
              placeholder="Paste a Solana Devnet address"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => void claim()}
              disabled={busy || wallet.trim().length < 32}
              className="btn-primary shrink-0 py-2.5"
            >
              {busy ? "Submitting transfer…" : `Send ${reward.amount} ${reward.symbol}`}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-sage/45">
            Any Solana address works — the demo treasury pays the fee and creates the recipient token
            account. Nothing is sent on Solana mainnet.
          </p>
          {error ? <p className="mt-2 text-[12px] text-rust">{error}</p> : null}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-line/70 bg-ink-soft/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mono-label text-[9px] text-berry/80">MagicBlock · campaign completion counter</p>
          <span
            className={
              committed
                ? "chip border-berry/40 bg-berry/10 text-berry"
                : "chip border-amber/40 bg-amber/10 text-amber-soft"
            }
          >
            {committed ? "Committed to Solana" : chain.status === "failed" ? "Update failed" : "Pending"}
          </span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-sage/55">
          Your verified completion incremented a campaign counter on a MagicBlock Ephemeral Rollup,
          then committed that state back to Solana. The counter is a PDA of the demo program; it is
          public and independently readable.
        </p>

        <div className="mt-2">
          <ChainRow
            label="Program"
            value={chain.programId ?? "—"}
            link={chain.programId ? explorerAddress(chain.programId) : undefined}
          />
          <ChainRow
            label="Counter account"
            value={chain.counterAccount ?? "—"}
            link={chain.counterAccount ? explorerAddress(chain.counterAccount) : undefined}
          />
          <ChainRow
            label="Delegate"
            value={chain.delegateSignature ?? "—"}
            link={chain.delegateSignature ? explorerTx(chain.delegateSignature) : undefined}
          />
          <ChainRow
            label="ER increment"
            value={chain.incrementSignature ?? "—"}
            link={chain.incrementSignature ? explorerTx(chain.incrementSignature) : undefined}
          />
          <ChainRow
            label="Commit"
            value={chain.commitSignature ?? "—"}
            link={chain.commitSignature ? explorerTx(chain.commitSignature) : undefined}
          />
          <ChainRow
            label="Counter value"
            value={
              chain.committedValue !== null
                ? `${chain.committedValue} verified completion${chain.committedValue === 1 ? "" : "s"}`
                : "—"
            }
          />
          <ChainRow label="ER endpoint" value={chain.erEndpoint ?? "—"} />
        </div>

        {chain.error || chainError ? (
          <p className="mt-2 break-words text-[11px] text-rust/80">{chain.error ?? chainError}</p>
        ) : null}
      </div>

      {simulated ? (
        <p className="mt-3 text-[11px] leading-relaxed text-sage/45">
          You submitted a labelled simulation, and the operator approved it as a demo capture. It is
          not proof that anyone was in the shop.
        </p>
      ) : null}
    </section>
  );
}
