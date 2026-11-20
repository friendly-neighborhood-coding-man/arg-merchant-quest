import { NextResponse } from "next/server";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { advanceQuest, getSession } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

const ACTIONS = ["read-online", "read-instore", "hint-1", "hint-2"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
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

  const action = (body as { action?: unknown })?.action;
  if (!isAction(action)) return jsonError("Unknown quest action.", 400);

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  const result = advanceQuest(session, campaign, action);
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({ ok: true });
}
