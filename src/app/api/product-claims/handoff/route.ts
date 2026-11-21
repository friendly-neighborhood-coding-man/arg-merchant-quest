import { NextResponse } from "next/server";
import { recordGameplayMilestone } from "@/lib/chain/counter";
import {
  getClaimByReference,
  handoffProductClaim,
  saveClaimChainEvidence,
} from "@/lib/product-claims";
import { jsonError } from "@/lib/quest-http";
import { getCampaignById } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Releasing the product clue is a local, single-use handoff. The clue release
 * itself does not depend on the chain being available: if MagicBlock is down the
 * handoff still succeeds and is clearly marked "local only" with the real error.
 * When the ER milestone does record, it is the gameplay state the AI companion
 * reads, and its signatures are stored as evidence.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Send a JSON body.", 400);
  }
  const input = body as {
    reference?: unknown;
    staffName?: unknown;
    handoffConfirmed?: unknown;
    note?: unknown;
  };
  if (typeof input.reference !== "string") {
    return jsonError("Enter the player's order reference.", 400);
  }
  if (typeof input.staffName !== "string") {
    return jsonError("Record who is handing over the clue.", 400);
  }

  const result = handoffProductClaim({
    reference: input.reference,
    staffName: input.staffName,
    handoffConfirmed: input.handoffConfirmed === true,
    note: typeof input.note === "string" ? input.note : undefined,
  });
  if (!result.ok) return jsonError(result.error, result.status);

  const campaign = getCampaignById(result.claim.campaignId);
  if (!campaign) return jsonError("The campaign for this claim no longer exists.", 404);

  let chain = null;
  let chainNote: string | null = null;
  try {
    const evidence = await recordGameplayMilestone(campaign.id, "clue");
    const committed = Boolean(evidence.commitSignature) && evidence.committedValue !== null;
    saveClaimChainEvidence(result.claim.id, {
      status: committed ? "committed" : "failed",
      counterAccount: evidence.counterAccount,
      programId: evidence.programId,
      createSignature: evidence.createSignature,
      delegateSignature: evidence.delegateSignature,
      incrementSignature: evidence.incrementSignature || null,
      commitSignature: evidence.commitSignature,
      counterValue: evidence.counterValue,
      committedValue: evidence.committedValue,
      erEndpoint: evidence.erEndpoint,
      error: evidence.error,
    });
    chain = {
      status: committed ? "committed" : "failed",
      counterAccount: evidence.counterAccount,
      programId: evidence.programId,
      createSignature: evidence.createSignature,
      delegateSignature: evidence.delegateSignature,
      incrementSignature: evidence.incrementSignature,
      commitSignature: evidence.commitSignature,
      committedValue: evidence.committedValue,
      erEndpoint: evidence.erEndpoint,
      error: evidence.error,
    };
    if (!committed) {
      chainNote =
        "The clue was released locally. The MagicBlock milestone did not commit, so the companion treats it as local state.";
    }
  } catch (error) {
    const message = (error as Error).message || "The MagicBlock milestone could not be recorded.";
    saveClaimChainEvidence(result.claim.id, {
      status: "failed",
      counterAccount: "",
      programId: "",
      createSignature: null,
      delegateSignature: null,
      incrementSignature: null,
      commitSignature: null,
      counterValue: null,
      committedValue: null,
      erEndpoint: "",
      error: message,
    });
    chainNote = `The clue was released locally. The MagicBlock milestone is unavailable: ${message}`;
  }

  const updated = getClaimByReference(result.claim.reference);
  return NextResponse.json({
    ok: true,
    reference: updated?.reference ?? result.claim.reference,
    status: updated?.status ?? result.claim.status,
    handedOffAt: updated?.handedOffAt ?? result.claim.handedOffAt,
    handedOffBy: updated?.handedOffBy ?? result.claim.handedOffBy,
    chain,
    chainNote,
  });
}
