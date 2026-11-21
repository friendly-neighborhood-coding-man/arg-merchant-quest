import { NextResponse } from "next/server";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { requestProductClaim } from "@/lib/product-claims";
import { getSession, submitFinalAnswer } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

/**
 * P1 product-clue actions. `request` creates the order reference (no payment);
 * `final` checks the hidden-ending answer on the server and only after staff
 * released the product clue.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const campaign = await loadCampaign(slug);
  if (!campaign || campaign.status !== "published") {
    return jsonError("This trail is not live.", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Send a JSON body.", 400);
  }
  const action = (body as { action?: unknown })?.action;
  if (action !== "request" && action !== "final") {
    return jsonError("Unknown product action.", 400);
  }

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  if (action === "request") {
    const result = requestProductClaim(session.id, campaign);
    if (!result.ok) return jsonError(result.error, result.status);
    return NextResponse.json({
      ok: true,
      claim: { reference: result.claim.reference, status: result.claim.status },
    });
  }

  const answer = (body as { answer?: unknown })?.answer;
  if (typeof answer !== "string" || answer.trim().length === 0) {
    return jsonError("Type the number the product clue points at.", 400);
  }
  const result = submitFinalAnswer(session, campaign, answer);
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({ ok: true, solved: true });
}
