import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignPreview } from "@/components/campaign-preview";
import { getCampaignBySlug } from "@/lib/store";
import { StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const campaign = getCampaignBySlug(slug);
  if (!campaign || campaign.status !== "published") {
    return { title: "Quest not found" };
  }
  return {
    title: `${campaign.title} — ${campaign.shopName}`,
    description: campaign.teaser,
  };
}

export default async function QuestDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const campaign = getCampaignBySlug(slug);
  if (!campaign || campaign.status !== "published") notFound();

  return (
    <div className="wrap space-y-8 pt-8">
      <div>
        <Link href="/quests" className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← All quests
        </Link>
      </div>

      <header className="flex flex-col gap-4 border-b border-line/60 pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            <span className="chip border-line text-sage/60">{campaign.shopArea}</span>
            <span className="chip border-line text-sage/60">
              {campaign.clues.length} clues
            </span>
          </div>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl">
            {campaign.title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-sage/80">{campaign.teaser}</p>
          <p className="mt-3 text-[12.5px] text-sage/55">
            {campaign.shopName} · {campaign.merchantName} · approved{" "}
            {campaign.reviewedBy ?? "operator"}
          </p>
        </div>
        <div className="shrink-0">
          <Link href={`/merchant`} className="btn-ghost">
            Merchant studio
          </Link>
        </div>
      </header>

      <CampaignPreview campaign={campaign} />

      <section className="panel overflow-hidden">
        <div className="border-b border-line/60 bg-amber/5 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="mono-label text-amber/80">Playing this quest</p>
            <span className="chip border-amber/30 text-amber/80">Next build · P0.2</span>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-sage/75">
            The briefing above is the full published campaign. The interactive run — starting the
            quest, timed hints at 3 and 5 minutes, in-app camera capture, location permission and
            evidence verification — is the next milestone. No reward is paid and no coupon is issued
            until the Devnet payout (P0.3) and coupon flow (P0.4) are integrated.
          </p>
        </div>
        <ol className="grid gap-px bg-line/50 sm:grid-cols-3">
          {[
            {
              title: "1 · Walk the trail",
              body: "Open the online sources, then follow the in-store clues to the target object.",
            },
            {
              title: "2 · Capture evidence",
              body: "In-app camera photo plus explicitly permitted location. Limited evidence, honestly reported.",
            },
            {
              title: "3 · Fixed reward",
              body: "One real Devnet test-credit transfer, same amount for every verified completion.",
            },
          ].map((step) => (
            <li key={step.title} className="bg-panel px-5 py-4">
              <p className="text-[13px] font-semibold text-white/85">{step.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-sage/65">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
