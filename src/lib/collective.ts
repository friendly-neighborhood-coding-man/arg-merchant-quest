import { readGameplayMilestone } from "./chain/counter";
import type { QuestView } from "./quest-store";
import type { Campaign } from "./types";

/**
 * P2 collective investigation gate.
 *
 * The campaign already has a real MagicBlock clue milestone: the deployed
 * completion-counter program, seeded with `milestoneSeedCampaignId(campaignId,
 * "clue")`, incremented on the Ephemeral Rollup and committed back to Solana
 * when a product clue is handed over. That counter is the *only* source this
 * module trusts for unlocking shared investigation evidence.
 *
 * Rules, in order of importance:
 * - A client value, a local product-claim row or a guess never count. Only a
 *   read of the campaign's own milestone account does.
 * - The live ER read is the gate. If the ER cannot be read (unconfigured,
 *   RPC error, timeout, malformed data, account not delegated) the shared
 *   evidence stays locked, even when an older committed value is visible.
 * - A committed base-layer value above the live ER value means the ER view is
 *   behind. The committed value wins and the read is marked stale.
 * - The counter records eligible handoffs, not unique real-world people, and
 *   the text says so wherever the count is shown.
 *
 * The fragment is prewritten story material, not model output, and contains no
 * campaign answer. It is attached to the player view only once unlocked, so it
 * is absent from the page HTML, the companion context and every API response
 * before that point.
 */

export const COLLECTIVE_THRESHOLD = 2;

export type CollectivePhase = "unavailable" | "none" | "first" | "unlocked";

export interface CollectiveEvidence {
  title: string;
  text: string;
  source: string;
}

export interface CollectiveState {
  campaignId: string;
  /** unavailable = no trustworthy current count; none = 0; first = 1; unlocked = 2+. */
  phase: CollectivePhase;
  threshold: number;
  /** The count the gate used: the live ER value, or a higher committed value. */
  count: number | null;
  countSource: "er" | "base" | null;
  /** The value read from the Ephemeral Rollup in this request. */
  erLive: number | null;
  /** The value committed on Solana, read from the base layer. */
  committed: number | null;
  delegated: boolean;
  counter: string | null;
  erEndpoint: string | null;
  readAt: string;
  /** The live ER read is behind the committed record. */
  stale: boolean;
  error: string | null;
  /** Present only when the gate is unlocked. */
  evidence: CollectiveEvidence | null;
}

/**
 * Prewritten shared evidence, one fragment per campaign slug. Only The Ninth
 * Cup has collective content in P2; other campaigns keep the milestone display
 * but have no fragment, which is stated instead of invented. The fragment
 * supports the story and never names the answers (5, 11, 19).
 */
export const COLLECTIVE_EVIDENCE: Record<string, CollectiveEvidence> = {
  "the-ninth-cup": {
    title: "The second handoff · the shop's count",
    source: "Compiled from two verified product-clue handoffs on the campaign milestone",
    text:
      "Two verified handoffs came back to the counter with the same correction. Both sleeves carried the river-crack stamp, and both readers wrote the same word in the margin: “closing”. One of them counted the boards above the grinder; the other counted what sits on them. The roaster's note beside the register says the disagreement is the point: the recipe was never written for a visitor's count, and the cup that stays behind the machine was filled after the sign turned. Read the shelf clue as the shop's count, not your own, and the last instruction stops looking like arithmetic.",
  },
};

export function evidenceFor(slug: string): CollectiveEvidence | null {
  return COLLECTIVE_EVIDENCE[slug] ?? null;
}

function validCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function collectivePhase(count: number | null): CollectivePhase {
  if (count === null) return "unavailable";
  if (count >= COLLECTIVE_THRESHOLD) return "unlocked";
  return count >= 1 ? "first" : "none";
}

export interface MilestoneRead {
  counterAccount: string | null;
  erValue: number | null;
  baseValue: number | null;
  delegated: boolean;
  erEndpoint: string | null;
}

export type MilestoneReader = (campaignId: string, milestone: "clue") => Promise<MilestoneRead>;

