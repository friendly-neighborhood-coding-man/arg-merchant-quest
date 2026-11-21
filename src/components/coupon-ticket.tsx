import Link from "next/link";
import type { CouponStatus, CouponView } from "@/lib/coupons";
import { formatDateTime, formatKrw } from "@/lib/format";

const STATUS_STYLE: Record<CouponStatus, string> = {
  issued: "border-mint/40 bg-mint/10 text-mint",
  redeemed: "border-berry/40 bg-berry/10 text-berry",
  expired: "border-rust/40 bg-rust/10 text-rust",
};

const STATUS_LABEL: Record<CouponStatus, string> = {
  issued: "Issued · ready to show",
  redeemed: "Redeemed",
  expired: "Expired",
};

export function CouponStatusChip({ status }: { status: CouponStatus }) {
  return <span className={`chip ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * The player's demo coupon. Deliberately looks like a ticket rather than a
 * transaction receipt, so the player journey does not sit under chain debug
 * details. It is a fictional entitlement, never a real business offer.
 */
export function CouponTicket({
  coupon,
  compact = false,
}: {
  coupon: CouponView;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[13px] tracking-[0.14em] text-amber-soft">{coupon.code}</p>
          <p className="mt-0.5 truncate text-[12px] text-sage/65">
            {coupon.shopName} · {coupon.couponItem}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CouponStatusChip status={coupon.displayStatus} />
          <Link href="/quests#coupons" className="text-[11.5px] text-sage/45 hover:text-amber-soft">
            details ↑
          </Link>
        </div>
      </div>
    );
  }

  const redeemable = coupon.displayStatus === "issued";

  return (
    <section
      id={`coupon-${coupon.id}`}
      className="rise overflow-hidden rounded-2xl border border-amber/45 bg-gradient-to-b from-amber/[0.09] to-ink-soft/80"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-amber/25 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-amber/45 bg-amber/10 text-[13px] text-amber">
            ✦
          </span>
          <div>
            <p className="mono-label text-[9px] text-amber/80">Demo secret-menu coupon</p>
            <p className="text-[11px] text-sage/55">
              {coupon.merchantName} · {coupon.shopArea}
            </p>
          </div>
        </div>
        <CouponStatusChip status={coupon.displayStatus} />
      </div>

      <div className="px-5 py-5">
        <p className="font-display text-2xl leading-tight text-white/95">{coupon.couponItem}</p>
        <p className="mt-1 text-[12.5px] text-sage/65">
          {coupon.shopName} · {coupon.shopAddress}
        </p>

        <div className="mt-4 rounded-xl border border-amber/30 bg-ink/80 px-4 py-4 text-center">
          <p className="mono-label text-[9px] text-amber/70">Show this code to staff</p>
          <p className="mt-2 font-mono text-[19px] leading-none font-bold tracking-[0.06em] whitespace-nowrap text-amber-soft sm:text-[30px] sm:tracking-[0.12em]">
            {coupon.code}
          </p>
          <p className="mt-2 text-[11px] text-sage/45">
            One demo redemption per coupon. Staff enters it in the Staff counter.
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
          <div>
            <dt className="mono-label text-[9px]">Minimum purchase</dt>
            <dd className="mt-1 text-white/85">
              {coupon.couponMinSpend > 0 ? formatKrw(coupon.couponMinSpend) : "No minimum"}
            </dd>
          </div>
          <div>
            <dt className="mono-label text-[9px]">Validity</dt>
            <dd className="mt-1 text-white/85">
              {coupon.couponValidDays === 1
                ? "1 day after issue"
                : `${coupon.couponValidDays} days after issue`}
            </dd>
          </div>
          <div>
            <dt className="mono-label text-[9px]">Issued</dt>
            <dd className="mt-1 text-white/85">{formatDateTime(coupon.issuedAt)}</dd>
          </div>
          <div>
            <dt className="mono-label text-[9px]">Expires</dt>
            <dd className={coupon.isExpired ? "mt-1 text-rust" : "mt-1 text-white/85"}>
              {formatDateTime(coupon.expiresAt)}
            </dd>
          </div>
        </dl>

        {coupon.couponNotes ? (
          <p className="mt-3 border-t border-amber/15 pt-3 text-[12px] leading-relaxed text-sage/70">
            {coupon.couponNotes}
          </p>
        ) : null}

        <div
          className={`mt-4 rounded-xl border px-4 py-3 ${
            redeemable
              ? "border-mint/30 bg-mint/[0.07]"
              : coupon.isRedeemed
                ? "border-berry/30 bg-berry/[0.07]"
                : "border-rust/30 bg-rust/[0.07]"
          }`}
        >
          <p className="text-[12.5px] font-semibold text-white/90">
            {redeemable
              ? "How to use it"
              : coupon.isRedeemed
                ? "This coupon has been used"
                : "This coupon has expired"}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-sage/75">
            {redeemable
              ? `Open the Staff counter with this code. Staff checks the terms and confirms that the demo purchase condition was met, then marks it redeemed. It cannot be used twice.`
              : coupon.isRedeemed
                ? `Redeemed ${formatDateTime(coupon.redeemedAt)}${coupon.redeemedBy ? ` by ${coupon.redeemedBy}` : ""}. Your achievement and verified completion are unchanged.`
                : `It expired ${formatDateTime(coupon.expiresAt)} and staff can no longer redeem it. Your achievement and verified completion are unchanged.`}
          </p>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-amber/70">
          Fictional demo entitlement with visible conditions. No cash value, not a real business
          offer, and not redeemable at any real merchant.
        </p>
      </div>
    </section>
  );
}
