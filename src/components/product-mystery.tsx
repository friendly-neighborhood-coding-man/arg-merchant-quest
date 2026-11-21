"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuestView } from "@/lib/quest-store";
import { formatDateTime } from "@/lib/format";

function erLink(signature: string, endpoint: string | null): string {
  return `/chain/er/${signature}${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`;
}

/**
 * P1 product-clue mystery. The final clue is not in this component's data until
 * the server view says staff released it; the order reference is the only thing
 * the player carries to the counter. No payment is processed.
 */
export function ProductMystery({ slug, view }: { slug: string; view: QuestView }) {
  const router = useRouter();
  const optional = view.optional;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState<string | null>(null);

  if (!view.completion || optional.mode !== "product_clue" || !view.extended.solved) return null;

  const claim = optional.claim;
  const released = claim?.status === "handed_off";

  async function requestProduct() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/quests/${slug}/product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setError(data.error ?? "The product request could not be recorded.");
      else router.refresh();
    } catch {
      setError("Network error — the product request was not recorded.");
    }
    setBusy(false);
  }

  async function submitFinal() {
    setBusy(true);
    setAnswerError(null);
    try {
      const response = await fetch(`/api/quests/${slug}/product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "final", answer }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setAnswerError(data.error ?? "That answer was not accepted.");
      } else {
        setAnswer("");
        router.refresh();
      }
    } catch {
      setAnswerError("Network error — the answer was not checked.");
    }
    setBusy(false);
  }

  return (
    <section id="product-mystery" className="scroll-mt-24 space-y-4">
      <div className="panel border-amber/35 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mono-label text-amber/80">Optional · the product clue</p>
          <span className="chip border-amber/35 bg-amber/10 text-amber-soft">
            {optional.final.solved ? "Hidden ending found" : released ? "Clue released" : "Step 2 of 3"}
          </span>
        </div>
        <h2 className="mt-2 font-display text-2xl text-white/95">The last clue is in the product.</h2>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
          The free reward never depended on this. The optional trail ends with a physical prop inside{" "}
          <span className="text-white/85">{optional.productName}</span> — a simulated order at the
          counter, not a real purchase. Staff release the clue once, after you show your reference.
        </p>

        <ol className="mt-4 grid gap-2 text-[12px] sm:grid-cols-3">
          {[
            ["1 · Deduction", "Solved", true],
            ["2 · Product handoff", claim ? (released ? "Released" : "Reference issued") : "Not requested", Boolean(claim)],
            ["3 · Hidden ending", optional.final.solved ? "Found" : "Locked", optional.final.solved],
          ].map(([label, state, done]) => (
            <li
              key={String(label)}
              className={`rounded-xl border px-3.5 py-2.5 ${
                done ? "border-mint/30 bg-mint/[0.06]" : "border-line/70 bg-ink-soft/50"
              }`}
            >
              <p className="mono-label text-[9px]">{label}</p>
              <p className={`mt-1 text-[12.5px] ${done ? "text-mint" : "text-sage/60"}`}>{state}</p>
            </li>
          ))}
        </ol>

        {error ? <p className="mt-3 text-[12.5px] text-rust">{error}</p> : null}

        {!claim ? (
          <div className="mt-4 rounded-xl border border-amber/25 bg-amber/[0.06] p-4">
            <p className="text-[13px] leading-relaxed text-sage/80">
              Request the <span className="text-white/90">{optional.productName}</span>
              {optional.priceLabel ? (
                <span className="text-sage/55"> · demo price {optional.priceLabel}</span>
              ) : null}
              . You will get an order reference to show at the counter. Nothing is charged, and no
              real order is placed.
            </p>
            <button
              type="button"
              onClick={() => void requestProduct()}
              disabled={busy}
              className="btn-primary mt-3 w-full py-2.5 sm:w-auto"
            >
              {busy ? "Creating reference…" : "Request the signature product (demo)"}
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-line/80 bg-ink/70 p-4">
            <p className="mono-label text-[9px]">Your product-claim reference</p>
            <p className="mt-1 font-mono text-[22px] leading-none tracking-[0.12em] text-amber-soft">
              {claim.reference}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-sage/70">
              {released
                ? `Released ${formatDateTime(claim.handedOffAt)}${claim.handedOffBy ? ` by ${claim.handedOffBy}` : ""}. The clue is below.`
                : "Show this reference at the staff counter. Staff confirm the fictional serving condition once; the clue then appears here."}
            </p>
            {!released ? (
              <Link href="/staff" className="btn-ghost mt-3 inline-block py-2 text-[12.5px]">
                Open the staff counter →
              </Link>
            ) : null}
            {claim.chain?.counterAccount ? (
              <div className="mt-3 border-t border-line/60 pt-2.5 text-[11px] leading-relaxed text-sage/50">
                MagicBlock clue milestone:{" "}
                <span className={claim.chain.committedValue !== null ? "text-mint/80" : "text-amber/80"}>
                  {claim.chain.status ?? "pending"}
                  {claim.chain.committedValue !== null
                    ? ` · committed value ${claim.chain.committedValue}`
                    : ""}
                </span>
                {claim.chain.incrementSignature ? (
                  <>
                    {" · "}
                    <a
                      className="link"
                      href={erLink(claim.chain.incrementSignature, claim.chain.erEndpoint)}
                    >
                      verify ER update
                    </a>
                  </>
                ) : null}
                {claim.chain.error ? (
                  <span className="block text-amber/70">
                    Local handoff stands; ER milestone unavailable: {claim.chain.error}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {released && optional.clue ? (
        <div className="rise overflow-hidden rounded-2xl border border-amber/45 bg-gradient-to-b from-amber/[0.08] to-ink-soft/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-amber/25 px-5 py-3">
            <div>
              <p className="mono-label text-[9px] text-amber/80">Digital prop simulation</p>
              <p className="text-[11px] text-sage/55">{optional.productName} · {view.campaign.shopName}</p>
            </div>
            <span className="chip border-amber/35 text-amber/80">Not a real product</span>
          </div>

          <div className="p-5">
            <div className="mx-auto max-w-sm rotate-[-0.6deg] rounded-[6px] border border-[#c9b48a]/40 bg-[#d8c39a] px-5 py-6 text-[#2b2419] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              <div className="flex items-start justify-between border-b border-[#2b2419]/25 pb-3">
                <div>
                  <p className="font-mono text-[9px] tracking-[0.2em] uppercase opacity-70">
                    {view.campaign.shopName} · {view.campaign.shopArea}
                  </p>
                  <p className="mt-1 font-display text-[22px] leading-none">
                    {view.campaign.title}
                  </p>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-full border border-[#2b2419]/50">
                  <span className="text-[18px]">≈</span>
                </div>
              </div>
              <p className="mt-4 font-mono text-[9px] leading-relaxed tracking-[0.14em] uppercase opacity-70">
                Keep this prop. The trail continues at the counter.
              </p>
              <p className="mt-3 text-[13px] leading-snug font-semibold">{optional.clue.text}</p>
              <div className="mt-4 flex items-end justify-between border-t border-[#2b2419]/25 pt-3">
                <p className="font-mono text-[8px] tracking-[0.18em] uppercase opacity-60">
                  Demo prop · not for sale
                </p>
                <p className="font-mono text-[9px] tracking-[0.2em]">SIGNATURE · DEMO</p>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-sage/45">
              Simulation of the physical prop a player would receive with the demo order. The
              physical clue is not visible in the page before staff release.
            </p>
          </div>
        </div>
      ) : null}

      {released && !optional.final.solved ? (
        <div className="panel border-amber/35 p-5">
          <p className="mono-label text-amber/80">The hidden ending</p>
          <h3 className="mt-1 font-display text-xl text-white/95">{optional.final.question}</h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-sage/65">
            Wrong answers cost nothing and reveal nothing. The server checks the final number; the
            free reward is unaffected.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="input"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && answer.trim()) void submitFinal();
              }}
              placeholder="Your final number"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Final answer"
            />
            <button
              type="button"
              onClick={() => void submitFinal()}
              disabled={busy || answer.trim().length === 0}
              className="btn-primary shrink-0 py-2.5"
            >
              {busy ? "Checking…" : "Open the ending"}
            </button>
          </div>
          {answerError ? <p className="mt-2 text-[12.5px] text-rust">{answerError}</p> : null}
          {optional.final.attempts > 0 ? (
            <p className="mt-2 text-[11.5px] text-sage/45">
              {optional.final.attempts} attempt{optional.final.attempts === 1 ? "" : "s"} so far. No
              penalty, no lost reward.
            </p>
          ) : null}
        </div>
      ) : null}

      {optional.final.solved ? (
        <div className="rise overflow-hidden rounded-2xl border border-mint/45 bg-gradient-to-b from-mint/[0.12] to-ink-soft/80">
          <div className="border-b border-mint/20 px-5 py-3">
            <p className="mono-label text-[9px] text-mint/80">Hidden ending · unlocked</p>
            <h3 className="mt-1 font-display text-3xl leading-tight text-white/95">
              {optional.final.endingTitle}
            </h3>
          </div>
          <div className="px-5 py-5">
            <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-sage/85">
              {optional.final.endingBody}
            </p>
            <div className="mt-5 rounded-xl border border-mint/25 bg-mint/[0.06] p-4">
              <p className="mono-label text-[9px] text-mint/70">Achievement</p>
              <p className="mt-1 font-display text-xl text-white/95">{optional.final.achievementTitle}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-sage/65">
                {optional.final.achievementBody}
              </p>
              <p className="mt-2 text-[11px] text-sage/40">
                Earned {formatDateTime(optional.final.solvedAt)} · no extra Devnet reward, and nothing
                here depends on being first.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/quests#achievements" className="btn-ghost py-2 text-[12.5px]">
                See all achievements
              </Link>
              <Link href="/staff" className="btn-ghost py-2 text-[12.5px]">
                Staff counter
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
