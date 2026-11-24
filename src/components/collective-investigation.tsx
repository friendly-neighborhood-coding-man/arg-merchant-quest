"use client";

import type { QuestView } from "@/lib/quest-store";

/**
 * P2 shared investigation display.
 *
 * Personal progress and the campaign-wide MagicBlock milestone are shown as
 * separate things on purpose. The milestone counts eligible clue handoffs, not
 * unique people, and it is read from the campaign's Ephemeral Rollup account on
 * every request. The shared evidence text is only present in this component's
 * props when the server-side gate is unlocked, so a locked page cannot leak it.
 */

const TONE = {
  unlocked: "border-mint/35 bg-mint/[0.08] text-mint/90",
  first: "border-amber/35 bg-amber/[0.07] text-amber/85",
  none: "border-line/80 bg-ink/60 text-sage/60",
  unavailable: "border-rust/30 bg-rust/[0.06] text-rust/80",
} as const;

const LABEL = {
  unlocked: "Shared evidence unlocked",
  first: "1 handoff · still locked",
  none: "No collective record yet",
  unavailable: "Chain unavailable",
} as const;

function askMara(message: string) {
  window.dispatchEvent(new CustomEvent("arg:ask-mara", { detail: { message } }));
}

function personalLine(view: QuestView): string {
  const parts = [
    `${view.trail.onlineRead}/${view.trail.onlineTotal} online`,
    `${view.trail.instoreRead}/${view.trail.instoreTotal} in store`,
  ];
  if (view.optional.claim) {
    parts.push(`clue ${view.optional.clue ? "released to you" : "held by staff"}`);
  } else if (view.completion) {
    parts.push(view.extended.solved ? "optional deduction solved" : "optional trail open");
  }
  parts.push(view.optional.final.solved ? "ending found" : "ending locked");
  return parts.join(" · ");
}

export function CollectiveInvestigation({ view }: { view: QuestView }) {
  const state = view.collective;
  const phase = state?.phase ?? "unavailable";
  const unlocked = phase === "unlocked" && Boolean(state?.evidence);

  return (
    <section id="shared-investigation" className="scroll-mt-24 panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label text-[9px] text-berry/80">Investigation · shared</p>
        <span className={`chip ${TONE[phase]}`}>
          {state ? LABEL[phase] : "MagicBlock ER · not read"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-line/70 bg-ink-soft/50 px-3 py-2">
          <p className="mono-label text-[8.5px]">Your progress</p>
          <p className="mt-1 text-[11.5px] leading-relaxed break-words text-sage/75">
            {personalLine(view)}
          </p>
        </div>
        <div className="rounded-lg border border-line/70 bg-ink-soft/50 px-3 py-2">
          <p className="mono-label text-[8.5px]">Collective MagicBlock milestone</p>
          <p className="mt-1 text-[11.5px] leading-relaxed break-words text-sage/75">
            {state
              ? state.count === null
                ? `No verified count · ${state.threshold} eligible handoffs unlock shared evidence`
                : `${state.count} eligible handoff${state.count === 1 ? "" : "s"} · ${Math.max(0, state.threshold - state.count)} more to unlock`
              : "Not read in this view"}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed break-words text-sage/40">
            Counts handoffs, not unique people.
          </p>
        </div>
      </div>

      <p className="mt-2 font-mono text-[10px] leading-relaxed break-words text-sage/45">
        {state
          ? `ER live ${state.erLive ?? "—"} · Solana committed ${state.committed ?? "—"}${
              state.stale ? " · ER behind commit" : ""
            }${state.erEndpoint ? ` · ${state.erEndpoint.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : ""}`
          : "ER live — · Solana committed —"}
      </p>

      {state?.error && state.phase === "unavailable" ? (
        <p className="mt-1 text-[10.5px] leading-relaxed text-rust/75">
          {state.error} The trail and its scripted guidance still work; only new collective evidence
          stays locked.
        </p>
      ) : null}

      {unlocked && state?.evidence ? (
        <div className="rise mt-3 rounded-xl border border-mint/35 bg-mint/[0.05] p-3.5">
          <p className="mono-label text-[8.5px] text-mint/75">Story event · second verified handoff</p>
          <p className="mt-1 font-display text-lg leading-snug text-white/95">
            {state.evidence.title}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-sage/80">{state.evidence.text}</p>
          <p className="mt-2 text-[10px] leading-relaxed text-sage/40">{state.evidence.source}.</p>
          <button
            type="button"
            onClick={() =>
              askMara(
                "Revisit my earlier theories with the shared investigation evidence. Which assumption does it challenge?",
              )
            }
            className="btn-ghost mt-3 py-2 text-[12px]"
          >
            Ask Mara to revisit the earlier theories →
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-sage/50">
          {phase === "unavailable"
            ? "Shared evidence is locked. An unavailable or unreadable Ephemeral Rollup cannot authorise new collective content."
            : phase === "none"
              ? `Shared evidence is locked. It needs ${state?.threshold ?? 2} verified clue handoffs on this campaign's MagicBlock milestone.`
              : phase === "first"
                ? "Shared evidence is locked until a second verified handoff is recorded. Mara will not use it before then."
                : "This campaign has reached the collective milestone but has no shared evidence fragment; nothing is invented for it."}
        </p>
      )}
    </section>
  );
}
