import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, StatusBadge } from "@/components/ui";
import { formatKrw, timeAgo } from "@/lib/format";
import { listAllCampaigns, listCampaignsByStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operator console",
  description: "Review merchant campaigns before they reach player discovery.",
};

type PageProps = { searchParams: Promise<{ reviewed?: string }> };

export default async function OperatorPage({ searchParams }: PageProps) {
  const { reviewed } = await searchParams;
  const pending = listCampaignsByStatus("pending");
  const all = listAllCampaigns();

  return (
    <div className="wrap space-y-8 pt-10">
      <PageHeader
        eyebrow="Operator console"
        title="Review desk"
        description="Nothing reaches players without this step. Check that the trail is playable in 3–5 minutes, the in-store spot is customer-safe and merchant-approved, the reward copy is honest, and the coupon conditions are visible before play."
        actions={
          <Link href="/quests" className="btn-ghost">
            Player view
          </Link>
        }
      />

      {reviewed === "approve" ? (
        <div className="rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3 text-[13px] text-mint">
          Campaign approved and published to player discovery.
        </div>
      ) : null}
      {reviewed === "reject" ? (
        <div className="rounded-2xl border border-rust/30 bg-rust/10 px-4 py-3 text-[13px] text-rust">
          Campaign sent back to the merchant with your note.
        </div>
      ) : null}

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-white/90">Awaiting review</h2>
            <p className="text-[12px] text-sage/55">
              Oldest submission first. Approval publishes immediately.
            </p>
          </div>
          <span className="font-mono text-[11px] text-amber/80">{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <div className="panel-flat mt-3 px-5 py-8">
            <p className="font-display text-lg text-white/80">Queue clear</p>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-sage/65">
              No campaign is waiting. A merchant can submit a draft from their campaign desk, or you
              can seed a new one from the merchant studio.
            </p>
            <div className="mt-4 flex gap-2">
              <Link href="/merchant" className="btn-ghost">
                Merchant studio
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {pending.map((campaign) => {
              const online = campaign.clues.filter((clue) => clue.kind === "online").length;
              const instore = campaign.clues.filter((clue) => clue.kind === "instore").length;
              return (
                <article key={campaign.id} className="panel flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="mono-label text-[9px]">
                        {campaign.merchantName} · {campaign.shopArea}
                      </p>
                      <h3 className="mt-1.5 font-display text-2xl leading-tight text-white/95">
                        {campaign.title}
                      </h3>
                    </div>
                    <StatusBadge status={campaign.status} />
                  </div>

                  <p className="mt-2 text-[13px] leading-relaxed text-sage/80">{campaign.teaser}</p>

                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line/60 pt-3 text-[11.5px]">
                    <div>
                      <dt className="mono-label text-[9px]">Trail</dt>
                      <dd className="mt-0.5 text-white/80">
                        {online} online · {instore} in-store
                      </dd>
                    </div>
                    <div>
                      <dt className="mono-label text-[9px]">Reward</dt>
                      <dd className="mt-0.5 text-amber">{campaign.rewardAmount} credits</dd>
                    </div>
                    <div>
                      <dt className="mono-label text-[9px]">Coupon min.</dt>
                      <dd className="mt-0.5 text-white/80">
                        {campaign.couponMinSpend > 0 ? formatKrw(campaign.couponMinSpend) : "none"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/60 pt-3">
                    <p className="text-[11px] text-sage/50">
                      Submitted {timeAgo(campaign.submittedAt)}
                    </p>
                    <Link
                      href={`/operator/campaigns/${campaign.id}`}
                      className="btn-primary py-1.5 text-[12px]"
                    >
                      Review campaign
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl text-white/90">Campaign register</h2>
        <p className="text-[12px] text-sage/55">Every campaign in the demo, across all merchants.</p>

        <div className="panel mt-3 overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_7rem_4rem] gap-3 border-b border-line/60 px-4 py-2.5 text-[10px] tracking-[0.14em] text-sage/45 uppercase sm:grid">
            <span>Campaign</span>
            <span>Merchant / shop</span>
            <span>Status</span>
            <span>Updated</span>
            <span className="text-right">Open</span>
          </div>
          {all.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-sage/60">No campaigns yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {all.map((campaign) => (
                <li
                  key={campaign.id}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_7rem_4rem] sm:items-center sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] text-white/85">{campaign.title}</p>
                    <p className="truncate font-mono text-[10px] text-sage/40">{campaign.slug}</p>
                  </div>
                  <div className="min-w-0 text-[12px] text-sage/70">
                    <p className="truncate">{campaign.merchantName}</p>
                    <p className="truncate text-[11px] text-sage/45">{campaign.shopName}</p>
                  </div>
                  <div>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="text-[11.5px] text-sage/60">{timeAgo(campaign.updatedAt)}</p>
                  <div className="sm:text-right">
                    <Link
                      href={
                        campaign.status === "pending"
                          ? `/operator/campaigns/${campaign.id}`
                          : `/quests/${campaign.slug}`
                      }
                      className="text-[12px] text-amber-soft hover:underline"
                    >
                      {campaign.status === "pending" ? "Review" : "View"} →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-sage/45">
          Drafts and rejected campaigns are not reachable from player discovery; the player view
          only lists published campaigns.
        </p>
      </section>
    </div>
  );
}
