import { NextResponse } from "next/server";
import { createCampaign, getDemoMerchant, listAllCampaigns } from "@/lib/store";
import type { Campaign } from "@/lib/types";
import { validateCampaignInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * The campaign collection endpoint is public, so it must never serialize the
 * private verification data (counter answer, hints, target object, extended
 * mystery). Only the fields a player or listing page may see are returned.
 */
function publicCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    merchantName: campaign.merchantName,
    shopName: campaign.shopName,
    shopArea: campaign.shopArea,
    shopAddress: campaign.shopAddress,
    teaser: campaign.teaser,
    story: campaign.story,
    rewardAmount: campaign.rewardAmount,
    couponItem: campaign.couponItem,
    couponMinSpend: campaign.couponMinSpend,
    couponValidDays: campaign.couponValidDays,
    couponNotes: campaign.couponNotes,
    status: campaign.status,
    publishedAt: campaign.publishedAt,
    updatedAt: campaign.updatedAt,
    clues: campaign.clues.map((clue) => ({
      id: clue.id,
      kind: clue.kind,
      position: clue.position,
      title: clue.title,
      body: clue.body,
      url: clue.url,
    })),
  };
}

export async function GET() {
  const published = listAllCampaigns().filter((campaign) => campaign.status === "published");
  return NextResponse.json({
    campaigns: published.map(publicCampaign),
  });
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
