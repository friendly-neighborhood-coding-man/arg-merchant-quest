"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTimeKst } from "@/lib/format";

interface Lookup {
  claim: {
    reference: string;
    productName: string;
    priceLabel: string;
    status: "requested" | "handed_off";
    requestedAt: string;
    handedOffAt: string | null;
    handedOffBy: string | null;
    chainStatus: string | null;
    chainCounterAccount: string | null;
    chainErEndpoint: string | null;
    chainCommittedValue: number | null;
    chainError: string | null;
  };
  campaign: {
    title: string;
    shopName: string;
    shopArea: string;
    prop: string;
  };
}

type HandoffResponse = {
  ok?: boolean;
  status?: string;
  handedOffAt?: string;
  handedOffBy?: string;
  chain?: {
    status: string;
    counterAccount: string;
    incrementSignature: string | null;
    commitSignature: string | null;
    committedValue: number | null;
    erEndpoint: string;
    error: string | null;
  } | null;
  chainNote?: string | null;
  error?: string;
};

function erLink(signature: string, endpoint: string | null): string {
  return `/chain/er/${signature}${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`;
}

/**
 * P1 staff-side product-clue handoff. The reference is a demo order reference,
 * not a payment. Confirming releases the final clue once and, when the ER is
 * reachable, records a real MagicBlock milestone for the AI companion.
 */