/** Pure gate: turn one read (or a failure) into the state the rest of the app uses. */
export function buildCollectiveState(
  campaign: Campaign,
  read: MilestoneRead | null,
  error: string | null = null,
  readAt: string = new Date().toISOString(),
): CollectiveState {
  const erLive = validCount(read?.erValue ?? null);
  const committed = validCount(read?.baseValue ?? null);
  const delegated = Boolean(read?.delegated);

  let count: number | null = null;
  let countSource: "er" | "base" | null = null;
  let stale = false;

  // Unlocking requires a readable live ER value. A base-layer value alone is
  // shown as committed evidence but never substitutes for an unreachable ER.
  if (delegated && erLive !== null) {
    count = erLive;
    countSource = "er";
    if (committed !== null && committed > erLive) {
      stale = true;
      count = committed;
      countSource = "base";
    }
  }

  const phase = collectivePhase(count);
  return {
    campaignId: campaign.id,
    phase,
    threshold: COLLECTIVE_THRESHOLD,
    count,
    countSource,
    erLive,
    committed,
    delegated,
    counter: read?.counterAccount ?? null,
    erEndpoint: read?.erEndpoint ?? null,
    readAt,
    stale,
    error:
      error ??
      (phase === "unavailable"
        ? delegated
          ? "The Ephemeral Rollup returned no readable milestone value."
          : "The campaign's Ephemeral Rollup milestone could not be read."
        : null),
    evidence: phase === "unlocked" ? evidenceFor(campaign.slug) : null,
  };
}

export interface CollectiveReadOptions {
  reader?: MilestoneReader;
  timeoutMs?: number;
  now?: () => Date;
}

/**
 * Read the campaign's clue milestone through the existing MagicBlock ER
 * integration. Never throws: an unreachable, slow or malformed read becomes an
 * `unavailable` state, which cannot unlock anything.
 */
export async function readCollectiveState(
  campaign: Campaign,
  options: CollectiveReadOptions = {},
): Promise<CollectiveState> {
  const reader: MilestoneReader =
    options.reader ?? ((campaignId) => readGameplayMilestone(campaignId, "clue"));
  const timeoutMs = options.timeoutMs ?? 2500;
  const readAt = (options.now?.() ?? new Date()).toISOString();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = await Promise.race([
      reader(campaign.id, "clue"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`The MagicBlock milestone read did not answer within ${timeoutMs}ms.`)),
          timeoutMs,
        );
      }),
    ]);
    return buildCollectiveState(campaign, read, null, readAt);
  } catch (error) {
    return buildCollectiveState(
      campaign,
      null,
      (error as Error).message || "The MagicBlock milestone read failed.",
      readAt,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Attach the gate result to a player view (pure, so tests can inject a read). */
export function withCollective(view: QuestView, state: CollectiveState): QuestView {
  return { ...view, collective: state };
}

/** The server-side composition used by the play page and the API routes. */
export async function attachCollectiveInvestigation(
  view: QuestView,
  campaign: Campaign,
  options: CollectiveReadOptions = {},
): Promise<QuestView> {
  return withCollective(view, await readCollectiveState(campaign, options));
}

/** Public JSON shape. The evidence is omitted from the payload until unlocked. */
export function collectiveSummary(state: CollectiveState | null) {
  if (!state) return null;
  const unlocked = state.phase === "unlocked";
  return {
    phase: state.phase,
    threshold: state.threshold,
    count: state.count,
    countSource: state.countSource,
    erLive: state.erLive,
    committed: state.committed,
    delegated: state.delegated,
    counter: state.counter,
    erEndpoint: state.erEndpoint,
    readAt: state.readAt,
    stale: state.stale,
    error: state.error,
    locked: !unlocked,
    evidence: unlocked ? state.evidence : null,
  };
}

/** Personal progress, kept separate from the campaign-wide collective count. */
export function personalInvestigation(view: QuestView) {
  return {
    stage: view.stage,
    onlineRead: view.trail.onlineRead,
    onlineTotal: view.trail.onlineTotal,
    instoreRead: view.trail.instoreRead,
    instoreTotal: view.trail.instoreTotal,
    counterAnswered: view.answer.solved,
    verified: Boolean(view.completion),
    extendedStep: view.extended.step,
    extendedSolved: view.extended.solved,
    clueReleased: Boolean(view.optional.clue),
    claimStatus: view.optional.claim?.status ?? null,
    claimReference: view.optional.claim?.reference ?? null,
    finalSolved: view.optional.final.solved,
  };
}
