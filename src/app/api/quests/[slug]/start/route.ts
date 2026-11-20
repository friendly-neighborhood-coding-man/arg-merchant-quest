import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isPlayerId, jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { PLAYER_COOKIE, startQuest } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const campaign = await loadCampaign(slug);
  if (!campaign || campaign.status !== "published") {
    return jsonError("This trail is not live.", 404);
  }

  const existing = await readPlayerId();
  const playerId = existing && isPlayerId(existing) ? existing : `plr_${randomUUID()}`;
  const result = startQuest(playerId, campaign);
  if (!result.ok) return jsonError(result.error, result.status);

  const response = NextResponse.json({
    ok: true,
    sessionId: result.session.id,
    startedAt: result.session.startedAt,
  });
  if (existing !== playerId) {
    response.cookies.set({
      name: PLAYER_COOKIE,
      value: playerId,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
  }
  return response;
}
