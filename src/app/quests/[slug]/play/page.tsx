import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { QuestRun } from "@/components/quest-run";
import { getCampaignBySlug } from "@/lib/store";
import { PLAYER_COOKIE, getQuestView } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const campaign = getCampaignBySlug(slug);
  return { title: campaign ? `Playing ${campaign.title}` : "Quest" };
}

export default async function QuestPlayPage({ params }: PageProps) {
  const { slug } = await params;
  const campaign = getCampaignBySlug(slug);
  if (!campaign || campaign.status !== "published") notFound();

  const cookieStore = await cookies();
  const playerId = cookieStore.get(PLAYER_COOKIE)?.value ?? null;
  if (!playerId) redirect(`/quests/${slug}`);

  const view = getQuestView(playerId, campaign);
  if (!view) redirect(`/quests/${slug}`);

  return (
    <div className="wrap max-w-3xl space-y-5 pt-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/quests/${slug}`} className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← Quest briefing
        </Link>
        <span className="font-mono text-[10px] tracking-wide text-sage/35">{campaign.slug}</span>
      </div>
      <QuestRun view={view} />
    </div>
  );
}
