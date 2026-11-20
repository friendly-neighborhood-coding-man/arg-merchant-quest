import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CampaignForm } from "@/components/campaign-form";
import { formatDateTime } from "@/lib/format";
import { getCampaignById, getDemoMerchant } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit campaign",
  description: "Correct a draft or a campaign sent back by the operator, then resubmit it.",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCampaignPage({ params }: PageProps) {
  const { id } = await params;
  const merchant = getDemoMerchant();
  const campaign = getCampaignById(id);

  if (!campaign || campaign.merchantId !== merchant.id) notFound();

  // Pending and published campaigns are locked; send the merchant back to the
  // campaign detail rather than showing a form that cannot be saved.
  if (campaign.status !== "draft" && campaign.status !== "rejected") {
    redirect(`/merchant/campaigns/${campaign.id}?locked=1`);
  }

  const sentBack = campaign.status === "rejected";

  return (
    <div className="wrap space-y-7 pt-8">
      <div>
        <Link
          href={`/merchant/campaigns/${campaign.id}`}
          className="text-[12px] text-sage/60 hover:text-amber-soft"
        >
          ← {campaign.title}
        </Link>
      </div>

      <header className="max-w-2xl">
        <p className="mono-label">{sentBack ? "Requested changes" : "Edit draft"}</p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-white sm:text-4xl">
          {sentBack ? "Fix and resubmit" : "Update this campaign"}
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-sage/75">
          Saving updates the private campaign and its clues. Nothing changes for players until an
          operator approves it again.
        </p>
      </header>

      {sentBack && campaign.lastRejectionNote ? (
        <div className="max-w-2xl rounded-2xl border border-rust/35 bg-rust/10 px-4 py-3">
          <p className="mono-label text-rust/80">Operator feedback to address</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-rust/95">
            {campaign.lastRejectionNote}
          </p>
          <p className="mt-2 text-[11px] text-rust/65">
            {campaign.reviewedBy ?? "operator"} · {formatDateTime(campaign.lastRejectionAt)}
          </p>
        </div>
      ) : null}

      <CampaignForm merchantName={merchant.name} campaign={campaign} />
    </div>
  );
}
