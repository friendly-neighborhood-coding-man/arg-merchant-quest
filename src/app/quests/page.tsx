import type { Metadata } from "next";
import { QuestCard } from "@/components/quest-card";
import { EmptyState, PageHeader } from "@/components/ui";
import { listCampaignsByStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover quests",
  description: "Published ARG campaigns approved by the operator, with reward and coupon terms.",
};

export default function QuestsPage() {
  const campaigns = listCampaignsByStatus("published");

  return (
    <div className="wrap space-y-8 pt-10">
      <PageHeader
        eyebrow="Player discovery"
        title="Open trails"
        description="Merchant-sponsored clue hunts approved for the Devnet demo. Read the story before you go anywhere: the reward is fixed, the coupon conditions are visible up front, and nothing here is a race."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Live now</p>
          <p className="mt-1 font-display text-2xl text-white/90">{campaigns.length}</p>
        </div>
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Reward rule</p>
          <p className="mt-1 text-[12.5px] text-white/80">Fixed per completion</p>
          <p className="text-[11px] text-sage/50">Hints and speed never change it.</p>
        </div>
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Reward asset</p>
          <p className="mt-1 text-[12.5px] text-white/80">Devnet test credits</p>
          <p className="text-[11px] text-sage/50">No cash value. Payout in P0.3.</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="The boards are empty"
          description="No campaign has been approved yet. Merchant drafts appear here only after an operator publishes them."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <QuestCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}

      <section className="panel p-5">
        <p className="mono-label">Before you play</p>
        <div className="mt-3 grid gap-4 text-[12.5px] leading-relaxed text-sage/75 sm:grid-cols-3">
          <p>
            <span className="text-white/85">Campaign-specific clues.</span> Online sources are
            written for this trail; the in-store find only exists at the merchant&apos;s approved
            spot.
          </p>
          <p>
            <span className="text-white/85">Evidence is limited.</span> Camera and consented
            location assist verification in P0.2. They are not cryptographic proof of presence.
          </p>
          <p>
            <span className="text-white/85">Demo coupon.</span> Secret-menu coupons are fictional
            entitlements with visible conditions, not real offers.
          </p>
        </div>
      </section>
    </div>
  );
}
