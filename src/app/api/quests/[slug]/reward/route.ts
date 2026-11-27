import { NextResponse } from "next/server";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { getCompletion, getSession } from "@/lib/quest-store";
import { claimReward, rewardStateForCompletion } from "@/lib/reward-service";
import { checkRateLimit, dailyPayoutCap, payoutsInLastDay } from "@/lib/limits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The player's reward claim. One verified completion, one fixed test-token
 * payout on Solana Devnet, submitted from the demo treasury.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const campaign = await loadCampaign(slug);
  if (!campaign) return jsonError("This trail does not exist.", 404);

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  const completion = getCompletion(session.id);
  if (!completion) {
    return jsonError("The counter has not verified this quest yet.", 409);
  }

  // The demo treasury is one hot wallet paying valueless test tokens. Two
  // independent guards keep a public URL from draining it: a per-address hourly
  // limit and a global 24-hour cap counted from stored payouts.
  const hourly = checkRateLimit(request, "reward", 10, 60 * 60 * 1000);
  if (!hourly.ok) {
    return jsonError(
      `Too many reward claims from this address. Try again in ${Math.ceil(hourly.retryAfterSeconds / 60)} minutes.`,
      429,
    );
  }
  const cap = dailyPayoutCap();
  const paidToday = payoutsInLastDay();
  if (completion.payoutStatus !== "paid" && paidToday >= cap) {
    return jsonError(
      `This demo has paid its ${cap} Devnet rewards for the last 24 hours. The trail still works; the payout panel will open again after the budget is replenished.`,
      429,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Send a JSON body with the wallet address.", 400);
  }
  const wallet = (body as { wallet?: unknown })?.wallet;
  if (typeof wallet !== "string" || wallet.trim().length === 0) {
    return jsonError("Paste the Devnet wallet address that should receive the reward.", 400);
  }

  const result = await claimReward(completion, wallet);
  if (!result.ok) return jsonError(result.error, result.status);

  return NextResponse.json({
    ok: true,
    reward: await rewardStateForCompletion(result.completion),
    completionId: result.completion.id,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const campaign = await loadCampaign(slug);
  if (!campaign) return jsonError("This trail does not exist.", 404);

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  const completion = getCompletion(session.id);
  if (!completion) return jsonError("The counter has not verified this quest yet.", 409);

  const wallet = new URL(request.url).searchParams.get("wallet");
  return NextResponse.json({
    reward: await rewardStateForCompletion(completion, wallet),
  });
}