export function StaffHandoff() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [staffName, setStaffName] = useState("staff.demo");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HandoffResponse | null>(null);
  const [busy, setBusy] = useState<"lookup" | "handoff" | null>(null);

  async function find() {
    setBusy("lookup");
    setError(null);
    setResult(null);
    setLookup(null);
    setConfirmed(false);
    try {
      const response = await fetch(
        `/api/product-claims/lookup?reference=${encodeURIComponent(reference)}`,
      );
      const data = (await response.json().catch(() => ({}))) as Lookup & { error?: string };
      if (!response.ok || !data.claim) {
        setError(data.error ?? "That product claim could not be found.");
      } else {
        setLookup(data);
        setReference(data.claim.reference);
      }
    } catch {
      setError("Network error — the product claim was not looked up.");
    }
    setBusy(null);
  }

  async function handoff() {
    if (!lookup) return;
    setBusy("handoff");
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/product-claims/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: lookup.claim.reference,
          staffName,
          handoffConfirmed: confirmed,
          note,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as HandoffResponse;
      if (!response.ok) {
        setError(data.error ?? "The clue handoff was not recorded.");
      } else {
        setResult(data);
        setConfirmed(false);
        setNote("");
        setLookup((current) =>
          current
            ? {
                ...current,
                claim: {
                  ...current.claim,
                  status: "handed_off",
                  handedOffAt: data.handedOffAt ?? current.claim.handedOffAt,
                  handedOffBy: data.handedOffBy ?? current.claim.handedOffBy,
                  chainStatus: data.chain?.status ?? current.claim.chainStatus,
                  chainCounterAccount:
                    data.chain?.counterAccount ?? current.claim.chainCounterAccount,
                  chainCommittedValue:
                    data.chain?.committedValue ?? current.claim.chainCommittedValue,
                  chainErEndpoint: data.chain?.erEndpoint ?? current.claim.chainErEndpoint,
                  chainError: data.chain?.error ?? null,
                },
              }
            : current,
        );
        router.refresh();
      }
    } catch {
      setError("Network error — the clue handoff was not recorded.");
    }
    setBusy(null);
  }

  const canHandoff =
    lookup !== null && lookup.claim.status === "requested" && confirmed && busy === null;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label">Product clue · staff handoff</p>
        <span className="chip border-line text-sage/60">Demo order reference</span>
      </div>
      <h2 className="mt-2 font-display text-2xl text-white/95">Release the clue in the product.</h2>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
        A player shows the reference from their optional trail. Look it up, read the fictional
        product condition, and confirm the one-time handoff. No payment is processed and nothing here
        claims a real sale.
      </p>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (reference.trim()) void find();
        }}
      >
        <input
          className="input font-mono tracking-[0.1em] uppercase"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="CLUE-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          aria-label="Product claim reference"
        />
        <button
          type="submit"
          disabled={busy !== null || reference.trim().length < 4}
          className="btn-ghost shrink-0 py-2.5"
        >
          {busy === "lookup" ? "Looking up…" : "Look up reference"}
        </button>
      </form>

      {error ? (
        <div className="mt-3 rounded-xl border border-rust/40 bg-rust/10 px-3.5 py-2.5">
          <p className="text-[12.5px] font-semibold text-rust">Not released</p>
          <p className="mt-1 break-words text-[12px] leading-relaxed text-rust/85">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-xl border border-mint/40 bg-mint/10 px-3.5 py-2.5">
          <p className="text-[12.5px] font-semibold text-mint">Product clue released</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mint/85">
            The player can now read the final clue. The same reference cannot release it twice.
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-mint/70">
            Tell the player the clue is now on their trail. Nothing was charged and no real order
            was placed.
          </p>
          {result.chainNote ? (
            <p className="mt-2 text-[11.5px] leading-relaxed text-amber/80">{result.chainNote}</p>
          ) : result.chain?.committedValue !== null && result.chain ? (
            <details className="mt-2 text-[11px] text-mint/70">
              <summary className="cursor-pointer text-sage/50">
                Optional technical record · MagicBlock milestone
              </summary>
              <p className="mt-1.5 leading-relaxed">
                This handoff was recorded as game state on the demo MagicBlock counter (campaign
                count {result.chain.committedValue}). It is not proof of a purchase.
              </p>
              {result.chain.incrementSignature ? (
                <a
                  className="link"
                  href={erLink(result.chain.incrementSignature, result.chain.erEndpoint)}
                >
                  Verify ER increment
                </a>
              ) : null}
              {result.chain.commitSignature ? (
                <>
                  {" · "}
                  <a
                    className="link"
                    href={erLink(result.chain.commitSignature, result.chain.erEndpoint)}
                  >
                    Verify commit
                  </a>
                </>
              ) : null}
            </details>
          ) : null}
        </div>
      ) : null}

      {lookup ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-amber/30 bg-amber/[0.05] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="mono-label text-[9px] text-amber/75">Reference</p>
                <p className="mt-1 font-mono text-[18px] tracking-[0.12em] break-all text-amber-soft">
                  {lookup.claim.reference}
                </p>
              </div>
              <span
                className={`chip ${
                  lookup.claim.status === "handed_off"
                    ? "border-mint/40 bg-mint/10 text-mint"
                    : "border-amber/35 bg-amber/10 text-amber-soft"
                }`}
              >
                {lookup.claim.status === "handed_off" ? "Already released" : "Awaiting handoff"}
              </span>
            </div>
            <dl className="mt-3 grid gap-3 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="mono-label text-[9px]">Fictional product</dt>
                <dd className="mt-1 text-white/85">{lookup.claim.productName}</dd>
                <dd className="text-[11px] text-sage/50">{lookup.claim.priceLabel}</dd>
              </div>
              <div>
                <dt className="mono-label text-[9px]">Trail</dt>
                <dd className="mt-1 text-white/85">{lookup.campaign.title}</dd>
                <dd className="text-[11px] text-sage/50">
                  {lookup.campaign.shopName} · {lookup.campaign.shopArea}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-[9px]">Requested</dt>
                <dd className="mt-1 text-white/80">{formatDateTimeKst(lookup.claim.requestedAt)} KST</dd>
              </div>
              <div>
                <dt className="mono-label text-[9px]">Prop</dt>
                <dd className="mt-1 text-white/80">{lookup.campaign.prop}</dd>
              </div>
            </dl>
          </div>

          {lookup.claim.status === "requested" ? (
            <div className="rounded-xl border border-line/80 bg-ink-soft/60 p-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber/25 bg-amber/[0.06] p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-amber"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span className="text-[12px] leading-relaxed text-sage/80">
                  I confirm that the fictional signature-product order or serving condition for this
                  demonstration was met, and that I am handing the printed prop to the player now. No
                  real payment is processed and no real sale is verified.
                </span>
              </label>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="handoff-staff">
                    Staff identity
                  </label>
                  <input
                    id="handoff-staff"
                    className="input"
                    value={staffName}
                    onChange={(event) => setStaffName(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="handoff-note">
                    Note (optional)
                  </label>
                  <input
                    id="handoff-note"
                    className="input"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. product handed over at the counter"
                    maxLength={200}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handoff()}
                disabled={!canHandoff}
                className="btn-primary mt-3 w-full py-2.5"
              >
                {busy === "handoff" ? "Releasing the clue…" : "Release the product clue"}
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-sage/45">
                The clue can be released once. If the demo's optional on-chain record is unavailable,
                the clue still works; the dashboard shows the difference honestly.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line/70 bg-ink-soft/50 px-4 py-3">
              <p className="text-[12.5px] leading-relaxed text-sage/70">
                This clue was released {formatDateTimeKst(lookup.claim.handedOffAt)} KST by{" "}
                {lookup.claim.handedOffBy ?? "staff"}. Staff cannot release it a second time.
              </p>
              {lookup.claim.chainStatus ? (
                <details className="mt-1 text-[11px] leading-relaxed text-sage/50">
                  <summary className="cursor-pointer text-sage/45">
                    Optional technical record
                  </summary>
                  <p className="mt-1">
                    Demo game-state record: {lookup.claim.chainStatus}
                    {lookup.claim.chainCommittedValue !== null
                      ? ` · campaign count ${lookup.claim.chainCommittedValue}`
                      : ""}
                    {lookup.claim.chainError ? ` · ${lookup.claim.chainError}` : ""}
                  </p>
                </details>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
