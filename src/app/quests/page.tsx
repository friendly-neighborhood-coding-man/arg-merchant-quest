import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { QuestCard } from "@/components/quest-card";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { listCampaignsByStatus } from "@/lib/store";
import { PLAYER_COOKIE, listPlayerAchievements, listPlayerProgress } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover quests",
  description: "Published ARG campaigns approved by the operator, with reward and coupon terms.",
};

export default async function QuestsPage() {
  const campaigns = listCampaignsByStatus("published");
  const cookieStore = await cookies();
  const playerId = cookieStore.get(PLAYER_COOKIE)?.value ?? null;
  const progress = playerId ? listPlayerProgress(playerId) : new Map();
  const achievements = playerId ? listPlayerAchievements(playerId) : [];
  const playable = campaigns.filter((campaign) => campaign.answer.trim());

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
          <p className="text-[11px] text-sage/45">{playable.length} playable end to end</p>
        </div>
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Reward rule</p>
          <p className="mt-1 text-[12.5px] text-white/80">Fixed per completion</p>
          <p className="text-[11px] text-sage/50">Hints and speed never change it.</p>
        </div>
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Reward asset</p>
          <p className="mt-1 text-[12.5px] text-white/80">Devnet test credits</p>
          <p className="text-[11px] text-sage/50">Recorded now, paid in P0.3.</p>
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
            <QuestCard
              key={campaign.id}
              campaign={campaign}
              progress={progress.get(campaign.id) ?? null}
            />
          ))}
        </div>
      )}

      <section className="panel p-5">
        <p className="mono-label">Before you play</p>
        <div className="mt-3 grid gap-4 text-[12.5px] leading-relaxed text-sage/75 sm:grid-cols-3">
          <p>
            <span className="text-white/85">Campaign-specific clues.</span> Online sources open one at
            a time; the in-store half only unlocks at the shop.
          </p>
          <p>
            <span className="text-white/85">Evidence is limited.</span> A person reviews your photo.
            Camera and location are supporting evidence, never cryptographic proof of presence.
          </p>
          <p>
            <span className="text-white/85">Demo coupon.</span> Secret-menu coupons are fictional
            entitlements with visible conditions, not real offers.
          </p>
        </div>
      </section>

      <section id="achievements" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-label">Your case</p>
            <h2 className="mt-2 font-display text-2xl text-white/90">Achievements &amp; progress</h2>
          </div>
          <span className="font-mono text-[11px] text-sage/45">
            {achievements.length} earned
          </span>
        </div>

        {achievements.length === 0 ? (
          <div className="panel-flat mt-3 px-5 py-6">
            <p className="text-[13px] leading-relaxed text-sage/70">
              Nothing earned yet in this browser. Complete a trail, have your evidence reviewed, and
              its achievement appears here. The optional second question adds a second one.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {achievements.map((achievement) => (
              <li
                key={`${achievement.code}-${achievement.campaignSlug}`}
                className="panel-flat p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="mono-label text-[9px] text-mint/70">
                    {achievement.code === "extended_mystery" ? "Extended" : "Basic"}
                  </p>
                  {achievement.couponEligible ? (
                    <span className="chip border-amber/30 text-amber/80">Coupon eligible</span>
                  ) : null}
                </div>
                <p className="mt-1.5 font-display text-lg leading-snug text-white/90">
                  {achievement.name}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-sage/60">{achievement.detail}</p>
                <p className="mt-2 text-[11px] text-sage/40">
                  {formatDateTime(achievement.earnedAt)} ·{" "}
                  <Link href={`/quests/${achievement.campaignSlug}`} className="hover:text-amber-soft">
                    open trail
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
