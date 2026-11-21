import Link from "next/link";
import { QuestCard } from "@/components/quest-card";
import { formatKrw } from "@/lib/format";
import { listCampaignsByStatus, platformStats } from "@/lib/store";

export const dynamic = "force-dynamic";

const LOOP = [
  {
    n: "01",
    role: "Merchant",
    title: "Write the trail",
    body: "Shop details, the ARG story, online sources, one object worth finding, and honest coupon terms.",
    state: "live",
    stateLabel: "Live in this build",
  },
  {
    n: "02",
    role: "Operator",
    title: "Keep it fair",
    body: "A human check for playability and a customer-safe in-store spot before anything goes live.",
    state: "live",
    stateLabel: "Live in this build",
  },
  {
    n: "03",
    role: "Player",
    title: "Follow the clues",
    body: "Read the online trail, walk the shop, answer the counter, and photograph the object with explicit permissions.",
    state: "live",
    stateLabel: "Playable now",
  },
  {
    n: "04",
    role: "Chain",
    title: "Take the fixed reward",
    body: "One real Devnet test-credit transfer per verified completion. Same amount for everyone, no races.",
    state: "live",
    stateLabel: "Live now",
  },
  {
    n: "05",
    role: "Staff",
    title: "Redeem the demo coupon",
    body: "A conditional secret-menu entitlement, redeemed at the counter and reflected in the merchant view.",
    state: "live",
    stateLabel: "Live now",
  },
];

const ROLES = [
  {
    href: "/merchant",
    role: "Merchant",
    title: "Studio",
    body: "Create a campaign, preview it the way players will see it, and send it to review.",
    state: "Live",
  },
  {
    href: "/operator",
    role: "Operator",
    title: "Console",
    body: "Read every pending campaign, then approve it into discovery or send it back with notes.",
    state: "Live",
  },
  {
    href: "/quests",
    role: "Player",
    title: "Discover",
    body: "Start a trail, follow it into the shop, submit evidence and collect achievements.",
    state: "Live",
  },
  {
    href: "/staff",
    role: "Staff",
    title: "Counter",
    body: "Look up a player's demo coupon, confirm the fictional condition and redeem it once.",
    state: "Live",
  },
];

