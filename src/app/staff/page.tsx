import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, Stat } from "@/components/ui";
import { StaffRedemption } from "@/components/staff-redemption";
import { couponStats, listRecentRedemptions } from "@/lib/coupons";
import { formatDateTime } from "@/lib/format";
import { listCampaignsByStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff counter",
  description:
    "Look up a player's demo coupon, check its campaign terms and redeem it once. Demo only.",
};

export default function StaffPage() {
  const live = listCampaignsByStatus("published");
  const stats = couponStats();
  const recent = listRecentRedemptions(8);

  return (
    <div className="wrap space-y-8 pt-10">
      <PageHeader
        eyebrow="Staff counter"
        title="Redeem a demo coupon"
        description="A player shows the code from their issued coupon. Check the merchant's terms, confirm the fictional purchase condition for the demonstration, and mark it redeemed once. This feeds the merchant dashboard."
        actions={
          <Link href="/quests" className="btn-ghost">
            Player view
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Issued" value={stats.issued} hint="Ready to redeem" />
        <Stat label="Redeemed" value={stats.redeemed} hint="Used once" />
        <Stat label="Expired" value={stats.expired} hint="Past validity" />
      </div>

      <StaffRedemption />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-label">Audit trail</p>
            <h2 className="mt-1 font-display text-2xl text-white/90">Recent demo redemptions</h2>
          </div>
          <span className="font-mono text-[11px] text-sage/45">{stats.total} coupons total</span>
        </div>
        {recent.length === 0 ? (
          <div className="panel-flat mt-3 px-5 py-6">
            <p className="text-[13px] leading-relaxed text-sage/70">
              No coupon has been redeemed yet. A player earns one by solving a trail&apos;s optional
              second question.
            </p>
          </div>
        ) : (
          <div className="panel mt-3 divide-y divide-line/60">
            {recent.map((row) => (
              <div
                key={`${row.code}-${row.redeemedAt}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[12px] tracking-[0.12em] text-amber-soft">
                    {row.code}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-sage/60">
                    {row.couponItem} · {row.shopName}
                  </p>
                </div>
                <div className="text-[11.5px] text-sage/55 sm:text-right">
                  <p>{formatDateTime(row.redeemedAt)}</p>
                  <p className="font-mono text-[10.5px] text-sage/40">by {row.redeemedBy}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl text-white/90">Live quests at your counter</h2>
        <p className="text-[12px] text-sage/55">
          Approved campaigns a player could currently be exploring.
        </p>
        {live.length === 0 ? (
          <p className="panel-flat mt-3 px-4 py-6 text-sm text-sage/60">
            No campaign is live. Approve one in the operator console.
          </p>
        ) : (
          <ul className="panel mt-3 divide-y divide-line/60">
            {live.map((campaign) => (
              <li
                key={campaign.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[13.5px] text-white/85">{campaign.title}</p>
                  <p className="text-[11.5px] text-sage/50">
                    {campaign.shopName} · {campaign.shopArea}
                  </p>
                </div>
                <div className="text-[11.5px] text-sage/70">
                  Coupon: <span className="text-white/80">{campaign.couponItem}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rounded-xl border border-amber/25 bg-amber/5 px-4 py-3">
        <p className="text-[12px] leading-relaxed text-amber-soft/80">
          Coupons in this prototype are demo entitlements with no cash value and cannot be redeemed
          in a real business. No payment is processed, and nothing here pretends that a real
          purchase was verified.
        </p>
      </div>
    </div>
  );
}
