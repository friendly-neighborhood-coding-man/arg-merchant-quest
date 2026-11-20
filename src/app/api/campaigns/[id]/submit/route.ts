import { NextResponse } from "next/server";
import { getDemoMerchant, submitCampaignForReview } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const merchant = getDemoMerchant();
  const result = submitCampaignForReview(id, merchant.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ campaign: result.campaign });
}
