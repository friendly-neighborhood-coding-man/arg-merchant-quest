import Link from "next/link";
import type { Metadata } from "next";
import { EvidenceReview } from "@/components/evidence-review";
import { PageHeader } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import { listPendingEvidence, listReviewedEvidence } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evidence queue",
  description: "Review player-submitted evidence before a completion is verified.",
};

const KIND_LABEL: Record<string, string> = {
  camera: "In-app camera",
  upload: "Uploaded photo",
  simulation: "Simulated capture",
};

export default function EvidenceQueuePage() {
  const pending = listPendingEvidence();
  const reviewed = listReviewedEvidence();

  return (
    <div className="wrap space-y-8 pt-10">
      <PageHeader
        eyebrow="Operator console"
        title="Evidence queue"
        description="Every completion needs a person. Open the photo, compare it with the merchant's private target description, and approve or send it back with a note. Nothing here is auto-verified, and a simulated capture is never treated as proof of presence."
        actions={
          <Link href="/operator" className="btn-ghost">
            Review desk
          </Link>
        }
      />

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-white/90">Waiting for a decision</h2>
            <p className="text-[12px] text-sage/55">Oldest submission first.</p>
          </div>
          <span className="font-mono text-[11px] text-amber/80">{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <div className="panel-flat mt-3 px-5 py-8">
            <p className="font-display text-lg text-white/80">Queue clear</p>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-sage/65">
              No evidence is waiting. Play a published trail through to the photo step to put one
              here — the player&apos;s submission is stored immediately, with its timestamp and any
              location the player chose to share.
            </p>
            <Link href="/quests" className="btn-ghost mt-4">
              Player view
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-4">
            {pending.map((item) => (
              <li key={item.evidence.id} className="panel overflow-hidden">
                <div className="grid gap-4 p-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-xl border border-line bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/evidence/${item.evidence.id}/photo`}
                      alt={`Evidence submitted for ${item.campaignTitle}`}
                      className="h-auto w-full"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip border-line text-sage/60">
                        {KIND_LABEL[item.evidence.kind] ?? item.evidence.kind}
                      </span>
                      {item.evidence.kind === "simulation" ? (
                        <span className="chip border-rust/40 bg-rust/10 text-rust">
                          Simulation · not proof
                        </span>
                      ) : null}
                      {item.evidence.location ? (
                        <span className="chip border-mint/30 text-mint">Location shared</span>
                      ) : (
                        <span className="chip border-line text-sage/50">No location</span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-xl leading-tight text-white/95">
                      {item.campaignTitle}
                    </h3>
                    <p className="text-[12px] text-sage/55">
                      {item.shopName} · player{" "}
                      <span className="font-mono text-[10.5px] text-sage/45">
                        {item.evidence.playerId.slice(-8)}
                      </span>
                    </p>

                    <dl className="mt-3 grid gap-2 border-t border-line/60 pt-3 text-[12px] sm:grid-cols-2">
                      <div>
                        <dt className="mono-label text-[9px]">Private target</dt>
                        <dd className="mt-0.5 text-sage/80">{item.targetObject}</dd>
                      </div>
                      <div>
                        <dt className="mono-label text-[9px]">Counter answer</dt>
                        <dd className="mt-0.5 text-sage/80">
                          {item.answerQuestion} → <span className="text-amber">{item.answer}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="mono-label text-[9px]">Submitted</dt>
                        <dd className="mt-0.5 text-sage/80">
                          {formatDateTime(item.evidence.createdAt)} ·{" "}
                          {timeAgo(item.evidence.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="mono-label text-[9px]">Captured</dt>
                        <dd className="mt-0.5 text-sage/80">
                          {formatDateTime(item.evidence.capturedAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="mono-label text-[9px]">Answer solved</dt>
                        <dd className="mt-0.5 text-sage/80">{timeAgo(item.solvedAt)}</dd>
                      </div>
                      <div>
                        <dt className="mono-label text-[9px]">Location</dt>
                        <dd className="mt-0.5 font-mono text-[11px] text-sage/70">
                          {item.evidence.location
                            ? `${item.evidence.location.lat.toFixed(5)}, ${item.evidence.location.lng.toFixed(5)}${
                                item.evidence.location.accuracy !== null
                                  ? ` ±${Math.round(item.evidence.location.accuracy)}m`
                                  : ""
                              }`
                            : "Not shared"}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-2 text-[11px] leading-relaxed text-sage/45">
                      A photo and coordinates suggest where a player was; they do not prove it.
                      Approve only if the photo shows the target object a visitor could reach.
                    </p>

                    <EvidenceReview evidenceId={item.evidence.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl text-white/90">Recent decisions</h2>
        <p className="text-[12px] text-sage/55">
          Rejected evidence leaves the session open so the player can submit again.
        </p>
        {reviewed.length === 0 ? (
          <p className="panel-flat mt-3 px-4 py-6 text-sm text-sage/60">No decisions yet.</p>
        ) : (
          <ul className="panel mt-3 divide-y divide-line/60">
            {reviewed.map((item) => (
              <li
                key={item.evidence.id}
                className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] text-white/85">
                    {item.campaignTitle}
                    <span className="ml-2 font-mono text-[10px] tracking-wide text-sage/40">
                      {KIND_LABEL[item.evidence.kind] ?? item.evidence.kind}
                    </span>
                  </p>
                  <p className="text-[11.5px] text-sage/50">
                    {item.shopName} · {formatDateTime(item.evidence.reviewedAt)}
                    {item.evidence.reviewNote ? ` · “${item.evidence.reviewNote}”` : ""}
                  </p>
                </div>
                <span
                  className={
                    item.evidence.status === "approved"
                      ? "chip shrink-0 border-mint/40 bg-mint/10 text-mint"
                      : "chip shrink-0 border-rust/40 bg-rust/10 text-rust"
                  }
                >
                  {item.evidence.status === "approved" ? "Approved" : "Sent back"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
