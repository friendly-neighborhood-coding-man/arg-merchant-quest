"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CouponView } from "@/lib/coupons";
import { CouponTicket, CouponStatusChip } from "./coupon-ticket";

type Result = { ok: boolean; message: string } | null;

/**
 * Staff counter. The staff member looks a coupon up, reads its real campaign
 * terms, explicitly confirms the fictional purchase condition, and redeems it.
 * No payment is processed and nothing here pretends a purchase was verified.
 */
export function StaffRedemption() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [staffName, setStaffName] = useState("staff.demo");
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [coupon, setCoupon] = useState<CouponView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState<"lookup" | "redeem" | null>(null);

  async function lookup() {
    setBusy("lookup");
    setError(null);
    setResult(null);
    setCoupon(null);
    setPurchaseConfirmed(false);
    try {
      const response = await fetch(`/api/coupons/lookup?code=${encodeURIComponent(code)}`);
      const data = (await response.json().catch(() => ({}))) as {
        coupon?: CouponView;
        error?: string;
      };
      if (!response.ok || !data.coupon) {
        setError(data.error ?? "That coupon could not be found.");
      } else {
        setCoupon(data.coupon);
        setCode(data.coupon.code);
      }
    } catch {
      setError("Network error — the coupon was not looked up.");
    }
    setBusy(null);
  }

  async function redeem() {
    if (!coupon) return;
    setBusy("redeem");
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: coupon.code,
          staffName,
          purchaseConfirmed,
          note,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        coupon?: CouponView;
        error?: string;
      };
      if (!response.ok || !data.coupon) {
        setError(data.error ?? "The redemption was not recorded.");
      } else {
        setCoupon(data.coupon);
        setResult({
          ok: true,
          message: `Redeemed ${data.coupon.couponItem} for ${data.coupon.shopName}. This code can no longer be used.`,
        });
        setNote("");
        setPurchaseConfirmed(false);
        router.refresh();
      }
    } catch {
      setError("Network error — the redemption was not recorded.");
    }
    setBusy(null);
  }

  const canRedeem =
    coupon !== null && coupon.displayStatus === "issued" && purchaseConfirmed && !busy;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label">Step one · find the coupon</p>
        <span className="chip border-line text-sage/60">Demo staff tool</span>
      </div>
      <h2 className="mt-2 font-display text-2xl text-white/95">Enter the player&apos;s code.</h2>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
        The code is printed on the player&apos;s coupon. Looking it up only reads its terms — nothing
        is redeemed until you confirm below.
      </p>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim()) void lookup();
        }}
      >
        <input
          className="input font-mono tracking-[0.1em] uppercase"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="NINTH-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          aria-label="Coupon code"
        />
        <button
          type="submit"
          disabled={busy !== null || code.trim().length < 4}
          className="btn-primary shrink-0 py-2.5"
        >
          {busy === "lookup" ? "Looking up…" : "Look up coupon"}
        </button>
      </form>

      {error ? (
        <div className="mt-3 rounded-xl border border-rust/40 bg-rust/10 px-3.5 py-2.5">
          <p className="text-[12.5px] font-semibold text-rust">Not redeemed</p>
          <p className="mt-1 break-words text-[12px] leading-relaxed text-rust/85">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-xl border border-mint/40 bg-mint/10 px-3.5 py-2.5">
          <p className="text-[12.5px] font-semibold text-mint">Coupon redeemed</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mint/85">{result.message}</p>
        </div>
      ) : null}

      {coupon ? (
        <div className="mt-5 space-y-4">
          <CouponTicket coupon={coupon} />

          {coupon.displayStatus === "issued" ? (
            <div className="rounded-xl border border-line/80 bg-ink-soft/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="mono-label text-[9px]">Step two · confirm and redeem</p>
                <CouponStatusChip status={coupon.displayStatus} />
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber/25 bg-amber/[0.06] p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-amber"
                  checked={purchaseConfirmed}
                  onChange={(event) => setPurchaseConfirmed(event.target.checked)}
                />
                <span className="text-[12px] leading-relaxed text-sage/80">
                  I confirm that the fictional purchase condition for this demonstration has been
                  met
                  {coupon.couponMinSpend > 0
                    ? ` (demo minimum ₩${coupon.couponMinSpend.toLocaleString("en-US")})`
                    : ""}
                  . No real payment is processed and no real purchase is verified.
                </span>
              </label>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="staff-name">
                    Staff identity
                  </label>
                  <input
                    id="staff-name"
                    className="input"
                    value={staffName}
                    onChange={(event) => setStaffName(event.target.value)}
                    placeholder="staff.demo"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="staff-note">
                    Note (optional)
                  </label>
                  <input
                    id="staff-note"
                    className="input"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. showed code at the counter"
                    maxLength={200}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void redeem()}
                disabled={!canRedeem}
                className="btn-primary mt-3 w-full py-2.5"
              >
                {busy === "redeem" ? "Recording redemption…" : "Redeem this demo coupon"}
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-sage/45">
                Redemption is a single database state change. Once used, the same code cannot be
                redeemed again.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line/70 bg-ink-soft/50 px-4 py-3">
              <p className="text-[12.5px] leading-relaxed text-sage/70">
                {coupon.displayStatus === "redeemed"
                  ? "This coupon is already redeemed. Staff cannot redeem it a second time."
                  : "This coupon has expired. Staff cannot redeem it."}{" "}
                Look up another code to continue.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
