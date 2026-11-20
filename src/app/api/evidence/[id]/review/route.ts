import { NextResponse } from "next/server";
import { jsonError } from "@/lib/quest-http";
import { reviewEvidence } from "@/lib/quest-store";
import { validateEvidenceReviewInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

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
  return NextResponse.json({ ok: true });
}
