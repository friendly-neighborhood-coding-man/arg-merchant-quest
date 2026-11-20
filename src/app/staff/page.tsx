import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { listCampaignsByStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff counter",
  description: "Coupon redemption for store staff. Issued coupons arrive in P0.4.",
};

export default function StaffPage() {
  const live = listCampaignsByStatus("published");

  return (
    <div className="wrap space-y-8 pt-10">
      <PageHeader
        eyebrow="Staff counter"
        title="Redeem a demo coupon"
        description="Staff will open a player's issued coupon, confirm its conditions, and mark it redeemed — the last step of the loop, feeding the merchant dashboard."
        actions={
          <Link href="/quests" className="btn-ghost">
            Player view
          </Link>
        }
      />

      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mono-label">Status</p>
            <h2 className="mt-1 font-display text-2xl text-white/90">
              No coupons can be issued yet
            </h2>
          </div>
          <span className="chip border-amber/40 bg-amber/10 text-amber-soft">
            Planned for P0.4
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-sage/75">
          A coupon only exists after a verified in-store completion issues one. The quest flow
          (P0.2), the Devnet reward (P0.3) and coupon issuance (P0.4) are not connected in this
          build, so this counter has nothing to redeem. It is intentionally not a mocked redemption
          screen.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              title: "1 · Verify the code",
              body: "Staff enters the coupon code shown in the player's account.",
            },
            {
              title: "2 · Check the conditions",
              body: "Minimum spend, validity window and per-visitor limit are printed on the coupon.",
            },
            {
              title: "3 · Mark redeemed",
              body: "Once redeemed it cannot be used again, and the merchant dashboard records it.",
            },
          ].map((step) => (
            <div key={step.title} className="panel-flat p-4">
              <p className="mono-label text-[9px]">Demo flow</p>
              <p className="mt-1.5 text-[13.5px] font-semibold text-white/85">{step.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-sage/65">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-amber/25 bg-amber/5 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-amber-soft/80">
            Coupons in this prototype are demo entitlements with no cash value and cannot be
            redeemed in a real business.
          </p>
        </div>
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
    </div>
  );
}
