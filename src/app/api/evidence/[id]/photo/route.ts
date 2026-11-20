import fs from "node:fs";
import { NextResponse } from "next/server";
import { getEvidenceById, evidencePhotoFile } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

/**
 * Serves a stored evidence photo to the operator console. There is no account
 * system in this prototype, so this route is intentionally not linked from any
 * player-facing page; it only resolves an id that only the review queue shows.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const evidence = getEvidenceById(id);
  if (!evidence) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const file = evidencePhotoFile(evidence);
  if (!file || !fs.existsSync(file)) {
    return NextResponse.json({ error: "No photo stored for this evidence." }, { status: 404 });
  }

  const bytes = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": evidence.photoMime ?? "image/jpeg",
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
    },
  });
}
