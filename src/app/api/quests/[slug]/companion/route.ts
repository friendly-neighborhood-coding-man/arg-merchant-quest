import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  answerCompanionMessage,
  companionConfigured,
  companionModelName,
  listCompanionMessages,
} from "@/lib/companion";
import {
  attachCollectiveInvestigation,
  collectiveSummary,
  personalInvestigation,
} from "@/lib/collective";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { getQuestView, getSession } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

/**
 * The companion endpoint reads the campaign's MagicBlock clue milestone on the
 * server before composing a reply. It never writes chain state, and the shared
 * evidence fragment is part of the response only when the ER gate is unlocked.
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
  const view = playerView ? await attachCollectiveInvestigation(playerView, campaign) : null;

  return NextResponse.json({
    messages: listCompanionMessages(session.id),
    mode: companionConfigured() ? "live" : "scripted",
    model: companionModelName(),
    collective: collectiveSummary(view?.collective ?? null),
    personal: view ? personalInvestigation(view) : null,
  });
}

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
  const raw = (body as { message?: unknown })?.message;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return jsonError("Type a question for the companion.", 400);
  }
  if (raw.length > 700) {
    return jsonError("Keep the question under 700 characters.", 400);
  }

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  const total = sessionCount(session.id);
  if (total > 80) {
    return jsonError(
      "This demo trail has reached its companion message limit. The counter's timed hints still work.",
      429,
    );
  }

  const playerView = getQuestView(playerId, campaign);
  if (!playerView) return jsonError("Start the quest first.", 409);
  const view = await attachCollectiveInvestigation(playerView, campaign);

  const result = await answerCompanionMessage(session.id, view, raw);

  return NextResponse.json({
    reply: result.reply,
    mode: result.mode,
    model: result.model,
    note: result.note,
    collective: collectiveSummary(view.collective),
  });
}

function sessionCount(sessionId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM companion_messages WHERE session_id = ?")
    .get(sessionId) as { count: number };
  return row.count;
}
