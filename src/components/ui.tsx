import Link from "next/link";
import type { Campaign, CampaignStatus, Clue } from "@/lib/types";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/types";
import { couponWindowCopy, formatKrw, rewardCopy } from "@/lib/format";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-line/60 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="mono-label">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 text-[15px] leading-relaxed text-sage/80">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "border-line bg-white/5 text-sage",
  pending: "border-amber/40 bg-amber/10 text-amber-soft",
  published: "border-mint/40 bg-mint/10 text-mint",
  rejected: "border-rust/40 bg-rust/10 text-rust",
};

const STATUS_DOT: Record<CampaignStatus, string> = {
  draft: "bg-sage/60",
  pending: "bg-amber",
  published: "bg-mint",
  rejected: "bg-rust",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={cn("chip", STATUS_STYLES[status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="panel-flat px-4 py-3.5">
      <p className="mono-label text-[10px]">{label}</p>
      <p className="mt-1 font-display text-2xl text-white/90">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-sage/60">{hint}</p> : null}
    </div>
  );
}

export function TermSheet({ campaign }: { campaign: Campaign }) {
  return (
    <div className="panel-flat p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="mono-label">Coupon terms</p>
        <span className="chip border-amber/30 text-amber/80">Demo only</span>
      </div>
      <p className="mt-2 font-display text-lg leading-snug text-white/90">{campaign.couponItem}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
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
        <p className="mt-3 border-t border-line/60 pt-3 text-[12px] leading-relaxed text-sage/70">
          {campaign.couponNotes}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] leading-relaxed text-amber/70">
        Demo entitlement with visible conditions. Issued once when a verified player also solves the
        optional extended mystery. No cash value and not redeemable in a real business.
      </p>
    </div>
  );
}

export function ClueTrail({
  clues,
  kind,
  showLinks = true,
}: {
  clues: Clue[];
  kind: "online" | "instore";
  showLinks?: boolean;
}) {
  const items = clues.filter((clue) => clue.kind === kind).sort((a, b) => a.position - b.position);
  if (items.length === 0) {
    return <p className="text-sm text-sage/60">No clues of this kind yet.</p>;
  }
  return (
    <ol className="space-y-2.5">
      {items.map((clue, index) => (
        <li key={clue.id} className="panel-flat p-4">
          <div className="flex gap-3">
            <span className="mt-0.5 font-mono text-[11px] tracking-widest text-amber/70">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <h4 className="text-[15px] font-semibold text-white/90">{clue.title}</h4>
              <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line text-sage/80">
                {clue.body}
              </p>
              {showLinks && clue.url ? (
                <a
                  className="link mt-2 inline-block text-[12px]"
                  href={clue.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open source ↗
                </a>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RewardLine({ amount }: { amount: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display text-2xl text-amber">{amount}</span>
      <span className="text-[12px] text-sage/70">{rewardCopy(amount)}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="panel-flat flex flex-col items-start gap-3 px-6 py-10">
      <p className="font-display text-xl text-white/85">{title}</p>
      <p className="max-w-lg text-sm leading-relaxed text-sage/70">{description}</p>
      {action ? (
        <Link href={action.href} className="btn-ghost mt-1">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-relaxed text-sage/50">{children}</p>;
}
