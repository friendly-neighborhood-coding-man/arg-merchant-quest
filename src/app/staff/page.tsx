import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, Stat } from "@/components/ui";
import { StaffRedemption } from "@/components/staff-redemption";
import { StaffHandoff } from "@/components/staff-handoff";
import { couponStats, listRecentRedemptions } from "@/lib/coupons";
import { claimStats, listRecentClaims } from "@/lib/product-claims";
import { formatDateTimeKst } from "@/lib/format";
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
  const claims = claimStats();
  const recentClaims = listRecentClaims(8);

  return (
    <div className="wrap space-y-8 pt-10">
      <PageHeader
        eyebrow="Staff counter"
        title="Two things happen at the counter"
        description="A player may show a demo coupon code or a product-clue reference. Choose the matching workflow below. No Solana or MagicBlock knowledge is needed; both are demonstration steps, not real purchases."
        actions={
          <Link href="/quests" className="btn-ghost">
            Player view
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <a
          href="#coupon-workflow"
          className="panel group flex flex-col p-5 transition hover:border-amber/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="mono-label text-amber/80">Workflow 1</span>
            <span className="chip border-amber/30 text-amber/80">Coupon code</span>
          </div>
          <h2 className="mt-2 font-display text-2xl text-white/95">Redeem a demo coupon</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-sage/70">
            The player shows a code such as <span className="font-mono text-amber-soft">NINTH-XXXX-XXXX</span>.
            Look it up, read the terms, confirm the demo condition, redeem it once.
          </p>
          <span className="mt-3 text-[12px] text-amber-soft group-hover:underline">Open coupon workflow ↓</span>
        </a>
        <a
          href="#product-workflow"
          className="panel group flex flex-col p-5 transition hover:border-amber/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="mono-label text-amber/80">Workflow 2</span>
            <span className="chip border-amber/30 text-amber/80">Product reference</span>
          </div>
          <h2 className="mt-2 font-display text-2xl text-white/95">Release a product clue</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-sage/70">
            The player shows a reference such as <span className="font-mono text-amber-soft">CLUE-XXXX-XXXX</span>.
            Check the fictional product, confirm the handoff, release the clue once.
          </p>
          <span className="mt-3 text-[12px] text-amber-soft group-hover:underline">Open product workflow ↓</span>
        </a>
      </section>

      <div id="coupon-workflow" className="scroll-mt-24">
        <StaffRedemption />
      </div>

      <div id="product-workflow" className="scroll-mt-24">
        <StaffHandoff />
      </div>

      <details className="panel px-4 py-3">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-white/85">
          Today at the counter · counts and audit trail
        </summary>
        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Issued" value={stats.issued} hint="Ready to redeem" />
            <Stat label="Redeemed" value={stats.redeemed} hint="Used once" />
            <Stat label="Expired" value={stats.expired} hint="Past validity" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Product clues" value={claims.total} hint="Optional ARG requests" />
            <Stat label="Clues released" value={claims.handedOff} hint="One-time handoff" />
            <Stat label="Awaiting handoff" value={claims.awaitingHandoff} hint="Reference issued" />
          </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-label">Product audit trail</p>
            <h2 className="mt-1 font-display text-2xl text-white/90">Recent clue handoffs</h2>
          </div>
          <span className="font-mono text-[11px] text-sage/45">
            KST · stored in UTC
          </span>
        </div>
        {recentClaims.length === 0 ? (
          <div className="panel-flat mt-3 px-5 py-6">
            <p className="text-[13px] leading-relaxed text-sage/70">
              No optional product clue has been requested yet. A player earns one by finishing the
              free trail and solving the optional deduction.
            </p>
          </div>
        ) : (
          <div className="panel mt-3 divide-y divide-line/60">
            {recentClaims.map((row) => (
              <div
                key={`${row.reference}-${row.requestedAt}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[12px] tracking-[0.12em] text-amber-soft">
                    {row.reference}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-sage/60">
                    {row.productName} · {row.shopName}
                  </p>
                </div>
                <div className="text-[11.5px] text-sage/55 sm:text-right">
                  <p className={row.status === "handed_off" ? "text-mint" : "text-amber-soft"}>
                    {row.status === "handed_off" ? "Released" : "Awaiting handoff"}
                  </p>
                  <p>
                    {row.handedOffAt
                      ? `${formatDateTimeKst(row.handedOffAt)}${row.handedOffBy ? ` · by ${row.handedOffBy}` : ""}`
                      : formatDateTimeKst(row.requestedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
                  <p>{formatDateTimeKst(row.redeemedAt)}</p>
                  <p className="font-mono text-[10.5px] text-sage/40">by {row.redeemedBy}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
        </div>
      </details>

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
                  {campaign.optionalMode === "product_clue" ? (
                    <>
                      Product clue: <span className="text-white/80">{campaign.productName}</span>
                    </>
                  ) : (
                    <>
                      Coupon: <span className="text-white/80">{campaign.couponItem}</span>
                    </>
                  )}
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
