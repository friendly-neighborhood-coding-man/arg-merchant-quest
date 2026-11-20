import { NextResponse } from "next/server";
import { getDemoMerchant, updateCampaign } from "@/lib/store";
import { validateCampaignInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = validateCampaignInput(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Some campaign details need fixing.", fields: parsed.errors },
      { status: 400 },
    );
  }

  const merchant = getDemoMerchant();
  const result = updateCampaign(id, merchant.id, parsed.value);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ campaign: result.campaign });
}
