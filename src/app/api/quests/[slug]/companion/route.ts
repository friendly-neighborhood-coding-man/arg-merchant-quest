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
  sessionMayReadCollective,
} from "@/lib/collective";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { aiRepliesInLastDay, checkRateLimit, dailyAiReplyCap } from "@/lib/limits";
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
  // The same policy as the outbound provider request: restricted collective
  // material is in this transcript only when this session may read it now.
  const allowCollective = sessionMayReadCollective(view?.collective ?? null);

  return NextResponse.json({
    messages: listCompanionMessages(session.id, 40, { allowCollective }),
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
  // The route is public; nothing here touches chain state.
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

  // Live model calls are the deployment's only metered cost. Limit each address
  // and the deployment as a whole; the scripted guide is capped the same way so
  // the number the visitor sees is one honest reply budget.
  const hourly = checkRateLimit(request, "companion", 30, 60 * 60 * 1000);
  if (!hourly.ok) {
    return jsonError(
      `Mara has answered a lot from this address. Try again in ${Math.ceil(hourly.retryAfterSeconds / 60)} minutes; the counter's timed hints still work.`,
      429,
    );
  }
  const replyCap = dailyAiReplyCap();
  if (aiRepliesInLastDay() >= replyCap) {
    return jsonError(
      `This demo has spent its ${replyCap} AI replies for the last 24 hours. The trail, the counter's hints and the reward are unaffected.`,
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
