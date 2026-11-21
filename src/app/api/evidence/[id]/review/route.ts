import { NextResponse } from "next/server";
import { jsonError } from "@/lib/quest-http";
import { reviewEvidence } from "@/lib/quest-store";
import { verifyCompletionOnChain } from "@/lib/reward-service";
import { validateEvidenceReviewInput } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Send a JSON body.", 400);
  }

  const parsed = validateEvidenceReviewInput(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const result = reviewEvidence(id, parsed.decision, parsed.note);
  if (!result.ok) return jsonError(result.error, result.status);

  // Approval creates the completion; a verified completion then updates the
  // campaign's counter on a MagicBlock Ephemeral Rollup. A chain failure is
  // recorded on the completion instead of silently passing as success.
  let chain: { ok: boolean; error: string | null } | null = null;
  if (result.completionId) {
    chain = await verifyCompletionOnChain(result.completionId);
  }

  return NextResponse.json({
    ok: true,
    completionId: result.completionId,
    chain,
  });
}
