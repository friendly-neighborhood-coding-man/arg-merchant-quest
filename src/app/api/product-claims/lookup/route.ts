import { NextResponse } from "next/server";
import { getCampaignById } from "@/lib/store";
import { getClaimByReference } from "@/lib/product-claims";
import { jsonError } from "@/lib/quest-http";

export const dynamic = "force-dynamic";

/** Staff lookup by the player's product-claim reference. Read-only. */
export async function GET(request: Request) {
  const reference = new URL(request.url).searchParams.get("reference") ?? "";
  if (!reference.trim()) return jsonError("Enter the player's order reference.", 400);

  const claim = getClaimByReference(reference);
  if (!claim) {
    return jsonError("No demo product claim matches that reference. Check it with the player.", 404);
  }
  const campaign = getCampaignById(claim.campaignId);
  if (!campaign) return jsonError("The campaign for this claim no longer exists.", 404);

  return NextResponse.json({
    claim: {
      reference: claim.reference,
      productName: claim.productName,
      priceLabel: claim.priceLabel,
      status: claim.status,
      requestedAt: claim.requestedAt,
      handedOffAt: claim.handedOffAt,
      handedOffBy: claim.handedOffBy,
      chainStatus: claim.chainStatus,
      chainCounterAccount: claim.chainCounterAccount,
      chainErEndpoint: claim.chainErEndpoint,
      chainCommittedValue: claim.chainCommittedValue,
      chainError: claim.chainError,
    },
    campaign: {
      title: campaign.title,
      shopName: campaign.shopName,
      shopArea: campaign.shopArea,
      productName: campaign.productName,
      priceLabel: campaign.productPriceLabel,
      prop: campaign.productProp,
    },
  });
}
