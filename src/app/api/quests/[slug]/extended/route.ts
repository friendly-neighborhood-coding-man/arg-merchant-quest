import { NextResponse } from "next/server";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { advanceExtended, getSession } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

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
  if (action !== "read" && action !== "answer") {
    return jsonError("Unknown extended action.", 400);
  }

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  const answer = (body as { answer?: unknown })?.answer;
  if (action === "answer" && (typeof answer !== "string" || answer.trim().length === 0)) {
    return jsonError("Type the number the letter is pointing at.", 400);
  }

  const result = advanceExtended(session, campaign, action, action === "answer" ? (answer as string) : "");
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({ ok: true, solved: result.solved ?? false });
}
