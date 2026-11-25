import { NextResponse } from "next/server";
import { getSession, getQuestView } from "@/lib/quest-store";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import {
  aiAccessState,
  quoteDeepInvestigation,
  runDeepInvestigation,
  settleQuote,
} from "@/lib/ai-payments/service";

export const dynamic = "force-dynamic";

/**
 * Token-funded deep investigation.
 *
 * GET  — price, token balance, open quotes, refund credits and receipts.
 * POST — action "quote" (bind a question to a price), "settle" (find and verify
 *        the Devnet payment for that quote) or "investigate" (run the one paid
 *        Claude call and return its receipt).
 *
 * The route never accepts a client-reported balance or "I paid" flag. Payment
 * comes only from a verified on-chain transfer carrying the quote's reference.
 */
async function loadContext(slug: string) {
  const campaign = await loadCampaign(slug);
  if (!campaign || campaign.status !== "published") {
    return { error: jsonError("This trail is not live.", 404) };
  }
  const playerId = await readPlayerId();
  if (!playerId) return { error: jsonError("Start the quest first.", 409) };
  const session = getSession(playerId, campaign.id);
  if (!session) return { error: jsonError("Start the quest first.", 409) };
  const view = getQuestView(playerId, campaign);
  if (!view) return { error: jsonError("Start the quest first.", 409) };
  return { campaign, session, view };
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const loaded = await loadContext(slug);
  if ("error" in loaded) return loaded.error;
  return NextResponse.json(await aiAccessState(loaded.view));
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const loaded = await loadContext(slug);
  if ("error" in loaded) return loaded.error;
  const { view } = loaded;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Send a JSON body.", 400);
  }
  const action = (body as { action?: unknown })?.action;

  if (action === "quote") {
    const question = (body as { question?: unknown })?.question;
    if (typeof question !== "string" || question.trim().length < 3) {
      return jsonError("Write the question you want investigated first.", 400);
    }
    if (question.length > 700) return jsonError("Keep the question under 700 characters.", 400);
    const outcome = await quoteDeepInvestigation(view, question);
    if (!outcome.ok) return NextResponse.json({ ...outcome }, { status: 409 });
    return NextResponse.json({ ...outcome });
  }

  if (action === "settle") {
    const intentId = (body as { intentId?: unknown })?.intentId;
    if (typeof intentId !== "string" || !intentId) return jsonError("Which quote?", 400);
    const outcome = await settleQuote(view, intentId);
    if (!outcome.ok) {
      return NextResponse.json(
        { ...outcome },
        { status: outcome.status === "pending" ? 202 : 409 },
      );
    }
    return NextResponse.json({ ...outcome });
  }

  if (action === "investigate") {
    const intentId = (body as { intentId?: unknown })?.intentId;
    if (typeof intentId !== "string" || !intentId) return jsonError("Which quote?", 400);
    const outcome = await runDeepInvestigation(view, intentId);
    const status = outcome.status === "ok" ? 200 : outcome.status === "running" ? 202 : 409;
    return NextResponse.json({ ...outcome }, { status });
  }

  return jsonError("Unknown action.", 400);
}
