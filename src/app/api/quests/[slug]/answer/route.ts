import { NextResponse } from "next/server";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { getSession, submitQuestAnswer } from "@/lib/quest-store";

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

  const answer = (body as { answer?: unknown })?.answer;
  if (typeof answer !== "string" || answer.trim().length === 0) {
    return jsonError("Type the number the counter is asking for.", 400);
  }
  if (answer.length > 80) return jsonError("That answer is too long.", 400);

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  const result = submitQuestAnswer(session, campaign, answer);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, attempts: result.attempts },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, solved: true });
}
