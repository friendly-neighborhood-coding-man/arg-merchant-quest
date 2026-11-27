import { NextResponse } from "next/server";
import { jsonError, loadCampaign, readPlayerId } from "@/lib/quest-http";
import { checkRateLimit } from "@/lib/limits";
import { MAX_PHOTO_BYTES, getSession, submitEvidence } from "@/lib/quest-store";

export const dynamic = "force-dynamic";

function numberField(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
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

  const playerId = await readPlayerId();
  if (!playerId) return jsonError("Start the quest first.", 409);
  const session = getSession(playerId, campaign.id);
  if (!session) return jsonError("Start the quest first.", 409);

  // Photos are written to the persistent volume; cap submissions per address.
  const hourly = checkRateLimit(request, "evidence", 20, 60 * 60 * 1000);
  if (!hourly.ok) {
    return jsonError(
      `Too many evidence uploads from this address. Try again in ${Math.ceil(hourly.retryAfterSeconds / 60)} minutes.`,
      429,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Send the evidence as a form upload.", 400);
  }

  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return jsonError("Attach the photo you captured.", 400);
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return jsonError("The photo is larger than 6 MB. Try again.", 413);
  }

  const kind = String(form.get("kind") ?? "camera");
  const capturedAt = String(form.get("capturedAt") ?? "");
  const lat = numberField(form, "latitude");
  const lng = numberField(form, "longitude");
  const accuracy = numberField(form, "accuracy");

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const result = submitEvidence({
    session,
    campaign,
    kind,
    mime: photo.type || "image/jpeg",
    bytes,
    capturedAt,
    location:
      lat !== null && lng !== null
        ? {
            lat,
            lng,
            accuracy,
            at: String(form.get("locationAt") ?? "") || new Date().toISOString(),
          }
        : null,
  });

  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({
    ok: true,
    evidence: {
      id: result.evidence.id,
      status: result.evidence.status,
      kind: result.evidence.kind,
      hasLocation: Boolean(result.evidence.location),
    },
  });
}
