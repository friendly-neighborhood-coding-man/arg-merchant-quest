import { FIXTURE_COLLECTIVE_EVIDENCE } from "./collective-fixture";
import { readGameplayMilestone } from "./chain/counter";
import { getDb } from "./db";
import type { QuestView } from "./quest-store";
import type { Campaign } from "./types";

/**
 * P2 collective investigation gate.
 *
 * The campaign already has a real MagicBlock clue milestone: the deployed
 * completion-counter program, seeded with `milestoneSeedCampaignId(campaignId,
 * "clue")`, incremented on the Ephemeral Rollup and committed back to Solana
 * when a product clue is handed over. That counter is the *only* thing that
 * unlocks the shared investigation.
 *
 * The fragment itself is prewritten fiction, not a record of real players. It
 * is attributed as a story fragment in the UI, in the companion's prompt and in
 * every API response, and it contains no campaign answer.
 *
 * Access policy:
 * - Only a trustworthy read of this campaign's own milestone can grant access.
 *   A client value, another session's grant or a local claim row never does.
 * - A session that has verified count >= 2 keeps that access through a
 *   temporary ER outage. The stored grant is per (session, campaign) and is
 *   labelled "previously verified", with its count, source and timestamp.
 * - A session that has never verified an unlocked milestone stays locked while
 *   the ER is unreadable, even when an older committed value is visible.
 * - A committed base-layer value above the live ER value means the ER view is
 *   behind; the committed value wins and the read is marked stale.
 *
 * The counter records eligible handoffs, not unique real-world people, and the
 * text says so wherever the count is shown.
 */

export const COLLECTIVE_THRESHOLD = 2;

export const COLLECTIVE_SOURCE =
  "Prewritten story fragment · unlocked when the campaign's MagicBlock milestone reaches 2.";

export type CollectivePhase = "unavailable" | "none" | "first" | "unlocked";

/** How the current session's access was established in this request. */
export type CollectiveAuthority = "live" | "previously_verified" | "none";

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
  /** The count the gate used: a live value, or this session's verified count. */
  count: number | null;
  countSource: "er" | "base" | "stored" | null;
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
  /** Present only when this session may read the shared fragment. */
  evidence: CollectiveEvidence | null;
  /** This campaign has a prewritten collective fragment configured. */
  configured: boolean;
  /** `previously_verified` means the current ER read failed but the grant holds. */
  authority: CollectiveAuthority;
  /** When this session's unlock was last verified live. */
  lastVerifiedAt: string | null;
}

/**
 * Prewritten shared evidence, one fragment per campaign slug. Only The Ninth
 * Cup has collective content in P2; other campaigns have no fragment, so their
 * panel is omitted instead of inventing one. The fragment is an in-world shop
 * record: it never claims real player observations and never names the answers
 * (5, 11, 19), and it does not describe the product clue as non-arithmetic.
 */
export const COLLECTIVE_EVIDENCE: Record<string, CollectiveEvidence> = {
  "the-ninth-cup": {
    title: "The ledger page · the shop's own count",
    source: COLLECTIVE_SOURCE,
    text:
      "A page torn from the roastery's old order ledger, kept flat behind the register. The customer column is ruled and filled in; the column beside it is ruled and empty, headed with one word: reserved. Under it, in pencil, in the same hand as the label on the top shelf: “The house does not count what it pours for itself. Count the shelves the room actually has, not the ones the photograph happened to crop, and pour for each of those before the reserved column is touched. The reserved column is left to the end of the page.” The page is dated the same spring the letter arrived, and the roaster's signature is smudged twice, as if the pen was set down and picked up again.",
  },
};

/**
 * Distinctive lines from fragment texts shipped before this corrective pass,
 * kept so pre-patch transcripts are filtered too. An old assistant message is
 * not by itself evidence of authorization.
 */
