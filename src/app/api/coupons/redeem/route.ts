import { NextResponse } from "next/server";
import { redeemCoupon } from "@/lib/coupons";
import { jsonError } from "@/lib/quest-http";

export const dynamic = "force-dynamic";

/**
 * Staff redemption. A single conditional UPDATE moves an issued, unexpired
 * coupon to redeemed; the same code can never be redeemed twice.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Send a JSON body with the coupon code.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const code = typeof input.code === "string" ? input.code : "";
  const staffName = typeof input.staffName === "string" ? input.staffName : "";
  const purchaseConfirmed = input.purchaseConfirmed === true;
  const note = typeof input.note === "string" ? input.note : undefined;

  const result = redeemCoupon({ code, staffName, purchaseConfirmed, note });
  if (!result.ok) return jsonError(result.error, result.status);

  return NextResponse.json({ ok: true, coupon: result.coupon });
}
