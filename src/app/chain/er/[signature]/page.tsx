import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ER_RPC_URL } from "@/lib/chain/config";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ephemeral Rollup transaction check",
  description:
    "Verify a MagicBlock Ephemeral Rollup transaction against the ER endpoint recorded for this run.",
};

const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Only MagicBlock ER hosts may be queried. The endpoint comes from the URL so a
 * reviewer can check the exact region the Magic Router chose, but it must never
 * become an arbitrary server-side fetch.
 */
function safeEndpoint(raw: string | undefined): { endpoint: string; substituted: boolean } {
  const value = raw?.trim() || ER_RPC_URL;
  try {
    const url = new URL(value);
    const allowed = url.protocol === "https:" && /(^|\.)magicblock\.app$/i.test(url.hostname);
    if (!allowed) return { endpoint: ER_RPC_URL, substituted: true };
    return { endpoint: url.origin, substituted: false };
  } catch {
    return { endpoint: ER_RPC_URL, substituted: true };
  }
}

interface ErTransaction {
  slot: number;
  blockTime: number | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: Array<string | { pubkey: string }>;
      instructions: Array<{
        programIdIndex: number;
        accounts?: number[];
        data?: string;
        stackHeight?: number | null;
      }>;
    };
  };
  meta: {
    err: unknown;
    fee: number;
    computeUnitsConsumed?: number;
  } | null;
}

type Lookup =
  | { state: "verified"; transaction: ErTransaction }
  | { state: "not-found" }
  | { state: "error"; message: string };

async function fetchErTransaction(signature: string, endpoint: string): Promise<Lookup> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0, encoding: "json" }],
      }),
    });
    const body = (await response.json()) as {
      result?: ErTransaction | null;
      error?: { message?: string };
    };
    if (body.error) {
      return { state: "error", message: body.error.message ?? "The ER RPC returned an error." };
    }
    if (!body.result) return { state: "not-found" };
    return { state: "verified", transaction: body.result };
  } catch (error) {
    return {
      state: "error",
      message:
        (error as Error).name === "TimeoutError"
          ? "The ER endpoint did not answer within 15 seconds."
          : (error as Error).message || "The ER endpoint could not be reached.",
    };
  }
}

type PageProps = {
  params: Promise<{ signature: string }>;
  searchParams: Promise<{ endpoint?: string; counter?: string }>;
};