const LEGACY_FRAGMENT_MARKERS = [
  "Two verified handoffs came back to the counter",
  "both readers wrote the same word in the margin",
  "the last instruction stops looking like arithmetic",
  "Compiled from two verified product-clue handoffs",
  "The second handoff · the shop's count",
];

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Distinctive sentence-level markers, so a partial quote is still caught. */
function sentenceMarkers(text: string): string[] {
  const normalized = normalize(text);
  const sentences = normalized
    .split(/(?<=[.!?…])(?:\s+|["”’])/)
    .map((sentence) => sentence.replace(/^["“]/, "").trim())
    .filter((sentence) => sentence.length >= 40);
  return [normalized, ...sentences];
}

const RESTRICTED_MARKERS: string[] = (() => {
  const markers = new Set<string>();
  for (const marker of LEGACY_FRAGMENT_MARKERS) markers.add(marker);
  for (const fragment of [
    ...Object.values(COLLECTIVE_EVIDENCE),
    ...Object.values(FIXTURE_COLLECTIVE_EVIDENCE),
  ]) {
    markers.add(fragment.title);
    for (const marker of sentenceMarkers(fragment.text)) markers.add(marker);
  }
  return [...markers].map(normalize);
})();

/**
 * True when a stored message contains collective fragment material. Used to
 * keep restricted text out of an unauthorized transcript without deleting it.
 */
export function containsRestrictedCollective(content: string): boolean {
  const normalized = normalize(content);
  return RESTRICTED_MARKERS.some((marker) => normalized.includes(marker));
}

/** The single policy both the companion route and the provider request use. */
export function sessionMayReadCollective(state: CollectiveState | null): boolean {
  return Boolean(state && state.phase === "unlocked" && state.evidence);
}

export function evidenceFor(slug: string): CollectiveEvidence | null {
  // The fixture map is checked second so a production slug can never be
  // shadowed by demo material.
  return COLLECTIVE_EVIDENCE[slug] ?? FIXTURE_COLLECTIVE_EVIDENCE[slug] ?? null;
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

/** Pure gate: turn one live read (or a failure) into the state the app uses. */
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
    configured: evidenceFor(campaign.slug) !== null,
    authority: phase === "unlocked" ? "live" : "none",
    lastVerifiedAt: null,
  };
}

/**
 * Turn an unavailable live read into retained access for a session that has a
 * stored unlock. The state says plainly that the current ER read failed.
 */
export function retainCollectiveState(
  campaign: Campaign,
  state: CollectiveState,
  grant: CollectiveAuthorization,
): CollectiveState {
  const count = Math.max(grant.verifiedCount, COLLECTIVE_THRESHOLD);
  return {
    ...state,
    phase: "unlocked",
    count,
    countSource: "stored",
    erLive: state.erLive,
    stale: state.stale,
    error: state.error,
    evidence: evidenceFor(campaign.slug),
    configured: evidenceFor(campaign.slug) !== null,
    authority: "previously_verified",
    lastVerifiedAt: grant.lastVerifiedAt,
  };
}

export interface CollectiveAuthorization {
  campaignId: string;
  sessionId: string;
  unlockedAt: string;
  verifiedCount: number;
  verificationSource: string;
  lastVerifiedAt: string;
}

function toAuthorization(row: {
  campaign_id: string;
  session_id: string;
  collective_unlocked_at: string;
  verified_count: number;
  verification_source: string;
  last_verified_at: string;
}): CollectiveAuthorization {
  return {
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    unlockedAt: row.collective_unlocked_at,
    verifiedCount: row.verified_count,
    verificationSource: row.verification_source,
    lastVerifiedAt: row.last_verified_at,
  };
}

/**
 * The stored grant for this exact (session, campaign) pair. A missing row means
 * "never verified here", never "someone else unlocked it".
 */
export function getCollectiveAuthorization(
  sessionId: string,
  campaignId: string,
): CollectiveAuthorization | null {
  try {
    const row = getDb()
      .prepare(
        `SELECT campaign_id, session_id, collective_unlocked_at, verified_count,
                verification_source, last_verified_at
         FROM collective_authorizations
         WHERE session_id = ? AND campaign_id = ?`,
      )
      .get(sessionId, campaignId) as
      | {
          campaign_id: string;
          session_id: string;
          collective_unlocked_at: string;
          verified_count: number;
          verification_source: string;
          last_verified_at: string;
        }
      | undefined;
    return row ? toAuthorization(row) : null;
  } catch {
    // A storage problem must never turn into access.
    return null;
  }
}

/**
 * Record (or refresh) this session's unlock. Called only after a trustworthy
 * read of this campaign's own milestone. The original unlock time is kept.
 */
export function recordCollectiveAuthorization(
  sessionId: string,
  campaignId: string,
  verifiedCount: number,
  verificationSource: "er-live" | "base-committed",
  at: string,
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO collective_authorizations
           (campaign_id, session_id, collective_unlocked_at, verified_count,
            verification_source, last_verified_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (session_id, campaign_id) DO UPDATE SET
           verified_count = MAX(verified_count, excluded.verified_count),
           verification_source = excluded.verification_source,
           last_verified_at = excluded.last_verified_at`,
      )
      .run(campaignId, sessionId, at, verifiedCount, verificationSource, at);
  } catch {
    // The current request can still read the live value; only persistence for a
    // later outage is lost, and losing it can never grant extra access.
  }
}

export interface CollectiveReadOptions {
  reader?: MilestoneReader;
  timeoutMs?: number;
  now?: () => Date;
  /** The authenticated session this read is for; required for persistence. */
  sessionId?: string | null;
}

/**
 * Read the campaign's clue milestone through the existing MagicBlock ER
 * integration. Never throws: an unreachable, slow or malformed read becomes
 * either this session's retained access (with its stored grant) or an
 * `unavailable` state that cannot unlock anything.
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
  let state: CollectiveState;
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
    state = buildCollectiveState(campaign, read, null, readAt);
  } catch (error) {
    state = buildCollectiveState(
      campaign,
      null,
      (error as Error).message || "The MagicBlock milestone read failed.",
      readAt,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const sessionId = options.sessionId ?? null;
  if (!sessionId) return state;

  if (state.phase === "unlocked") {
    recordCollectiveAuthorization(
      sessionId,
      campaign.id,
      state.count ?? COLLECTIVE_THRESHOLD,
      state.countSource === "base" ? "base-committed" : "er-live",
      readAt,
    );
    return { ...state, authority: "live", lastVerifiedAt: readAt };
  }

  // Retention is limited to a failed current read; a live count below the
  // threshold is a real answer and stays locked.
  if (state.phase === "unavailable") {
    const grant = getCollectiveAuthorization(sessionId, campaign.id);
    if (grant) return retainCollectiveState(campaign, state, grant);
  }

  return state;
}

/** Attach the gate result to a player view (pure, so tests can inject a read). */
export function withCollective(view: QuestView, state: CollectiveState): QuestView {
  return { ...view, collective: state };
}

/**
 * The server-side composition used by the play page and the API routes. The
 * session comes from the view, so a request can only ever use its own grant.
 */
export async function attachCollectiveInvestigation(
  view: QuestView,
  campaign: Campaign,
  options: CollectiveReadOptions = {},
): Promise<QuestView> {
  return withCollective(
    view,
    await readCollectiveState(campaign, {
      ...options,
      sessionId: options.sessionId ?? view.sessionId,
    }),
  );
}

/**
 * Public JSON shape. The evidence is omitted from the payload unless this
 * session is currently authorized to read it.
 */
export function collectiveSummary(state: CollectiveState | null) {
  if (!state) return null;
  const unlocked = sessionMayReadCollective(state);
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
    configured: state.configured,
    authority: state.authority,
    lastVerifiedAt: state.lastVerifiedAt,
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