export default function HomePage() {
  const stats = platformStats();
  const live = listCampaignsByStatus("published");
  const feature = live[0] ?? null;

  return (
    <div className="wrap space-y-16 pt-10 sm:pt-14">
      <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rise">
          <p className="mono-label">MagicBlock Blitz v10 · Solana Devnet</p>
          <h1 className="mt-3 font-display text-[2.6rem] leading-[1.05] tracking-tight text-white sm:text-6xl">
            The city is
            <br />
            the level<span className="text-amber">.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-sage/80">
            ARG Merchant Quest turns a local shop into a clue trail. Merchants write the story,
            operators keep it fair, players find the object in-store, and a verified find pays a
            fixed Devnet test reward — no first-solver bonus, no fastest-runner mechanics.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/quests" className="btn-primary">
              Explore live quests
            </Link>
            <Link href="/merchant" className="btn-ghost">
              Open merchant studio
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-sage/50">
            <span>Devnet test credits only</span>
            <span aria-hidden>·</span>
            <span>Fictional shops</span>
            <span aria-hidden>·</span>
            <span>Camera evidence is limited, not proof</span>
          </div>
        </div>

        <div className="panel rise p-5" style={{ animationDelay: "120ms" }}>
          {feature ? (
            <>
              <div className="flex items-center justify-between">
                <p className="mono-label">On the boards now</p>
                <span className="chip border-mint/30 text-mint">Live</span>
              </div>
              <h2 className="mt-3 font-display text-3xl leading-tight text-white/95">
                {feature.title}
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-sage/80">{feature.teaser}</p>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line/60 pt-4 text-[12px]">
                <div>
                  <dt className="mono-label text-[9px]">Store</dt>
                  <dd className="mt-0.5 text-white/85">{feature.shopName}</dd>
                </div>
                <div>
                  <dt className="mono-label text-[9px]">Area</dt>
                  <dd className="mt-0.5 text-white/85">{feature.shopArea}</dd>
                </div>
                <div>
                  <dt className="mono-label text-[9px]">Fixed reward</dt>
                  <dd className="mt-0.5 text-amber">{feature.rewardAmount} test credits</dd>
                </div>
                <div>
                  <dt className="mono-label text-[9px]">Coupon</dt>
                  <dd className="mt-0.5 text-white/85">
                    {feature.couponMinSpend > 0
                      ? `with ${formatKrw(feature.couponMinSpend)} purchase`
                      : "no minimum spend"}
                  </dd>
                </div>
              </dl>

              <Link href={`/quests/${feature.slug}`} className="btn-ghost mt-5 w-full">
                Open the dossier
              </Link>
              <p className="mt-3 text-[11px] leading-relaxed text-sage/45">
                Demo campaign with fictional clues and a demo-only coupon. A verified completion pays
                a real Devnet test-token transfer and records the counter on a MagicBlock ER.
              </p>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="font-display text-2xl text-white/80">No live quests yet</p>
              <p className="mt-2 text-sm text-sage/60">
                Approve a campaign in the operator console to put it on the boards.
              </p>
              <Link href="/operator" className="btn-ghost mt-4">
                Open operator console
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Live quests</p>
          <p className="mt-1 font-display text-2xl text-white/90">{stats.published}</p>
        </div>
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Awaiting review</p>
          <p className="mt-1 font-display text-2xl text-amber">{stats.pending}</p>
        </div>
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Clues in play</p>
          <p className="mt-1 font-display text-2xl text-white/90">{stats.clues}</p>
        </div>
        <div className="panel-flat px-4 py-3">
          <p className="mono-label text-[9px]">Demo merchants</p>
          <p className="mt-1 font-display text-2xl text-white/90">{stats.merchants}</p>
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mono-label">The loop</p>
            <h2 className="mt-2 font-display text-3xl text-white/90">One campaign, five hands</h2>
          </div>
          <p className="max-w-sm text-[12.5px] text-sage/55">
            Every step is connected to the same campaign record — nothing is a mock screen.
          </p>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LOOP.map((step) => (
            <li key={step.n} className="panel-flat flex h-full flex-col p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-amber/70">{step.n}</span>
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    step.state === "live"
                      ? "bg-mint"
                      : step.state === "partial"
                        ? "bg-amber"
                        : "bg-line",
                  ].join(" ")}
                  aria-hidden
                />
              </div>
              <p className="mono-label mt-3 text-[9px]">{step.role}</p>
              <h3 className="mt-1 text-[15px] font-semibold text-white/90">{step.title}</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-sage/65">{step.body}</p>
              <p className="mt-auto pt-3 text-[10px] tracking-wide text-sage/40 uppercase">
                {step.stateLabel}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {live.length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="mono-label">Player discovery</p>
              <h2 className="mt-2 font-display text-3xl text-white/90">Open trails</h2>
            </div>
            <Link href="/quests" className="text-[12.5px] text-amber-soft hover:underline">
              All quests →
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {live.slice(0, 3).map((campaign) => (
              <QuestCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <p className="mono-label">Four experiences, one app</p>
        <h2 className="mt-2 font-display text-3xl text-white/90">Pick your side of the counter</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => (
            <Link
              key={role.href}
              href={role.href}
              className="panel-flat group flex flex-col p-4 transition hover:border-amber/40 hover:bg-panel"
            >
              <div className="flex items-center justify-between">
                <span className="mono-label text-[9px]">{role.role}</span>
                <span
                  className={[
                    "font-mono text-[9px] tracking-[0.14em] uppercase",
                    role.state === "Live" ? "text-mint" : "text-sage/40",
                  ].join(" ")}
                >
                  {role.state}
                </span>
              </div>
              <h3 className="mt-2 font-display text-2xl text-white/90">{role.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-sage/65">{role.body}</p>
              <span className="mt-auto pt-4 text-[12px] text-amber-soft group-hover:underline">
                Enter →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <p className="mono-label">What works right now</p>
            <span className="chip border-mint/30 text-mint">P0.4</span>
          </div>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-sage/80">
            {[
              "Merchant creates a campaign with campaign-specific online and in-store clues.",
              "Published trails are playable: staged clues, a server-checked answer, 3- and 5-minute hints.",
              "Camera or uploaded evidence is reviewed by an operator — never auto-approved.",
              "A verified completion pays a real Devnet test-token transfer and commits a MagicBlock ER counter.",
              "An optional extended mystery issues a demo coupon that staff redeem once at the counter.",
              "The merchant dashboard counts verified completions, payouts and the coupon lifecycle.",
              "One SQLite database — every role reads the same connected state.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1 text-mint" aria-hidden>
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <p className="mono-label">Honest boundaries</p>
            <span className="chip border-amber/30 text-amber/80">Demo</span>
          </div>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-sage/80">
            {[
              "Rewards are real Devnet transfers, but the token is a valueless demo asset — not Circle USDC and not money.",
              "Evidence review is a person, not image recognition — there are no fake AI verdicts.",
              "Coupons are demo entitlements and cannot be redeemed in a real business; staff identity is typed, not authenticated.",
              "No sign-in yet — a browser cookie is the whole player identity.",
              "Camera and location are limited signals, never claimed as proof of presence.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1 text-amber/70" aria-hidden>
                  ·
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
