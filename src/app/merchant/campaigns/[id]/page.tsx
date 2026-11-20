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
  searchParams: Promise<{ created?: string }>;
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
  const { created } = await searchParams;
  const campaign = getCampaignById(id);
  const merchant = getDemoMerchant();

  if (!campaign || campaign.merchantId !== merchant.id) notFound();

  const canSubmit = campaign.status === "draft" || campaign.status === "rejected";

  return (
    <div className="wrap space-y-7 pt-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/merchant" className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← Campaign desk
        </Link>
        <span className="font-mono text-[10px] tracking-wide text-sage/35">{campaign.slug}</span>
      </div>

      {created ? (
        <div className="rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-mint">Draft saved</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mint/75">
            This campaign is private to your studio. Submit it for operator review when the trail is
            ready — only then can players see it.
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
          {campaign.status === "published" ? (
            <Link href={`/quests/${campaign.slug}`} className="btn-ghost">
              View in discovery
            </Link>
          ) : null}
          {canSubmit ? <SubmitForReview campaignId={campaign.id} /> : null}
        </div>
      </header>

      {campaign.status === "pending" ? (
        <div className="panel-flat px-4 py-3">
          <p className="text-[13px] text-sage/80">
            Waiting for an operator decision since {formatDateTime(campaign.submittedAt)}. You will
            see the operator&apos;s note here if it is sent back.
          </p>
        </div>
      ) : null}

      <Pipeline campaign={campaign} />

      <CampaignPreview campaign={campaign} showOperatorNote />
    </div>
  );
}
