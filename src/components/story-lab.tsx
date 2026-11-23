"use client";

import { useState } from "react";
import type { StoryConcept, StoryLabResult } from "@/lib/story-lab";
import { conceptToCampaignDraft } from "@/lib/story-draft";

/**
 * Merchant story lab. Generates draft concepts only — it never creates or
 * publishes a campaign. Facts supplied by the merchant are labelled as such;
 * invented backstory is fiction. No external research is performed.
 */
export function StoryLab({ merchantName }: { merchantName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StoryLabResult | null>(null);
  const [form, setForm] = useState({
    businessName: merchantName,
    location: "",
    history: "",
    product: "",
    season: "",
    props: "",
    atmosphere: "",
    sourceUrl: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function useConcept(concept: StoryConcept) {
    const draft = conceptToCampaignDraft(concept, form, merchantName);
    sessionStorage.setItem("arg.storyDraft", JSON.stringify(draft));
    // Reload the existing form page so it can merge the draft once. Nothing is
    // saved or published until the merchant reviews and presses Save.
    window.location.assign("/merchant/campaigns/new?lab=1#campaign-form");
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/merchant/story-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as StoryLabResult & { error?: string };
      if (!response.ok) setError(data.error ?? "The draft generator could not run.");
      else setResult(data);
    } catch {
      setError("Network error — no drafts were generated.");
    }
    setBusy(false);
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label">Story lab · optional</p>
        <span className="chip border-line text-sage/60">Draft ideas only</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mt-2 font-display text-2xl text-white/95">Find a mystery for your shop.</h2>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-sage/65">
            Give the lab a product, a season and the props you actually have. It proposes draft ARG
            concepts; every one still needs your review, and nothing is published automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="btn-ghost py-2 text-[12.5px]"
        >
          {open ? "Hide story lab" : "Open story lab"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="lab-business">Business name</label>
              <input
                id="lab-business"
                className="input"
                value={form.businessName}
                onChange={(event) => update("businessName", event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="lab-location">Location</label>
              <input
                id="lab-location"
                className="input"
                value={form.location}
                onChange={(event) => update("location", event.target.value)}
                placeholder="Mangwon-dong, Seoul"
              />
            </div>
            <div>
              <label className="label" htmlFor="lab-product">Signature product</label>
              <input
                id="lab-product"
                className="input"
                value={form.product}
                onChange={(event) => update("product", event.target.value)}
                placeholder="A pour-over flight, a book, a record…"
              />
            </div>
            <div>
              <label className="label" htmlFor="lab-season">Season or dates</label>
              <input
                id="lab-season"
                className="input"
                value={form.season}
                onChange={(event) => update("season", event.target.value)}
                placeholder="Late autumn, the shop's anniversary…"
              />
            </div>
            <div>
              <label className="label" htmlFor="lab-props">Physical props on hand</label>
              <input
                id="lab-props"
                className="input"
                value={form.props}
                onChange={(event) => update("props", event.target.value)}
                placeholder="Cup sleeves, receipt inserts, shelf labels…"
              />
            </div>
            <div>
              <label className="label" htmlFor="lab-atmosphere">Desired atmosphere</label>
              <input
                id="lab-atmosphere"
                className="input"
                value={form.atmosphere}
                onChange={(event) => update("atmosphere", event.target.value)}
                placeholder="Quiet, wry, a little haunted"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="lab-history">
              Business or brand history you can verify
            </label>
            <textarea
              id="lab-history"
              className="input min-h-[80px]"
              value={form.history}
              onChange={(event) => update("history", event.target.value)}
              maxLength={900}
              placeholder="Only facts you can stand behind. The lab will label them as merchant-provided; it will not invent a source."
            />
          </div>
          <div>
            <label className="label" htmlFor="lab-source">Source URL (optional)</label>
            <input
              id="lab-source"
              className="input"
              value={form.sourceUrl}
              onChange={(event) => update("sourceUrl", event.target.value)}
              placeholder="https://…"
            />
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || !form.businessName.trim() || !form.product.trim()}
            className="btn-primary w-full py-2.5 sm:w-auto"
          >
            {busy ? "Drafting concepts…" : "Draft three concepts"}
          </button>
          {error ? <p className="text-[12.5px] text-rust">{error}</p> : null}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-3">
          <div
            className={`rounded-xl border px-4 py-3 text-[11.5px] leading-relaxed ${
              result.mode === "live"
                ? "border-mint/30 bg-mint/[0.06] text-mint/85"
                : "border-amber/30 bg-amber/[0.05] text-amber/80"
            }`}
          >
            <p className="font-semibold">
              {result.mode === "live"
                ? `Live AI drafts${result.model ? ` · ${result.model}` : ""}`
                : "Local draft assistant (no AI key configured)"}
            </p>
            <p className="mt-1">{result.note}</p>
            <p className="mt-1 text-sage/55">
              Merchant-provided facts stay merchant-provided. No historical claim here has been
              independently verified, and nothing below is published.
            </p>
          </div>

          {result.concepts.map((concept, index) => (
            <article key={`${concept.title}-${index}`} className="rounded-xl border border-line/70 bg-ink-soft/50 p-4">
              <p className="mono-label text-[9px] text-amber/70">Draft concept {index + 1}</p>
              <h3 className="mt-1 font-display text-xl leading-snug text-white/95">{concept.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-sage/70">{concept.premise}</p>
              <button
                type="button"
                onClick={() => useConcept(concept)}
                className="btn-primary mt-3 w-full py-2 text-[12px] sm:w-auto"
              >
                Use this concept →
              </button>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-sage/45">
                Opens the existing campaign form with an editable draft. Required fields the concept
                cannot supply are marked INCOMPLETE; nothing is saved or published.
              </p>
              <dl className="mt-3 space-y-2 text-[12px] leading-relaxed">
                <div>
                  <dt className="mono-label text-[9px]">Online clues</dt>
                  <dd className="mt-0.5 text-sage/75">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {concept.onlineClues.map((clue) => (
                        <li key={clue}>{clue}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt className="mono-label text-[9px]">In-store observation</dt>
                  <dd className="mt-0.5 text-sage/75">{concept.instoreObservation}</dd>
                </div>
                <div>
                  <dt className="mono-label text-[9px]">Product-contained clue</dt>
                  <dd className="mt-0.5 text-sage/75">{concept.productClue}</dd>
                </div>
                <div>
                  <dt className="mono-label text-[9px]">Basic puzzle</dt>
                  <dd className="mt-0.5 text-sage/75">{concept.basicPuzzle}</dd>
                </div>
                <div>
                  <dt className="mono-label text-[9px]">Hidden ending</dt>
                  <dd className="mt-0.5 text-sage/75">{concept.hiddenEnding}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
