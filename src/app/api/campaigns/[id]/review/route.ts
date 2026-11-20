import { NextResponse } from "next/server";
import { reviewCampaign } from "@/lib/store";
import { validateReviewInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = validateReviewInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = reviewCampaign(id, parsed.decision, parsed.note);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ campaign: result.campaign });
}
