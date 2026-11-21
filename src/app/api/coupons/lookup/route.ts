import { NextResponse } from "next/server";
import { couponView, getCouponByCode, normaliseCouponCode } from "@/lib/coupons";
import { jsonError } from "@/lib/quest-http";

export const dynamic = "force-dynamic";

/** Staff coupon lookup. Read-only: nothing is redeemed by looking a code up. */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!normaliseCouponCode(code)) {
    return jsonError("Enter the coupon code printed on the player's coupon.", 400);
  }

  const coupon = getCouponByCode(code);
  if (!coupon) {
    return jsonError(
      "No demo coupon matches that code. Check it with the player and try again.",
      404,
    );
  }
  return NextResponse.json({ ok: true, coupon: couponView(coupon) });
}
