import { NextResponse } from "next/server";
import { createCampaign, getDemoMerchant, listAllCampaigns } from "@/lib/store";
import { validateCampaignInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ campaigns: listAllCampaigns() });
}

export async function POST(request: Request) {
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
  const campaign = createCampaign(parsed.value, merchant.id);
  return NextResponse.json({ campaign }, { status: 201 });
}
