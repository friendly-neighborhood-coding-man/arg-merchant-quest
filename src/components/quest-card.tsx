import Link from "next/link";
import type { Campaign } from "@/lib/types";
import { formatKrw } from "@/lib/format";

export function QuestCard({ campaign }: { campaign: Campaign }) {
  const online = campaign.clues.filter((clue) => clue.kind === "online").length;
  const instore = campaign.clues.filter((clue) => clue.kind === "instore").length;

  return (
    <article className="panel group relative flex h-full flex-col overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-amber/40">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/70 to-transparent opacity-0 transition group-hover:opacity-100"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="chip border-mint/30 text-mint">Live</span>
        <span className="font-mono text-[10px] tracking-[0.16em] text-sage/45 uppercase">
          {campaign.shopArea}
        </span>
      </div>

      <h3 className="mt-3 font-display text-2xl leading-tight text-white/95">
        <Link href={`/quests/${campaign.slug}`} className="after:absolute after:inset-0">
          {campaign.title}
        </Link>
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-sage/80">{campaign.teaser}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line/60 pt-3 text-[11px]">
        <div>
          <dt className="mono-label text-[9px]">Reward</dt>
          <dd className="mt-0.5 text-[12.5px] text-amber">{campaign.rewardAmount} credits</dd>
        </div>
        <div>
          <dt className="mono-label text-[9px]">Trail</dt>
          <dd className="mt-0.5 text-[12.5px] text-white/80">
            {online} online · {instore} in-store
          </dd>
        </div>
        <div>
          <dt className="mono-label text-[9px]">Coupon</dt>
          <dd className="mt-0.5 truncate text-[12.5px] text-white/80" title={campaign.couponItem}>
            {campaign.couponMinSpend > 0 ? `min ${formatKrw(campaign.couponMinSpend)}` : "no minimum"}
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-4">
        <p className="text-[11.5px] text-sage/55">
          {campaign.shopName} · {campaign.merchantName}
        </p>
      </div>
    </article>
  );
}
