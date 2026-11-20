import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignPreview } from "@/components/campaign-preview";
import { SubmitForReview } from "@/components/submit-for-review";
import { StatusBadge } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import { getCampaignById, getDemoMerchant } from "@/lib/store";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign detail",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string; locked?: string }>;
};

function Pipeline({ campaign }: { campaign: Campaign }) {
  const steps = [
    { label: "Created", at: campaign.createdAt, done: true },
    { label: "Submitted", at: campaign.submittedAt, done: Boolean(campaign.submittedAt) },
    {
      label: campaign.status === "rejected" ? "Sent back" : "Reviewed",
      at: campaign.reviewedAt,
      done: Boolean(campaign.reviewedAt),
    },
    { label: "Published", at: campaign.publishedAt, done: Boolean(campaign.publishedAt) },
  ];

  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {steps.map((step) => (
        <li key={step.label} className="panel-flat px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                step.done ? "bg-mint" : "bg-line",
              ].join(" ")}
              aria-hidden
            />
            <p className="mono-label text-[9px]">{step.label}</p>
          </div>
          <p className="mt-1.5 text-[12px] text-white/75">
            {step.at ? formatDateTime(step.at) : "Not yet"}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default async function MerchantCampaignDetail({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { created, updated, locked } = await searchParams;
  const campaign = getCampaignById(id);
  const merchant = getDemoMerchant();

  if (!campaign || campaign.merchantId !== merchant.id) notFound();

  const canEdit = campaign.status === "draft" || campaign.status === "rejected";
  const sentBack = campaign.status === "rejected";
  const waitingAfterFeedback =
    Boolean(campaign.lastRejectionNote) &&
    (campaign.status === "pending" || campaign.status === "published");

  return (
    <div className="wrap space-y-7 pt-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/merchant" className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← Campaign desk
        </Link>
        <span className="font-mono text-[10px] tracking-wide text-sage/35">{campaign.slug}</span>
      </div>

      {created === "1" && campaign.status === "draft" ? (
        <div className="rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-mint">Draft saved</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mint/75">
            This campaign is private to your studio. Submit it for operator review when the trail is
            ready — only then can players see it.
          </p>
        </div>
      ) : null}

      {updated === "1" ? (
        <div className="rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-mint">Changes saved</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mint/75">
            {sentBack
              ? "The campaign and its clues are updated. Resubmit it when you are ready for another review."
              : "This draft is updated. Submit it for operator review when the trail is ready."}
          </p>
        </div>
      ) : null}

      {locked === "1" ? (
        <div className="rounded-2xl border border-amber/35 bg-amber/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-amber-soft">This campaign is locked</p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber/80">
            Campaigns cannot be edited while an operator is reviewing them or after they are live.
          </p>
        </div>
      ) : null}

      <header className="flex flex-col gap-4 border-b border-line/60 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            <span className="chip border-line text-sage/60">{campaign.shopArea}</span>
            <span className="chip border-line text-sage/60">
              updated {timeAgo(campaign.updatedAt)}
            </span>
          </div>
          <h1 className="mt-3 font-display text-3xl leading-tight text-white sm:text-4xl">
            {campaign.title}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-sage/75">{campaign.teaser}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canEdit ? (
            <Link href={`/merchant/campaigns/${campaign.id}/edit`} className="btn-ghost">
              {sentBack ? "Edit & resubmit" : "Edit draft"}
            </Link>
          ) : null}
          {campaign.status === "published" ? (
            <Link href={`/quests/${campaign.slug}`} className="btn-ghost">
              View in discovery
            </Link>
          ) : null}
          {canEdit ? <SubmitForReview campaignId={campaign.id} label={sentBack ? "Resubmit" : undefined} /> : null}
        </div>
      </header>

      {sentBack ? (
        <div className="rounded-2xl border border-rust/35 bg-rust/10 px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="mono-label text-rust/80">Operator feedback</p>
            <p className="text-[11px] text-rust/65">
              {campaign.reviewedBy ?? "operator"} · {formatDateTime(campaign.lastRejectionAt)}
            </p>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-rust/95">
            {campaign.operatorNote ?? campaign.lastRejectionNote ?? "No note was left."}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-rust/70">
            Edit the campaign to address this, then resubmit. The operator sees this note next to
            your revised campaign.
          </p>
        </div>
      ) : null}

      {waitingAfterFeedback ? (
        <div className="panel-flat px-4 py-3">
          <p className="text-[13px] leading-relaxed text-sage/80">
            {campaign.status === "pending"
              ? `Resubmitted ${timeAgo(campaign.submittedAt)} after an operator sent it back on ${formatDateTime(campaign.lastRejectionAt)}. The earlier note is kept below so the operator can compare.`
              : `Approved after an earlier round of changes (sent back on ${formatDateTime(campaign.lastRejectionAt)}). The original note is kept below.`}
          </p>
        </div>
      ) : null}

      {campaign.status === "pending" && !campaign.lastRejectionNote ? (
        <div className="panel-flat px-4 py-3">
          <p className="text-[13px] text-sage/80">
            Waiting for an operator decision since {formatDateTime(campaign.submittedAt)}. You will
            see the operator&apos;s note here if it is sent back.
          </p>
        </div>
      ) : null}

      <Pipeline campaign={campaign} />

      <CampaignPreview campaign={campaign} showOperatorNote={!sentBack} />
    </div>
  );
}
