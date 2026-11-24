import { NextResponse } from "next/server";
import {
  attachCollectiveInvestigation,
  collectiveSummary,
  personalInvestigation,
} from "@/lib/collective";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { getQuestView, getSession } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

/**
 * Read-only P2 investigation state. It exists so the gate can be inspected
 * (and recorded as evidence) without opening the page: personal progress and
 * the campaign-wide MagicBlock milestone are returned separately, and the
 * shared evidence fragment is omitted until the ER gate is unlocked.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const campaign = await loadCampaign(slug);
  if (!campaign || campaign.status !== "published") {
    return jsonError("This trail is not live.", 404);
  }
  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  const playerView = getQuestView(playerId, campaign);
  if (!playerView) return jsonError("Start the quest first.", 409);
  const view = await attachCollectiveInvestigation(playerView, campaign);

  return NextResponse.json({
    personal: personalInvestigation(view),
    collective: collectiveSummary(view.collective),
  });
}
