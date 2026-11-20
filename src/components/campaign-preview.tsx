import type { Campaign } from "@/lib/types";
import { clueCount, formatDate, formatDateTime } from "@/lib/format";
import { ClueTrail, RewardLine, StatusBadge, TermSheet } from "./ui";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="mono-label text-[10px]">{label}</dt>
      <dd className="mt-1 text-[13.5px] leading-snug text-white/85">{value}</dd>
    </div>
  );
}

export function CampaignPreview({
  campaign,
  showOperatorNote = false,
  showVerification = false,
}: {
  campaign: Campaign;
  showOperatorNote?: boolean;
  /** P0.2 private block: target object, counter answer and hints. Never render
   * this on a player-facing page. */
  showVerification?: boolean;
}) {
  const onlineClues = campaign.clues.filter((clue) => clue.kind === "online");
  const instoreClues = campaign.clues.filter((clue) => clue.kind === "instore");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <section>
          <p className="mono-label">Story briefing</p>
          <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed whitespace-pre-line text-sage/85">
            {campaign.story}
          </div>
        </section>

        {showOperatorNote && campaign.operatorNote ? (
          <section className="rounded-2xl border border-amber/30 bg-amber/5 p-4">
            <p className="mono-label text-amber/80">Operator note</p>
            <p className="mt-2 text-sm leading-relaxed text-amber-soft/90">{campaign.operatorNote}</p>
            <p className="mt-2 text-[11px] text-sage/55">
              Reviewed by {campaign.reviewedBy ?? "operator"} · {formatDateTime(campaign.reviewedAt)}
            </p>
          </section>
        ) : null}

        {showOperatorNote &&
        campaign.lastRejectionNote &&
        campaign.lastRejectionNote !== campaign.operatorNote ? (
          <section className="rounded-2xl border border-rust/30 bg-rust/5 p-4">
            <p className="mono-label text-rust/80">Previous operator note</p>
            <p className="mt-2 text-sm leading-relaxed text-rust/90">{campaign.lastRejectionNote}</p>
            <p className="mt-2 text-[11px] text-sage/55">
              Sent back {formatDateTime(campaign.lastRejectionAt)} · resubmitted{" "}
              {formatDateTime(campaign.submittedAt)}
            </p>
          </section>
        ) : null}

        {showVerification ? (
          <section className="rounded-2xl border border-berry/30 bg-berry/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="mono-label text-berry/80">Private verification</p>
              <span className="chip border-berry/40 bg-berry/10 text-berry">Never shown to players</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mono-label text-[9px]">Target object</p>
                <p className="mt-1 text-[14px] leading-snug font-semibold text-white/90">
                  {campaign.targetObject}
                </p>
              </div>
              <div>
                <p className="mono-label text-[9px]">Where it is</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-sage/80">
                  {campaign.targetObjectHint}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 border-t border-berry/20 pt-3 sm:grid-cols-3">
              <div>
                <p className="mono-label text-[9px]">Counter question</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-sage/80">
                  {campaign.answerQuestion || "Not configured — the trail cannot be played."}
                </p>
              </div>
              <div>
                <p className="mono-label text-[9px]">Answer</p>
                <p className="mt-1 font-mono text-[13px] text-amber">
                  {campaign.answer || "—"}
                </p>
              </div>
              <div>
                <p className="mono-label text-[9px]">Hints (3 / 5 min)</p>
                <p className="mt-1 text-[12px] leading-relaxed text-sage/75">
                  {campaign.hint1 || "Fallback hint"} / {campaign.hint2 || "Fallback hint"}
                </p>
              </div>
            </div>
            {campaign.extAnswer ? (
              <div className="mt-3 border-t border-berry/20 pt-3">
                <p className="mono-label text-[9px] text-berry/70">Extended mystery (optional)</p>
                <p className="mt-1 text-[12px] leading-relaxed text-sage/75">
                  Answer: <span className="font-mono text-amber">{campaign.extAnswer}</span> ·{" "}
                  {campaign.extSocialClue ? "social clue set" : "no social clue"} ·{" "}
                  {campaign.extWebClue ? "website clue set" : "no website clue"} ·{" "}
                  {campaign.extInstoreClue ? "in-store clue set" : "no in-store clue"}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="mono-label">Online trail</p>
            <span className="chip border-line text-sage/60">{clueCount(onlineClues.length)}</span>
          </div>
          <div className="mt-3">
            <ClueTrail clues={campaign.clues} kind="online" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-sage/45">
            Opening a link only opens it on your device — the prototype does not verify that you
            read the source.
          </p>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="mono-label">In-store trail</p>
            <span className="chip border-line text-sage/60">{clueCount(instoreClues.length)}</span>
          </div>
          <div className="mt-3">
            <ClueTrail clues={campaign.clues} kind="instore" showLinks={false} />
          </div>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="mono-label">Reward</p>
            <StatusBadge status={campaign.status} />
          </div>
          <div className="mt-2">
            <RewardLine amount={campaign.rewardAmount} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-sage/55">
            Fixed base reward for every verified completion, regardless of hints or speed. Devnet
            test credits only — no cash value.
          </p>
        </div>

        <TermSheet campaign={campaign} />

        <div className="panel-flat p-4">
          <p className="mono-label">Merchant &amp; store</p>
          <dl className="mt-3 space-y-3">
            {campaign.merchantName === campaign.shopName ? (
              <Meta label="Merchant & shop" value={campaign.shopName} />
            ) : (
              <>
                <Meta label="Merchant" value={campaign.merchantName} />
                <Meta label="Shop" value={campaign.shopName} />
              </>
            )}
            <Meta label="Area" value={campaign.shopArea} />
            <Meta label="Address" value={campaign.shopAddress} />
            <Meta label="Submitted" value={formatDateTime(campaign.submittedAt)} />
            <Meta label="Created" value={formatDate(campaign.createdAt)} />
            {campaign.publishedAt ? (
              <Meta label="Published" value={formatDateTime(campaign.publishedAt)} />
            ) : null}
          </dl>
          <p className="mt-3 border-t border-line/60 pt-3 font-mono text-[10px] tracking-wide text-sage/40">
            {campaign.slug}
          </p>
        </div>
      </aside>
    </div>
  );
}
