import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, Stat, StatusBadge } from "@/components/ui";
import { SubmitForReview } from "@/components/submit-for-review";
import { getDemoMerchant, listMerchantCampaigns, merchantStats } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import type { Campaign, CampaignStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merchant studio",
  description: "Create campaigns, preview them and send them to operator review.",
};

const GROUPS: Array<{ status: CampaignStatus; title: string; description: string }> = [
  {
    status: "rejected",
    title: "Needs changes",
    description: "The operator sent these back with a note.",
  },
  { status: "draft", title: "Drafts", description: "Private to this studio until submitted." },
  {
    status: "pending",
    title: "In review",
    description: "Waiting for an operator decision — players cannot see these yet.",
  },
  { status: "published", title: "Live", description: "Visible in player discovery." },
];

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const online = campaign.clues.filter((clue) => clue.kind === "online").length;
  const instore = campaign.clues.filter((clue) => clue.kind === "instore").length;

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/merchant/campaigns/${campaign.id}`}
            className="font-display text-lg leading-tight text-white/90 transition hover:text-amber-soft"
          >
            {campaign.title}
          </Link>
          <StatusBadge status={campaign.status} />
        </div>
        <p className="mt-1 text-[12px] text-sage/60">
          {campaign.shopName} · {campaign.shopArea} · {online} online + {instore} in-store clues ·
          updated {timeAgo(campaign.updatedAt)}
        </p>
        {campaign.status === "rejected" && campaign.operatorNote ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-rust/90">
            Operator: {campaign.operatorNote}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {campaign.status === "draft" || campaign.status === "rejected" ? (
          <Link
            href={`/merchant/campaigns/${campaign.id}/edit`}
            className="btn-ghost py-1.5 text-[12px]"
          >
            {campaign.status === "rejected" ? "Edit" : "Edit draft"}
          </Link>
        ) : null}
        {campaign.status === "draft" || campaign.status === "rejected" ? (
          <SubmitForReview
            campaignId={campaign.id}
            variant="ghost"
            label={campaign.status === "rejected" ? "Resubmit" : "Submit"}
          />
        ) : null}
        <Link href={`/merchant/campaigns/${campaign.id}`} className="btn-ghost py-1.5 text-[12px]">
          Open
        </Link>
      </div>
    </div>
  );
}

export default function MerchantPage() {
  const merchant = getDemoMerchant();
  const campaigns = listMerchantCampaigns(merchant.id);
  const stats = merchantStats(merchant.id);

  return (
    <div className="wrap space-y-8 pt-10">
      <PageHeader
        eyebrow="Merchant studio"
        title="Campaign desk"
        description={`Signed in as the demo merchant account ${merchant.name}. Every campaign here belongs to this shop; drafts stay private until an operator publishes them.`}
        actions={
          <Link href="/merchant/campaigns/new" className="btn-primary">
            + New campaign
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Drafts" value={stats.draft} hint="Not submitted yet" />
        <Stat label="In review" value={stats.pending} hint="Operator queue" />
        <Stat label="Live" value={stats.published} hint="In discovery" />
        <Stat label="Needs changes" value={stats.rejected} hint="Read the note" />
      </div>

      {campaigns.length === 0 ? (
        <div className="panel-flat flex flex-col items-start gap-3 px-6 py-10">
          <p className="font-display text-xl text-white/85">No campaigns yet</p>
          <p className="max-w-lg text-sm leading-relaxed text-sage/70">
            Start with one campaign: a shop, a story, an online trail and one object a visitor can
            actually find in 3–5 minutes.
          </p>
          <Link href="/merchant/campaigns/new" className="btn-primary mt-1">
            Create the first campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-7">
          {GROUPS.map((group) => {
            const items = campaigns.filter((campaign) => campaign.status === group.status);
            if (items.length === 0) return null;
            return (
              <section key={group.status}>
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl text-white/90">{group.title}</h2>
                    <p className="text-[12px] text-sage/55">{group.description}</p>
                  </div>
                  <span className="font-mono text-[11px] text-sage/45">{items.length}</span>
                </div>
                <div className="panel mt-3 divide-y divide-line/60">
                  {items.map((campaign) => (
                    <CampaignRow key={campaign.id} campaign={campaign} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="panel p-5">
        <p className="mono-label">How the pipeline moves</p>
        <ol className="mt-3 grid gap-3 text-[12.5px] leading-relaxed text-sage/70 sm:grid-cols-3">
          <li>
            <span className="text-white/85">1 · Draft.</span> Saving never publishes. Every required
            field must be complete, but the campaign stays private until you submit it.
          </li>
          <li>
            <span className="text-white/85">2 · Review.</span> Submitting locks the campaign for an
            operator check of playability, a safe in-store spot and honest terms. If it is sent
            back, edit it and resubmit.
          </li>
          <li>
            <span className="text-white/85">3 · Live.</span> Approval publishes it to player
            discovery with its reward and coupon terms shown before play.
          </li>
        </ol>
        <p className="mt-3 border-t border-line/60 pt-3 text-[11.5px] text-sage/50">
          Reward payouts and coupon issuance are not connected yet — they arrive with P0.3 and P0.4.
        </p>
      </section>
    </div>
  );
}