export default async function ErTransactionPage({ params, searchParams }: PageProps) {
  const { signature } = await params;
  const { endpoint: rawEndpoint, counter } = await searchParams;

  if (!SIGNATURE_PATTERN.test(signature)) {
    return (
      <div className="wrap max-w-3xl space-y-5 pt-10">
        <PageHeader
          eyebrow="Ephemeral Rollup verification"
          title="That is not a transaction signature"
          description="A Solana transaction signature is 64–100 base58 characters."
        />
        <Link href="/quests" className="btn-ghost">
          Back to the adventure
        </Link>
      </div>
    );
  }

  const { endpoint, substituted } = safeEndpoint(rawEndpoint);
  const lookup = await fetchErTransaction(signature, endpoint);
  const accountKeys =
    lookup.state === "verified"
      ? lookup.transaction.transaction.message.accountKeys.map((key) =>
          typeof key === "string" ? key : key.pubkey,
        )
      : [];
  const instructions = lookup.state === "verified" ? lookup.transaction.transaction.message.instructions : [];
  const failed = lookup.state === "verified" && Boolean(lookup.transaction.meta?.err);

  return (
    <div className="wrap max-w-4xl space-y-6 pt-10">
      <PageHeader
        eyebrow="Ephemeral Rollup verification"
        title="Check an ER transaction"
        description="This reads the transaction directly from the MagicBlock Ephemeral Rollup endpoint recorded with the completion. It is not a Solana base-layer transaction, so a normal Devnet explorer lookup correctly returns nothing."
      />

      <section
        className={`panel p-5 ${
          lookup.state === "verified"
            ? failed
              ? "border-rust/40"
              : "border-mint/40"
            : lookup.state === "not-found"
              ? "border-amber/40"
              : "border-rust/40"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mono-label">Result</p>
          <span
            className={
              lookup.state === "verified"
                ? failed
                  ? "chip border-rust/40 bg-rust/10 text-rust"
                  : "chip border-mint/40 bg-mint/10 text-mint"
                : lookup.state === "not-found"
                  ? "chip border-amber/40 bg-amber/10 text-amber-soft"
                  : "chip border-rust/40 bg-rust/10 text-rust"
            }
          >
            {lookup.state === "verified"
              ? failed
                ? "Found on ER · failed on-chain"
                : "Found on ER · confirmed"
              : lookup.state === "not-found"
                ? "Not found on this ER"
                : "Endpoint error"}
          </span>
        </div>

        <h2 className="mt-2 font-display text-2xl text-white/95">
          {lookup.state === "verified"
            ? "The Ephemeral Rollup confirms this transaction."
            : lookup.state === "not-found"
              ? "This ER endpoint has no record of it."
              : "The ER endpoint could not be queried."}
        </h2>

        {lookup.state === "not-found" ? (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-sage/70">
            Ephemeral Rollups keep recent transaction history; an older ER transaction can be pruned
            even though its effect is durable. The committed counter value on the Solana base layer is
            the permanent record. Confirm that the endpoint below is the one recorded for this run —
            the Magic Router may have chosen a different region.
          </p>
        ) : null}
        {lookup.state === "error" ? (
          <p className="mt-2 break-words text-[13px] leading-relaxed text-rust/85">{lookup.message}</p>
        ) : null}
        {substituted ? (
          <p className="mt-2 text-[12px] leading-relaxed text-amber/80">
            The requested endpoint was not a MagicBlock ER host, so this check used the configured
            default instead.
          </p>
        ) : null}

        <dl className="mt-4 grid gap-3 border-t border-line/60 pt-4 text-[12px] sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="mono-label text-[9px]">Signature</dt>
            <dd className="mt-1 font-mono text-[11px] break-all text-white/85">{signature}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="mono-label text-[9px]">Querying ER endpoint</dt>
            <dd className="mt-1 font-mono text-[11px] break-all text-white/85">{endpoint}</dd>
          </div>
          {lookup.state === "verified" ? (
            <>
              <div>
                <dt className="mono-label text-[9px]">Slot</dt>
                <dd className="mt-1 font-mono text-[12px] text-white/85">{lookup.transaction.slot}</dd>
              </div>
              <div>
                <dt className="mono-label text-[9px]">Block time</dt>
                <dd className="mt-1 text-white/85">
                  {lookup.transaction.blockTime
                    ? formatDateTime(new Date(lookup.transaction.blockTime * 1000).toISOString())
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-[9px]">Fee (lamports)</dt>
                <dd className="mt-1 font-mono text-[12px] text-white/85">
                  {lookup.transaction.meta?.fee ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-[9px]">Executed</dt>
                <dd className={failed ? "mt-1 text-rust" : "mt-1 text-mint"}>
                  {failed ? JSON.stringify(lookup.transaction.meta?.err) : "No error"}
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        {lookup.state === "verified" ? (
          <>
            <div className="mt-4 border-t border-line/60 pt-4">
              <p className="mono-label text-[9px]">Accounts ({accountKeys.length})</p>
              <ul className="mt-2 space-y-1">
                {accountKeys.map((key) => (
                  <li key={key} className="font-mono text-[10.5px] break-all text-sage/75">
                    {key}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 border-t border-line/60 pt-4">
              <p className="mono-label text-[9px]">Instructions ({instructions.length})</p>
              <ul className="mt-2 space-y-2">
                {instructions.map((instruction, index) => {
                  const program = accountKeys[instruction.programIdIndex] ?? "unknown program";
                  return (
                    <li key={`${program}-${index}`} className="panel-flat px-3 py-2">
                      <p className="text-[11px] text-sage/55">#{index + 1} · program</p>
                      <p className="mt-0.5 font-mono text-[10.5px] break-all text-white/80">
                        {program}
                      </p>
                      <p className="mt-1 font-mono text-[10px] break-all text-sage/45">
                        data: {instruction.data ?? "—"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <details className="mt-4 border-t border-line/60 pt-4">
              <summary className="cursor-pointer text-[12px] text-sage/60 hover:text-sage/85">
                Raw ER RPC response
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-line/70 bg-ink/80 p-3 font-mono text-[10px] leading-relaxed text-sage/70">
                {JSON.stringify(lookup.transaction, null, 2)}
              </pre>
            </details>
          </>
        ) : null}
      </section>

      <section className="panel-flat p-4">
        <p className="mono-label text-[9px]">How to read this</p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-sage/70">
          <li>
            The delegate and the SPL payout are ordinary Solana Devnet transactions and open in Solana
            Explorer.
          </li>
          <li>
            The ER increment and the ER commit intent were sent to a MagicBlock Ephemeral Rollup, not
            to the base layer, so they are verified here against that exact endpoint.
          </li>
          <li>
            The committed counter value is durable on the base layer. That is the permanent,
            independently readable evidence of the MagicBlock execution.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/quests" className="btn-ghost">
          Back to the adventure
        </Link>
        <a
          href={`https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(endpoint)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="btn-ghost"
        >
          Open in Solana Explorer with this ER ↗
        </a>
        {counter && ADDRESS_PATTERN.test(counter) ? (
          <a
            href={`https://explorer.solana.com/address/${counter}?cluster=devnet`}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-ghost"
          >
            Committed counter on Solana Explorer ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}
