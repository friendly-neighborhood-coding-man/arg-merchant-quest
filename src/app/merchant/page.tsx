import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, Stat, StatusBadge } from "@/components/ui";
import { SubmitForReview } from "@/components/submit-for-review";
import { getDemoMerchant, listMerchantCampaigns, merchantStats } from "@/lib/store";
import { merchantActivity } from "@/lib/coupons";
import { formatDateTimeKst, timeAgo } from "@/lib/format";
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
  const activity = merchantActivity(merchant.id);

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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-label">Demo activity</p>
            <h2 className="mt-1 font-display text-2xl text-white/90">
              What your trails produced
            </h2>
          </div>
          <span className="chip border-line text-sage/60">From this app&apos;s database</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <Stat
            label="Verified demo completions"
            value={activity.totals.verifiedCompletions}
            hint="Operator-approved evidence"
          />
          <Stat
            label="Devnet payouts paid"
            value={activity.totals.payoutsPaid}
            hint={`${activity.totals.payoutsPending} pending · ${activity.totals.payoutsFailed} failed`}
          />
          <Stat
            label="Extended ARG solved"
            value={activity.totals.extendedSolved}
            hint="Optional second question"
          />
          <Stat
            label="Demo coupons issued"
            value={activity.totals.couponsIssued}
            hint="One per extended completion"
          />
          <Stat
            label="Demo coupons redeemed"
            value={activity.totals.couponsRedeemed}
            hint="Confirmed by staff"
          />
          <Stat
            label="Product clues released"
            value={activity.totals.productHandoffs}
            hint={`${activity.totals.productClaims} orders simulated`}
          />
          <Stat
            label="Hidden endings"
            value={activity.totals.hiddenEndings}
            hint="Final answers accepted"
          />
        </div>

        {activity.campaigns.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-line/70 text-[10px] tracking-[0.12em] text-sage/45 uppercase">
                  <th className="py-2 pr-3 font-normal">Campaign</th>
                  <th className="py-2 pr-3 text-right font-normal">Verified</th>
                  <th className="py-2 pr-3 text-right font-normal">Payouts paid</th>
                  <th className="py-2 pr-3 text-right font-normal">Payouts pending / failed</th>
                  <th className="py-2 pr-3 text-right font-normal">Extended solved</th>
                  <th className="py-2 pr-3 text-right font-normal">Coupons issued</th>
                  <th className="py-2 pr-3 text-right font-normal">Coupons redeemed</th>
                  <th className="py-2 pr-3 text-right font-normal">Product clues</th>
                  <th className="py-2 text-right font-normal">Hidden endings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {activity.campaigns.map((row) => (
                  <tr key={row.campaignId}>
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/merchant/campaigns/${row.campaignId}`}
                        className="text-white/85 hover:text-amber-soft"
                      >
                        {row.title}
                      </Link>
                      <p className="font-mono text-[10px] text-sage/40">{row.slug}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-white/80">
                      {row.verifiedCompletions}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-mint/90">
                      {row.payoutsPaid}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-sage/70">
                      {row.payoutsPending} / {row.payoutsFailed}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-white/80">
                      {row.extendedSolved}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-amber-soft">
                      {row.couponsIssued}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-berry">
                      {row.couponsRedeemed}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-amber-soft">
                      {row.productHandoffs}
                    </td>
                    <td className="py-2.5 text-right font-mono text-mint/90">
                      {row.hiddenEndings}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="mt-3 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-sage/45">
          These are demo counts only. They do not represent revenue, real purchases, verified foot
          traffic or conversion rates.
        </p>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-label">Recent activity</p>
            <h2 className="mt-1 font-display text-2xl text-white/90">Latest from your trails</h2>
          </div>
          <Link href="/operator/evidence" className="text-[12px] text-sage/55 hover:text-amber-soft">
            Evidence queue →
          </Link>
        </div>

        {activity.recent.length === 0 ? (
          <div className="panel-flat mt-3 px-5 py-6">
            <p className="text-[13px] leading-relaxed text-sage/70">
              No verified activity yet. A completion appears here after an operator approves the
              player&apos;s evidence; a coupon appears when that player also solves the optional
              second question.
            </p>
          </div>
        ) : (
          <ul className="panel mt-3 divide-y divide-line/60">
            {activity.recent.map((event, index) => (
              <li
                key={`${event.kind}-${event.at}-${event.campaignSlug}-${index}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-white/85">
                    {event.kind === "completion"
                      ? "Verified demo completion"
                      : event.kind === "coupon_issued"
                        ? "Demo coupon issued"
                        : event.kind === "coupon_redeemed"
                          ? "Demo coupon redeemed"
                          : event.kind === "extended_solved"
                            ? "Extended mystery solved"
                            : event.kind === "product_handoff"
                              ? "Product clue released"
                              : "Hidden ending found"}{" "}
                    <span className="text-sage/55">· {event.campaignTitle}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-sage/55">
                    {event.kind === "completion"
                      ? `${event.rewardAmount} test credits · payout ${event.payoutStatus}`
                      : event.kind === "coupon_issued" || event.kind === "coupon_redeemed"
                        ? `Code ${event.code}${event.kind === "coupon_redeemed" && event.redeemedBy ? ` · by ${event.redeemedBy}` : ""}`
                        : event.kind === "product_handoff"
                          ? `Reference ${event.reference}${event.handedOffBy ? ` · by ${event.handedOffBy}` : ""}`
                          : "Optional story milestone"}
                  </p>
                </div>
                <p className="shrink-0 text-[11px] text-sage/40">
                  {formatDateTimeKst(event.at)} KST · {timeAgo(event.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

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
          Reward payouts, the MagicBlock completion counter, demo coupons and staff redemption are
          connected, and the optional product clue adds a real MagicBlock milestone when staff
          release it. The counts above are demo activity from this app, not business results. Times
          are shown in the shop's Korean local time; storage stays UTC.
        </p>
      </section>
    </div>
  );
}
