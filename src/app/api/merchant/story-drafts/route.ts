import { NextResponse } from "next/server";
import { jsonError } from "@/lib/quest-http";
import { checkRateLimit } from "@/lib/limits";
import { generateStoryIdeas, parseStoryLabInput } from "@/lib/story-lab";

export const dynamic = "force-dynamic";

/** Draft-only story aid. It cannot create or publish a campaign. */
export async function POST(request: Request) {
  // Each draft is a real model call from the merchant console.
  const hourly = checkRateLimit(request, "story-drafts", 10, 60 * 60 * 1000);
  if (!hourly.ok) {
    return jsonError(
      `The Story Lab has drafted a lot from this address. Try again in ${Math.ceil(hourly.retryAfterSeconds / 60)} minutes.`,
      429,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Send a JSON body.", 400);
  }
  const input = parseStoryLabInput(body);
  if (!input.businessName || !input.product) {
    return jsonError("Add at least the business name and the signature product.", 400);
  }

  const result = await generateStoryIdeas(input);
  return NextResponse.json(result);
}
