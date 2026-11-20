import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { StartQuest } from "@/components/start-quest";
import { RewardLine, StatusBadge } from "@/components/ui";
import { couponWindowCopy, formatKrw } from "@/lib/format";
import { getCampaignBySlug } from "@/lib/store";
import { PLAYER_COOKIE, getCompletion, getSession, isPlayable } from "@/lib/quest-store";

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

const HOW_IT_RUNS = [
  {
    title: "1 · Read the public trail",
    body: "Two or three short sources the shop left online. Each one opens the next.",
  },
  {
    title: "2 · Walk the shop",
    body: "The in-store clues unlock once the online trail is read. Keep to the public counter area.",
  },
  {
    title: "3 · Answer the counter",
    body: "One question, checked on the server. No answer is shown to your browser before you solve it.",
  },
  {
    title: "4 · Photograph what you found",
    body: "In-app camera, optional location, and a person reviews the submission before it counts.",
  },
];

export default async function QuestDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const campaign = getCampaignBySlug(slug);
  if (!campaign || campaign.status !== "published") notFound();

  const cookieStore = await cookies();
  const playerId = cookieStore.get(PLAYER_COOKIE)?.value ?? null;
  const session = playerId ? getSession(playerId, campaign.id) : null;
  const completion = session ? getCompletion(session.id) : null;
  const playable = isPlayable(campaign);
  const online = campaign.clues.filter((clue) => clue.kind === "online");
  const instore = campaign.clues.filter((clue) => clue.kind === "instore");

  return (
    <div className="wrap space-y-8 pt-8">
      <div>
        <Link href="/quests" className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← All quests
        </Link>
      </div>

      <header className="border-b border-line/60 pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={campaign.status} />
          <span className="chip border-line text-sage/60">{campaign.shopArea}</span>
          <span className="chip border-line text-sage/60">{online.length + instore.length} clues</span>
          <span className="chip border-line text-sage/60">≈ 5 min on foot</span>
          {completion ? (
            <span className="chip border-mint/40 bg-mint/10 text-mint">Completed</span>
          ) : session ? (
            <span className="chip border-amber/40 bg-amber/10 text-amber-soft">In progress</span>
          ) : null}
        </div>
        <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl">
          {campaign.title}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-sage/80">{campaign.teaser}</p>
        <p className="mt-3 text-[12.5px] text-sage/55">
          {campaign.shopName}
          {campaign.merchantName !== campaign.shopName ? ` · ${campaign.merchantName}` : ""} ·{" "}
          {campaign.shopAddress}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-8">
          <section>
            <p className="mono-label">The story</p>
            <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed whitespace-pre-line text-sage/85">
              {campaign.story}
            </div>
          </section>

          <section>
            <p className="mono-label">How this quest runs</p>
            <ol className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {HOW_IT_RUNS.map((step) => (
                <li key={step.title} className="panel-flat p-4">
                  <p className="text-[13.5px] font-semibold text-white/85">{step.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-sage/65">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <p className="mono-label">What you will read</p>
              <span className="text-[11px] text-sage/45">Clue text opens as you play</span>
            </div>
            <ul className="mt-3 divide-y divide-line/60">
              {[...online, ...instore].map((clue, index) => (
                <li key={clue.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-[10.5px] text-amber/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] text-sage/75">{clue.title}</span>
                  <span className="ml-auto font-mono text-[9.5px] tracking-[0.14em] text-sage/35 uppercase">
                    {clue.kind === "online" ? "online" : "in store"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="mono-label">Evidence, honestly described</p>
              <span className="chip border-amber/30 text-amber/80">Not proof</span>
            </div>
            <div className="mt-3 grid gap-3 text-[12.5px] leading-relaxed text-sage/75 sm:grid-cols-2">
              <p>
                <span className="text-white/85">Camera.</span> The app can use your device camera, or
                you can upload a photo. Permission is requested only when you reach that step.
              </p>
              <p>
                <span className="text-white/85">Location.</span> Asked separately, with its purpose
                stated. Declining it never blocks a submission.
              </p>
              <p>
                <span className="text-white/85">Review.</span> A person on the operator side looks at
                your photo before a completion is verified. Nothing is auto-approved.
              </p>
              <p>
                <span className="text-white/85">Limits.</span> Photos and coordinates are supporting
                evidence, not cryptographic proof that you were in the shop.
              </p>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="mono-label">Fixed reward</p>
              <span className="chip border-line text-sage/60">P0.3 payout</span>
            </div>
            <div className="mt-2">
              <RewardLine amount={campaign.rewardAmount} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-sage/55">
              The same amount for every verified completion. Hints and speed never change it, and
              there is no first-solver bonus.
            </p>
          </div>

          <div className="panel-flat p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="mono-label">Demo coupon</p>
              <span className="chip border-amber/30 text-amber/80">P0.4</span>
            </div>
            <p className="mt-2 font-display text-lg leading-snug text-white/90">
              {campaign.couponItem}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
              <div>
                <dt className="text-sage/55">Minimum spend</dt>
                <dd className="text-white/85">
                  {campaign.couponMinSpend > 0 ? formatKrw(campaign.couponMinSpend) : "No minimum"}
                </dd>
              </div>
              <div>
                <dt className="text-sage/55">Validity</dt>
                <dd className="text-white/85">{couponWindowCopy(campaign.couponValidDays)}</dd>
              </div>
            </dl>
            {campaign.couponNotes ? (
              <p className="mt-3 border-t border-line/60 pt-3 text-[11.5px] leading-relaxed text-sage/65">
                {campaign.couponNotes}
              </p>
            ) : null}
            <p className="mt-3 text-[11px] leading-relaxed text-amber/70">
              The optional extended mystery unlocks coupon eligibility. Nothing is issued or
              redeemable in this build.
            </p>
          </div>

          <div className="panel p-4">
            <p className="mono-label">Ready?</p>
            {!playable ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-sage/70">
                This trail is live but its counter answer has not been configured, so it cannot be
                played yet. The merchant has been notified in the demo data.
              </p>
            ) : completion ? (
              <div className="mt-2 space-y-2">
                <p className="text-[12.5px] leading-relaxed text-sage/75">
                  You already completed this trail. Your completion and achievements are on the quest
                  page.
                </p>
                <Link href={`/quests/${campaign.slug}/play`} className="btn-ghost w-full py-2">
                  Open my completion
                </Link>
              </div>
            ) : session ? (
              <div className="mt-2 space-y-2">
                <p className="text-[12.5px] leading-relaxed text-sage/75">
                  You started this trail earlier. Your session and hints keep running from that
                  start time.
                </p>
                <Link href={`/quests/${campaign.slug}/play`} className="btn-primary w-full py-2">
                  Continue the quest
                </Link>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-[12.5px] leading-relaxed text-sage/75">
                  Starting opens a session in this browser. Refreshing does not restart the trail or
                  the hint clock.
                </p>
                <StartQuest slug={campaign.slug} />
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-sage/40">
            Fictional demo quest at a fictional shop. Devnet test credits only — no cash value.
          </p>
        </aside>
      </div>
    </div>
  );
}
