import { NextResponse } from "next/server";
import { jsonError } from "@/lib/quest-http";
import { generateStoryIdeas, parseStoryLabInput } from "@/lib/story-lab";

export const dynamic = "force-dynamic";

/** Draft-only story aid. It cannot create or publish a campaign. */
export async function POST(request: Request) {
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
