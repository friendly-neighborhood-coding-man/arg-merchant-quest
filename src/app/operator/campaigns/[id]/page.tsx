import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignPreview } from "@/components/campaign-preview";
import { ReviewControls } from "@/components/review-controls";
import { StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { getCampaignById } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review campaign",
};

type PageProps = { params: Promise<{ id: string }> };

const CHECKS = [
  "Trail is solvable in about 3–5 minutes by a first-time visitor.",
  "In-store spot is merchant-approved, visitor-accessible and safe.",
  "Reward copy is fixed and honest — no speed or first-solver framing.",
  "Coupon conditions (minimum spend, validity, availability) are visible before play.",
  "Target object is a single, specific thing that can be photographed.",
];

export default async function OperatorCampaignReview({ params }: PageProps) {
  const { id } = await params;
  const campaign = getCampaignById(id);
  if (!campaign) notFound();

  const isPending = campaign.status === "pending";

  return (
    <div className="wrap space-y-7 pt-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/operator" className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← Review desk
        </Link>
        <span className="font-mono text-[10px] tracking-wide text-sage/35">{campaign.slug}</span>
      </div>

      <header className="flex flex-col gap-4 border-b border-line/60 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            <span className="chip border-line text-sage/60">{campaign.merchantName}</span>
            <span className="chip border-line text-sage/60">{campaign.shopArea}</span>
          </div>
          <h1 className="mt-3 font-display text-3xl leading-tight text-white sm:text-4xl">
            {campaign.title}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-sage/75">{campaign.teaser}</p>
          <p className="mt-2 text-[11.5px] text-sage/45">
            Submitted {formatDateTime(campaign.submittedAt)}
            {campaign.reviewedAt ? ` · reviewed ${formatDateTime(campaign.reviewedAt)}` : ""}
          </p>
        </div>
        {campaign.status === "published" ? (
          <Link href={`/quests/${campaign.slug}`} className="btn-ghost">
            View in discovery
          </Link>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div className="panel p-5">
            <p className="mono-label">Operator checklist</p>
            <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-sage/75">
              {CHECKS.map((check) => (
                <li key={check} className="flex gap-2">
                  <span className="mt-0.5 text-line" aria-hidden>
                    □
                  </span>
                  <span>{check}</span>
                </li>
              ))}
            </ul>
          </div>

          <CampaignPreview campaign={campaign} showOperatorNote />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {isPending && campaign.lastRejectionNote ? (
            <div className="panel-flat p-4">
              <p className="mono-label text-rust/80">Resubmitted after feedback</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-sage/80">
                {campaign.lastRejectionNote}
              </p>
              <p className="mt-2 text-[11px] text-sage/45">
                Your note from {formatDateTime(campaign.lastRejectionAt)} · resubmitted{" "}
                {formatDateTime(campaign.submittedAt)}
              </p>
            </div>
          ) : null}

          {isPending ? (
            <ReviewControls campaignId={campaign.id} campaignTitle={campaign.title} />
          ) : (
            <div className="panel p-5">
              <p className="mono-label">Decision recorded</p>
              <p className="mt-2 text-[14px] text-white/85">
                {campaign.status === "published"
                  ? "Published to player discovery."
                  : campaign.status === "rejected"
                    ? "Sent back to the merchant."
                    : campaign.status === "draft"
                      ? "Still a merchant draft — nothing to review yet."
                      : "In review."}
              </p>
              {campaign.operatorNote ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-sage/70">
                  {campaign.operatorNote}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-sage/45">
                {campaign.reviewedBy ?? "operator"} · {formatDateTime(campaign.reviewedAt)}
              </p>
            </div>
          )}

          <div className="panel-flat p-4">
            <p className="mono-label">Reward rule</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-sage/70">
              {campaign.rewardAmount} Devnet test credits for every verified completion. Hints,
              speed and ARG skill never change the amount, and there is no first-solver bonus.
            </p>
            <p className="mt-2 text-[11px] text-sage/45">
              The actual transfer is integrated in P0.3; this build records the terms only.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
