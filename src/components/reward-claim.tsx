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

/**
 * Ephemeral Rollup transactions do not exist on the base layer, so a normal
 * `?cluster=devnet` Explorer link would show "not found". The app verifies them
 * against the exact ER endpoint recorded for the run, which the Magic Router may
 * have chosen instead of the example region.
 */
function erVerificationPath(signature: string, endpoint: string | null): string {
  const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : "";
  return `/chain/er/${signature}${query}`;
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
  /** Null when this deployment has no reward mint or treasury keypair. */
  reward: RewardPanelData | null;
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
  const processing = payout.status === "processing";
  const failed = payout.status === "failed";
  const committed = chain.status === "committed";
  const chainConfigured = Boolean(chain.programId || chain.status || chain.counterAccount);
  const chainFailed = chain.status === "failed";

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
        reward?: { recipientBalance?: { amount: string } | null } | null;
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
        <p className="mono-label text-mint/80">Reward · Solana Devnet</p>
        <span
          className={
            !reward
              ? "chip border-line text-sage/60"
              : paid
                ? "chip border-mint/40 bg-mint/10 text-mint"
                : failed
                  ? "chip border-rust/40 bg-rust/10 text-rust"
                  : "chip border-amber/40 bg-amber/10 text-amber-soft"
          }
        >
          {!reward
            ? "Not configured"
            : paid
              ? "Paid on-chain"
              : failed
                ? "Payout failed"
                : processing
                  ? "Submitting"
                  : "Ready to claim"}
        </span>
      </div>

      {!reward ? (
        <>
          <h2 className="mt-2 font-display text-2xl text-white/95">
            Reward payout is not configured on this server.
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
            This deployment has no demo reward mint or treasury keypair, so there is no claim form.
            Your verified completion, achievement and demo coupon are unaffected. An operator can
            enable payouts with <code className="text-amber-soft">ARG_REWARD_MINT</code> and{" "}
            <code className="text-amber-soft">ARG_TREASURY_KEYPAIR</code>.
          </p>
        </>
      ) : paid ? (
        <>
          <h2 className="mt-2 font-display text-2xl text-white/95">
            The reward is in your wallet.
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
            {reward.credits} credits is the fixed reward. {reward.conversionCopy}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-sage/50">
            {reward.isCircleUsdc
              ? "This is Circle's Solana Devnet USDC — valueless test funds, not real money."
              : `${reward.name}: a valueless SPL test token on Solana Devnet created for this demo. It is not Circle USDC and has no monetary value.`}
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-2 font-display text-2xl text-white/95">
            {failed ? "The reward transfer failed." : `Claim ${reward.amount} ${reward.symbol}`}
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
            {reward.credits} credits is the fixed reward. {reward.conversionCopy}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-sage/50">
            {reward.isCircleUsdc
              ? "This is Circle's Solana Devnet USDC — valueless test funds, not real money."
              : `${reward.name}: a valueless SPL test token on Solana Devnet created for this demo. It is not Circle USDC and has no monetary value.`}
          </p>
          {failed ? (
            <p className="mt-2 text-[12px] leading-relaxed text-rust/85">
              Nothing was paid for this attempt. You can retry the transfer below.
            </p>
          ) : null}
        </>
      )}

      {failed && payout.error ? (
        <div className="mt-3 rounded-xl border border-rust/40 bg-rust/10 px-3.5 py-2.5">
          <p className="text-[12px] font-semibold text-rust">The Devnet transfer did not complete</p>
          <p className="mt-1 break-words text-[11.5px] text-rust/85">{payout.error}</p>
        </div>
      ) : null}

      {reward && paid ? (
        <div className="mt-4 space-y-1 rounded-xl border border-mint/30 bg-mint/5 px-4 py-3">
          <p className="text-[12px] text-mint/85">
            This reward transferred {formatUnits(payout.recipientAfter !== null && payout.recipientBefore !== null ? payout.recipientAfter - payout.recipientBefore : null)} {reward.symbol}.
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

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => void verifyBalance()}
              disabled={checking}
              className="btn-ghost py-1.5 text-[11.5px]"
            >
              {checking ? "Checking RPC…" : "Read the wallet balance from the chain"}
            </button>
            {balance !== null ? (
              <span className="font-mono text-[11px] text-mint">
                {balance} {reward.symbol} now
              </span>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-sage/40">
            <span className="text-sage/60">Current wallet balance</span> is the recipient
            wallet&apos;s total balance now, not the size of this individual reward. Open the
            transaction in Solana Explorer to confirm the mint, amount and recipient yourself.
          </p>
        </div>
      ) : null}

      {reward && !paid ? (
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
              disabled={busy || processing || wallet.trim().length < 32}
              className="btn-primary shrink-0 py-2.5"
            >
              {busy || processing
                ? "Submitting transfer…"
                : `${failed ? "Retry" : "Send"} ${reward.amount} ${reward.symbol}`}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-sage/45">
            Any Solana address works — the demo treasury pays the fee and creates the recipient token
            account. Nothing is sent on Solana mainnet.
          </p>
          {error ? <p className="mt-2 text-[12px] text-rust">{error}</p> : null}
        </div>
      ) : null}

      <div className="mt-5 rounded-xl border border-line/70 bg-ink-soft/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mono-label text-[9px] text-berry/80">MagicBlock · campaign completion counter</p>
          <span
            className={
              !chainConfigured
                ? "chip border-line text-sage/60"
                : committed
                  ? "chip border-berry/40 bg-berry/10 text-berry"
                  : chainFailed
                    ? "chip border-rust/40 bg-rust/10 text-rust"
                    : "chip border-amber/40 bg-amber/10 text-amber-soft"
            }
          >
            {!chainConfigured
              ? "Not configured"
              : committed
                ? "Committed to Solana"
                : chainFailed
                  ? "Update failed"
                  : "Pending"}
          </span>
        </div>

        <p className="mt-1.5 text-[11.5px] leading-relaxed text-sage/55">
          {!chainConfigured
            ? "No MagicBlock completion counter is configured on this server. The quest, payout and demo coupon still work; an operator can enable the counter with ARG_COUNTER_PROGRAM_ID."
            : committed
              ? "Your verified completion incremented a campaign counter on a MagicBlock Ephemeral Rollup, then committed that state back to Solana. The counter is a PDA of the demo program; the committed value is readable on the base layer."
              : chainFailed
                ? "The completion was verified, but the MagicBlock counter update did not finish. The error is recorded below. The reward and coupon are separate and unaffected."
                : "The MagicBlock counter update is still being confirmed. Refresh this page in a moment."}
        </p>

        {chainConfigured ? (
          <>
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
                label="Delegate (base layer)"
                value={chain.delegateSignature ?? "—"}
                link={chain.delegateSignature ? explorerTx(chain.delegateSignature) : undefined}
              />
              <ChainRow
                label="ER increment · verify"
                value={chain.incrementSignature ?? "—"}
                link={
                  chain.incrementSignature
                    ? erVerificationPath(chain.incrementSignature, chain.erEndpoint)
                    : undefined
                }
              />
              <ChainRow
                label="ER commit · verify"
                value={chain.commitSignature ?? "—"}
                link={
                  chain.commitSignature
                    ? erVerificationPath(chain.commitSignature, chain.erEndpoint)
                    : undefined
                }
              />
              <ChainRow
                label="Counter value"
                value={
                  chain.committedValue !== null
                    ? `${chain.committedValue} verified completion${chain.committedValue === 1 ? "" : "s"} (base layer)`
                    : chain.counterValue !== null
                      ? `${chain.counterValue} on the ER, not yet committed`
                      : "—"
                }
              />
              <ChainRow label="ER endpoint" value={chain.erEndpoint ?? "—"} />
            </div>

            <p className="mt-2 text-[10.5px] leading-relaxed text-sage/40">
              The ER increment and commit are Ephemeral Rollup transactions, not base-layer Devnet
              transactions, so they are verified against the ER endpoint recorded for this run. The
              Magic Router may delegate to a different region and endpoint than the example
              configuration, which is why the recorded endpoint is shown above.
            </p>
          </>
        ) : null}

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
