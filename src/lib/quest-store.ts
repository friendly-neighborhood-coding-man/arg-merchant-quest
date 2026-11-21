import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evidenceDir, getDb } from "./db";
import {
  couponView,
  ensureCouponForSession,
  issueCouponForCompletion,
  type CouponView,
} from "./coupons";
import { getCampaignById } from "./store";
import type { Campaign, Clue, EvidenceKind, EvidenceStatus, QuestStage } from "./types";

export const PLAYER_COOKIE = "arg_player";
export const HINT_ONE_SECONDS = 3 * 60;
export const HINT_TWO_SECONDS = 5 * 60;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const HINT_FALLBACK_1 =
  "The counter slides a note across: count what the rule asks you to count, not the cup in the title.";
const HINT_FALLBACK_2 =
  "The counter slides a second note: every shelf gets a pour, and the cup that was never poured gets one more.";
const EXT_HINT_FALLBACK =
  "The counter points at the framed photo: nine cups on the stall, and two that never went home.";

const IMAGE_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
};

export interface QuestSession {
  id: string;
  playerId: string;
  campaignId: string;
  startedAt: string;
  lastSeenAt: string;
  onlineRead: number;
  instoreRead: number;
  hint1At: string | null;
  hint2At: string | null;
  answerAttempts: number;
  solvedAt: string | null;
  completedAt: string | null;
  extendedStep: number;
  extendedAttempts: number;
  extendedSolvedAt: string | null;
}

export interface Evidence {
  id: string;
  sessionId: string;
  campaignId: string;
  playerId: string;
  kind: EvidenceKind;
  photoPath: string | null;
  photoMime: string | null;
  location: {
    lat: number;
    lng: number;
    accuracy: number | null;
    at: string | null;
  } | null;
  capturedAt: string;
  status: EvidenceStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface Completion {
  id: string;
  sessionId: string;
  campaignId: string;
  playerId: string;
  evidenceId: string;
  rewardAmount: number;
  couponEligible: boolean;
  extendedSolved: boolean;
  verificationMethod: string;
  verifiedBy: string;
  verifiedAt: string;
  payoutStatus: string;
  /** P0.3 devnet payout. */
  payoutWallet: string | null;
  payoutMint: string | null;
  payoutAmountBaseUnits: number | null;
  payoutSignature: string | null;
  payoutError: string | null;
  payoutRecipientBefore: number | null;
  payoutRecipientAfter: number | null;
  payoutRecipientTokenAccount: string | null;
  payoutClaimedAt: string | null;
  payoutConfirmedAt: string | null;
  /** P0.3 MagicBlock completion-counter evidence. */
  chainStatus: string | null;
  chainCounterAccount: string | null;
  chainProgramId: string | null;
  chainCreateSignature: string | null;
  chainDelegateSignature: string | null;
  chainIncrementSignature: string | null;
  chainCommitSignature: string | null;
  chainCounterValue: number | null;
  chainCommittedValue: number | null;
  chainErEndpoint: string | null;
  chainUpdatedAt: string | null;
  chainError: string | null;
}

interface SessionRow {
  id: string;
  player_id: string;
  campaign_id: string;
  started_at: string;
  last_seen_at: string;
  online_read: number;
  instore_read: number;
  hint1_at: string | null;
  hint2_at: string | null;
  answer_attempts: number;
  solved_at: string | null;
  completed_at: string | null;
  extended_step: number;
  extended_attempts: number;
  extended_solved_at: string | null;
}

interface EvidenceRow {
  id: string;
  session_id: string;
  campaign_id: string;
  player_id: string;
  kind: EvidenceKind;
  photo_path: string | null;
  photo_mime: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_accuracy: number | null;
  location_at: string | null;
  captured_at: string;
  status: EvidenceStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface CompletionRow {
  id: string;
  session_id: string;
  campaign_id: string;
  player_id: string;
  evidence_id: string;
  reward_amount: number;
  coupon_eligible: number;
  extended_solved: number;
  verification_method: string;
  verified_by: string;
  verified_at: string;
  payout_status: string;
  payout_wallet: string | null;
  payout_mint: string | null;
  payout_amount_base_units: number | null;
  payout_signature: string | null;
  payout_error: string | null;
  payout_recipient_before: number | null;
  payout_recipient_after: number | null;
  payout_recipient_token_account: string | null;
  payout_claimed_at: string | null;
  payout_confirmed_at: string | null;
  chain_status: string | null;
  chain_counter_account: string | null;
  chain_program_id: string | null;
  chain_create_signature: string | null;
  chain_delegate_signature: string | null;
  chain_increment_signature: string | null;
  chain_commit_signature: string | null;
  chain_counter_value: number | null;
  chain_committed_value: number | null;
  chain_er_endpoint: string | null;
  chain_updated_at: string | null;
  chain_error: string | null;
}

export type ActionResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function toSession(row: SessionRow): QuestSession {
  return {
    id: row.id,
    playerId: row.player_id,
    campaignId: row.campaign_id,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    onlineRead: row.online_read,
    instoreRead: row.instore_read,
    hint1At: row.hint1_at,
    hint2At: row.hint2_at,
    answerAttempts: row.answer_attempts,
    solvedAt: row.solved_at,
    completedAt: row.completed_at,
    extendedStep: row.extended_step,
    extendedAttempts: row.extended_attempts,
    extendedSolvedAt: row.extended_solved_at,
  };
}

function toEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    sessionId: row.session_id,
    campaignId: row.campaign_id,
    playerId: row.player_id,
    kind: row.kind,
    photoPath: row.photo_path,
    photoMime: row.photo_mime,
    location:
      row.location_lat !== null && row.location_lng !== null
        ? {
            lat: row.location_lat,
            lng: row.location_lng,
            accuracy: row.location_accuracy,
            at: row.location_at,
          }
        : null,
    capturedAt: row.captured_at,
    status: row.status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

function toCompletion(row: CompletionRow): Completion {
  return {
    id: row.id,
    sessionId: row.session_id,
    campaignId: row.campaign_id,
    playerId: row.player_id,
    evidenceId: row.evidence_id,
    rewardAmount: row.reward_amount,
    couponEligible: row.coupon_eligible === 1,
    extendedSolved: row.extended_solved === 1,
    verificationMethod: row.verification_method,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    payoutStatus: row.payout_status,
    payoutWallet: row.payout_wallet,
    payoutMint: row.payout_mint,
    payoutAmountBaseUnits: row.payout_amount_base_units,
    payoutSignature: row.payout_signature,
    payoutError: row.payout_error,
    payoutRecipientBefore: row.payout_recipient_before,
    payoutRecipientAfter: row.payout_recipient_after,
    payoutRecipientTokenAccount: row.payout_recipient_token_account,
    payoutClaimedAt: row.payout_claimed_at,
    payoutConfirmedAt: row.payout_confirmed_at,
    chainStatus: row.chain_status,
    chainCounterAccount: row.chain_counter_account,
    chainProgramId: row.chain_program_id,
    chainCreateSignature: row.chain_create_signature,
    chainDelegateSignature: row.chain_delegate_signature,
    chainIncrementSignature: row.chain_increment_signature,
    chainCommitSignature: row.chain_commit_signature,
    chainCounterValue: row.chain_counter_value,
    chainCommittedValue: row.chain_committed_value,
    chainErEndpoint: row.chain_er_endpoint,
    chainUpdatedAt: row.chain_updated_at,
    chainError: row.chain_error,
  };
}

function cluesOf(campaign: Campaign, kind: "online" | "instore"): Clue[] {
  return campaign.clues
    .filter((clue) => clue.kind === kind)
    .sort((a, b) => a.position - b.position);
}

/** Turn "five" into "5" so a numeric answer is not lost to spelling. */
function canonicalAnswer(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/, "");
  return NUMBER_WORDS[base] ?? base;
}

export function answersMatch(input: string, expected: string): boolean {
  const given = canonicalAnswer(input);
  if (!given) return false;
  return given === canonicalAnswer(expected);
}

export function isPlayable(campaign: Campaign): boolean {
  return campaign.status === "published" && Boolean(campaign.answer.trim() && campaign.answerQuestion.trim());
}

export function getSession(playerId: string, campaignId: string): QuestSession | null {
  const row = getDb()
    .prepare("SELECT * FROM quest_sessions WHERE player_id = ? AND campaign_id = ?")
    .get(playerId, campaignId) as unknown as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function getSessionById(id: string): QuestSession | null {
  const row = getDb().prepare("SELECT * FROM quest_sessions WHERE id = ?").get(id) as unknown as
    | SessionRow
    | undefined;
  return row ? toSession(row) : null;
}

export function startQuest(
  playerId: string,
  campaign: Campaign,
): { ok: true; session: QuestSession } | { ok: false; status: number; error: string } {
  if (campaign.status !== "published") {
    return { ok: false, status: 409, error: "This trail is not live yet." };
  }
  if (!isPlayable(campaign)) {
    return {
      ok: false,
      status: 409,
      error: "This trail has no counter answer configured yet, so it cannot be played.",
    };
  }

  const existing = getSession(playerId, campaign.id);
  if (existing) {
    touchSession(existing.id);
    return { ok: true, session: { ...existing, lastSeenAt: new Date().toISOString() } };
  }

  const db = getDb();
  const id = `qst_${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO quest_sessions (id, player_id, campaign_id, started_at, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, playerId, campaign.id, now, now, now);

  const session = getSession(playerId, campaign.id);
  if (!session) return { ok: false, status: 500, error: "The quest session could not be created." };
  return { ok: true, session };
}

export function touchSession(id: string) {
  getDb()
    .prepare("UPDATE quest_sessions SET last_seen_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function elapsedSeconds(session: QuestSession): number {
  const started = new Date(session.startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  // The trail clock stops when the operator verifies the completion.
  const finished = session.completedAt ? new Date(session.completedAt).getTime() : null;
  const now = finished && !Number.isNaN(finished) ? Math.min(Date.now(), finished) : Date.now();
  return Math.max(0, Math.floor((now - started) / 1000));
}

export function advanceQuest(
  session: QuestSession,
  campaign: Campaign,
  action: "read-online" | "read-instore" | "hint-1" | "hint-2",
): ActionResult {
  const db = getDb();
  const now = new Date().toISOString();
  const online = cluesOf(campaign, "online");
  const instore = cluesOf(campaign, "instore");

  if (action === "read-online") {
    if (session.onlineRead >= online.length) {
      return { ok: false, status: 409, error: "You have already read every online source." };
    }
    db.prepare(
      "UPDATE quest_sessions SET online_read = ?, last_seen_at = ? WHERE id = ?",
    ).run(session.onlineRead + 1, now, session.id);
    return { ok: true };
  }

  if (action === "read-instore") {
    if (session.onlineRead < online.length) {
      return { ok: false, status: 409, error: "Finish the online trail before heading in." };
    }
    if (session.instoreRead >= instore.length) {
      return { ok: false, status: 409, error: "You have already found every in-store clue." };
    }
    db.prepare(
      "UPDATE quest_sessions SET instore_read = ?, last_seen_at = ? WHERE id = ?",
    ).run(session.instoreRead + 1, now, session.id);
    return { ok: true };
  }

  const isFirst = action === "hint-1";
  const already = isFirst ? session.hint1At : session.hint2At;
  if (already) return { ok: true };

  const unlockAt = isFirst ? HINT_ONE_SECONDS : HINT_TWO_SECONDS;
  const elapsed = elapsedSeconds(session);
  if (elapsed < unlockAt) {
    const wait = unlockAt - elapsed;
    return {
      ok: false,
      status: 409,
      error: `That note is not available yet. The counter looks at the clock: ${Math.ceil(wait / 60)} more minute${Math.ceil(wait / 60) === 1 ? "" : "s"}.`,
    };
  }

  db.prepare(
    `UPDATE quest_sessions SET ${isFirst ? "hint1_at" : "hint2_at"} = ?, last_seen_at = ? WHERE id = ?`,
  ).run(now, now, session.id);
  return { ok: true };
}

export function submitQuestAnswer(
  session: QuestSession,
  campaign: Campaign,
  rawAnswer: string,
): { ok: true } | { ok: false; status: number; error: string; attempts: number } {
  const online = cluesOf(campaign, "online");
  const instore = cluesOf(campaign, "instore");
  if (session.onlineRead < online.length || session.instoreRead < instore.length) {
    return {
      ok: false,
      status: 409,
      error: "The counter is not ready for your answer yet. Finish both trails first.",
      attempts: session.answerAttempts,
    };
  }
  if (session.solvedAt) return { ok: true };

  const attempts = session.answerAttempts + 1;
  const now = new Date().toISOString();
  if (!answersMatch(rawAnswer, campaign.answer)) {
    getDb()
      .prepare("UPDATE quest_sessions SET answer_attempts = ?, last_seen_at = ? WHERE id = ?")
      .run(attempts, now, session.id);
    return {
      ok: false,
      status: 422,
      error:
        attempts >= 3
          ? "Not the number the counter needs. Take another look at the shelves — and ask for a hint if you want one."
          : "Not the number the counter needs. Check the rule against what you counted in the shop.",
      attempts,
    };
  }

  getDb()
    .prepare(
      "UPDATE quest_sessions SET answer_attempts = ?, solved_at = ?, last_seen_at = ? WHERE id = ?",
    )
    .run(attempts, now, now, session.id);
  return { ok: true };
}

export function getLatestEvidence(sessionId: string): Evidence | null {
  const row = getDb()
    .prepare("SELECT * FROM evidence WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(sessionId) as unknown as EvidenceRow | undefined;
  return row ? toEvidence(row) : null;
}

export function getEvidenceById(id: string): Evidence | null {
  const row = getDb().prepare("SELECT * FROM evidence WHERE id = ?").get(id) as unknown as
    | EvidenceRow
    | undefined;
  return row ? toEvidence(row) : null;
}

export function evidencePhotoFile(evidence: Evidence): string | null {
  if (!evidence.photoPath) return null;
  return path.join(evidenceDir(), path.basename(evidence.photoPath));
}

export interface SubmitEvidenceInput {
  session: QuestSession;
  campaign: Campaign;
  kind: string;
  mime: string;
  bytes: Uint8Array;
  capturedAt: string;
  location: { lat: number; lng: number; accuracy: number | null; at: string } | null;
}

export function submitEvidence(
  input: SubmitEvidenceInput,
): { ok: true; evidence: Evidence } | { ok: false; status: number; error: string } {
  const { session, campaign } = input;

  if (!session.solvedAt) {
    return { ok: false, status: 409, error: "Solve the counter's question before submitting evidence." };
  }

  const latest = getLatestEvidence(session.id);
  if (latest && latest.status === "pending") {
    return { ok: false, status: 409, error: "Your evidence is already waiting for review." };
  }
  if (latest && latest.status === "approved") {
    return { ok: false, status: 409, error: "This quest is already verified." };
  }

  const kind = input.kind as EvidenceKind;
  if (kind !== "camera" && kind !== "upload" && kind !== "simulation") {
    return { ok: false, status: 400, error: "Unknown evidence type." };
  }
  const ext = IMAGE_MIME_EXT[input.mime];
  if (!ext) {
    return { ok: false, status: 400, error: "Send a JPEG, PNG or WebP image." };
  }
  if (input.bytes.byteLength === 0) {
    return { ok: false, status: 400, error: "The photo was empty." };
  }
  if (input.bytes.byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, status: 413, error: "The photo is larger than 6 MB. Try again." };
  }

  const location = input.location;
  if (
    location &&
    (!Number.isFinite(location.lat) ||
      !Number.isFinite(location.lng) ||
      Math.abs(location.lat) > 90 ||
      Math.abs(location.lng) > 180)
  ) {
    return { ok: false, status: 400, error: "The submitted location was not valid." };
  }

  const id = `evd_${randomUUID()}`;
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(evidenceDir(), filename), input.bytes);

  const captured = new Date(input.capturedAt);
  const capturedAt = Number.isNaN(captured.getTime())
    ? new Date().toISOString()
    : captured.toISOString();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO evidence (
         id, session_id, campaign_id, player_id, kind, photo_path, photo_mime,
         location_lat, location_lng, location_accuracy, location_at,
         captured_at, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      id,
      session.id,
      campaign.id,
      session.playerId,
      kind,
      filename,
      input.mime,
      location?.lat ?? null,
      location?.lng ?? null,
      location?.accuracy ?? null,
      location?.at ?? null,
      capturedAt,
      now,
    );
  touchSession(session.id);

  const evidence = getEvidenceById(id);
  if (!evidence) return { ok: false, status: 500, error: "The evidence could not be stored." };
  return { ok: true, evidence };
}

export function reviewEvidence(
  evidenceId: string,
  decision: "approve" | "reject",
  note: string,
  reviewer = "operator.demo",
): { ok: true; completionId: string | null } | { ok: false; status: number; error: string } {
  const db = getDb();
  const evidence = getEvidenceById(evidenceId);
  if (!evidence) return { ok: false, status: 404, error: "Evidence not found." };
  if (evidence.status !== "pending") {
    return { ok: false, status: 409, error: "This evidence has already been reviewed." };
  }

  const campaignRow = db
    .prepare("SELECT reward_amount FROM campaigns WHERE id = ?")
    .get(evidence.campaignId) as unknown as { reward_amount: number } | undefined;
  if (!campaignRow) return { ok: false, status: 404, error: "Campaign not found." };

  const now = new Date().toISOString();

  if (decision === "reject") {
    db.prepare(
      `UPDATE evidence SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ?
       WHERE id = ?`,
    ).run(note || null, reviewer, now, evidenceId);
    return { ok: true, completionId: null };
  }

  const completionId = `cmpl_${randomUUID()}`;
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE evidence SET status = 'approved', review_note = ?, reviewed_by = ?, reviewed_at = ?
       WHERE id = ?`,
    ).run(note || null, reviewer, now, evidenceId);
    db.prepare("UPDATE quest_sessions SET completed_at = ?, last_seen_at = ? WHERE id = ?").run(
      now,
      now,
      evidence.sessionId,
    );
    db.prepare(
      `INSERT INTO quest_completions (
         id, session_id, campaign_id, player_id, evidence_id, reward_amount,
         coupon_eligible, extended_solved, verification_method, verified_by,
         verified_at, payout_status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'pending', ?)`,
    ).run(
      completionId,
      evidence.sessionId,
      evidence.campaignId,
      evidence.playerId,
      evidence.id,
      campaignRow.reward_amount,
      evidence.kind === "simulation" ? "operator_review_simulation" : "operator_review",
      reviewer,
      now,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, completionId };
}

export function getCompletion(sessionId: string): Completion | null {
  const row = getDb()
    .prepare("SELECT * FROM quest_completions WHERE session_id = ?")
    .get(sessionId) as unknown as CompletionRow | undefined;
  return row ? toCompletion(row) : null;
}

export function advanceExtended(
  session: QuestSession,
  campaign: Campaign,
  action: "read" | "answer",
  rawAnswer = "",
): { ok: true; solved?: boolean } | { ok: false; status: number; error: string } {
  if (!session.completedAt) {
    return { ok: false, status: 409, error: "Finish the basic quest before opening the second question." };
  }
  if (!campaign.extAnswer.trim()) {
    return { ok: false, status: 409, error: "This trail has no extended mystery." };
  }

  const db = getDb();
  const now = new Date().toISOString();

  if (action === "read") {
    if (session.extendedStep >= 3) {
      return { ok: false, status: 409, error: "You have opened every part of the second question." };
    }
    db.prepare(
      "UPDATE quest_sessions SET extended_step = ?, last_seen_at = ? WHERE id = ?",
    ).run(session.extendedStep + 1, now, session.id);
    return { ok: true };
  }

  if (session.extendedStep < 3) {
    return { ok: false, status: 409, error: "Open all three parts of the second question first." };
  }
  if (session.extendedSolvedAt) return { ok: true, solved: true };

  const attempts = session.extendedAttempts + 1;
  if (!answersMatch(rawAnswer, campaign.extAnswer)) {
    db.prepare(
      "UPDATE quest_sessions SET extended_attempts = ?, last_seen_at = ? WHERE id = ?",
    ).run(attempts, now, session.id);
    return {
      ok: false,
      status: 422,
      error: "That is not the number the letter is pointing at. Read the three parts again.",
    };
  }

  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE quest_sessions SET extended_attempts = ?, extended_solved_at = ?, last_seen_at = ? WHERE id = ?",
    ).run(attempts, now, now, session.id);
    db.prepare(
      `UPDATE quest_completions SET extended_solved = 1, coupon_eligible = 1
       WHERE session_id = ?`,
    ).run(session.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  // P0.4: solving the extended mystery issues exactly one demo coupon for this
  // completion. Payout status is deliberately irrelevant — coupon issuance and
  // the Devnet reward are separate features.
  try {
    issueCouponForCompletion(session.id);
  } catch (error) {
    console.error("Coupon issuance failed after an extended solve:", error);
  }

  return { ok: true, solved: true };
}

export interface QuestClueView {
  id: string;
  title: string;
  body: string;
  url: string | null;
}

export interface QuestView {
  sessionId: string;
  startedAt: string;
  elapsedSeconds: number;
  stage: QuestStage;
  campaign: {
    slug: string;
    title: string;
    shopName: string;
    shopArea: string;
    shopAddress: string;
    teaser: string;
    story: string;
    rewardAmount: number;
    couponItem: string;
    couponMinSpend: number;
    couponValidDays: number;
    couponNotes: string;
  };
  trail: {
    onlineTotal: number;
    onlineRead: number;
    instoreTotal: number;
    instoreRead: number;
    online: QuestClueView[];
    instore: QuestClueView[];
    nextOnlineTitle: string | null;
    nextInstoreTitle: string | null;
  };
  answer: { question: string; attempts: number; solved: boolean };
  hints: {
    one: { unlockInSeconds: number; text: string | null; requestedAt: string | null };
    two: { unlockInSeconds: number; text: string | null; requestedAt: string | null };
  };
  evidence: {
    id: string;
    status: EvidenceStatus;
    kind: EvidenceKind;
    submittedAt: string;
    reviewNote: string | null;
    reviewedAt: string | null;
    hasLocation: boolean;
  } | null;
  completion: {
    id: string;
    verifiedAt: string;
    rewardAmount: number;
    couponEligible: boolean;
    extendedSolved: boolean;
    verificationMethod: string;
    payoutStatus: string;
    simulated: boolean;
    payout: {
      wallet: string | null;
      mint: string | null;
      amountBaseUnits: number | null;
      signature: string | null;
      error: string | null;
      recipientBefore: number | null;
      recipientAfter: number | null;
      recipientTokenAccount: string | null;
      claimedAt: string | null;
      confirmedAt: string | null;
    };
    chain: {
      status: string | null;
      counterAccount: string | null;
      programId: string | null;
      createSignature: string | null;
      delegateSignature: string | null;
      incrementSignature: string | null;
      commitSignature: string | null;
      counterValue: number | null;
      committedValue: number | null;
      erEndpoint: string | null;
      updatedAt: string | null;
      error: string | null;
    };
  } | null;
  extended: {
    available: boolean;
    step: number;
    totalSteps: number;
    attempts: number;
    solved: boolean;
    question: string;
    clues: Array<{ title: string; body: string }>;
    nextTitle: string | null;
    hint: string | null;
  };
  /** P0.4 demo coupon, issued only when the extended mystery was solved. */
  coupon: CouponView | null;
}

function clueView(clue: Clue): QuestClueView {
  return { id: clue.id, title: clue.title, body: clue.body, url: clue.url };
}

/**
 * Everything a player's browser is allowed to know. The campaign answer, the
 * target object and its location never appear here.
 */
export function getQuestView(playerId: string, campaign: Campaign): QuestView | null {
  const session = getSession(playerId, campaign.id);
  if (!session) return null;

  const online = cluesOf(campaign, "online");
  const instore = cluesOf(campaign, "instore");
  const evidence = getLatestEvidence(session.id);
  const completion = getCompletion(session.id);
  const elapsed = elapsedSeconds(session);
  // Issuance is idempotent, so opening an older solved completion still shows
  // its coupon without a second one being created.
  const coupon =
    completion && completion.extendedSolved ? ensureCouponForSession(session.id) : null;

  let stage: QuestStage;
  if (completion) stage = "complete";
  else if (evidence?.status === "pending") stage = "reviewing";
  else if (!session.solvedAt) {
    if (session.onlineRead < online.length) stage = "online";
    else if (session.instoreRead < instore.length) stage = "instore";
    else stage = "answer";
  } else stage = "evidence";

  const extStep = session.extendedStep;
  const extClues: Array<{ title: string; body: string }> = [];
  if (campaign.extSocialClue) extClues.push({ title: "The post from 2019", body: campaign.extSocialClue });
  if (campaign.extWebClue) extClues.push({ title: "The roastery's about page", body: campaign.extWebClue });
  if (campaign.extInstoreClue)
    extClues.push({ title: "The framed photo on the top shelf", body: campaign.extInstoreClue });
  const extTitles = ["The post from 2019", "The roastery's about page", "The framed photo on the top shelf"];

  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    elapsedSeconds: elapsed,
    stage,
    campaign: {
      slug: campaign.slug,
      title: campaign.title,
      shopName: campaign.shopName,
      shopArea: campaign.shopArea,
      shopAddress: campaign.shopAddress,
      teaser: campaign.teaser,
      story: campaign.story,
      rewardAmount: campaign.rewardAmount,
      couponItem: campaign.couponItem,
      couponMinSpend: campaign.couponMinSpend,
      couponValidDays: campaign.couponValidDays,
      couponNotes: campaign.couponNotes,
    },
    trail: {
      onlineTotal: online.length,
      onlineRead: Math.min(session.onlineRead, online.length),
      instoreTotal: instore.length,
      instoreRead: Math.min(session.instoreRead, instore.length),
      online: online.slice(0, session.onlineRead).map(clueView),
      instore: instore.slice(0, session.instoreRead).map(clueView),
      nextOnlineTitle: online[session.onlineRead]?.title ?? null,
      nextInstoreTitle: instore[session.instoreRead]?.title ?? null,
    },
    answer: {
      question: campaign.answerQuestion,
      attempts: session.answerAttempts,
      solved: Boolean(session.solvedAt),
    },
    hints: {
      one: {
        unlockInSeconds: Math.max(0, HINT_ONE_SECONDS - elapsed),
        text: session.hint1At ? campaign.hint1 || HINT_FALLBACK_1 : null,
        requestedAt: session.hint1At,
      },
      two: {
        unlockInSeconds: Math.max(0, HINT_TWO_SECONDS - elapsed),
        text: session.hint2At ? campaign.hint2 || HINT_FALLBACK_2 : null,
        requestedAt: session.hint2At,
      },
    },
    evidence: evidence
      ? {
          id: evidence.id,
          status: evidence.status,
          kind: evidence.kind,
          submittedAt: evidence.createdAt,
          reviewNote: evidence.reviewNote,
          reviewedAt: evidence.reviewedAt,
          hasLocation: Boolean(evidence.location),
        }
      : null,
    completion: completion
      ? {
          id: completion.id,
          verifiedAt: completion.verifiedAt,
          rewardAmount: completion.rewardAmount,
          couponEligible: completion.couponEligible,
          extendedSolved: completion.extendedSolved,
          verificationMethod: completion.verificationMethod,
          payoutStatus: completion.payoutStatus,
          simulated: completion.verificationMethod === "operator_review_simulation",
          payout: {
            wallet: completion.payoutWallet,
            mint: completion.payoutMint,
            amountBaseUnits: completion.payoutAmountBaseUnits,
            signature: completion.payoutSignature,
            error: completion.payoutError,
            recipientBefore: completion.payoutRecipientBefore,
            recipientAfter: completion.payoutRecipientAfter,
            recipientTokenAccount: completion.payoutRecipientTokenAccount,
            claimedAt: completion.payoutClaimedAt,
            confirmedAt: completion.payoutConfirmedAt,
          },
          chain: {
            status: completion.chainStatus,
            counterAccount: completion.chainCounterAccount,
            programId: completion.chainProgramId,
            createSignature: completion.chainCreateSignature,
            delegateSignature: completion.chainDelegateSignature,
            incrementSignature: completion.chainIncrementSignature,
            commitSignature: completion.chainCommitSignature,
            counterValue: completion.chainCounterValue,
            committedValue: completion.chainCommittedValue,
            erEndpoint: completion.chainErEndpoint,
            updatedAt: completion.chainUpdatedAt,
            error: completion.chainError,
          },
        }
      : null,
    extended: {
      available: Boolean(completion && campaign.extAnswer.trim()),
      step: extStep,
      totalSteps: 3,
      attempts: session.extendedAttempts,
      solved: Boolean(session.extendedSolvedAt),
      question:
        campaign.extQuestion.trim() || "What number does the second question's trail point at?",
      clues: extClues.slice(0, extStep),
      nextTitle: extStep < 3 ? (extTitles[extStep] ?? null) : null,
      hint: session.extendedSolvedAt || extStep >= 3 ? campaign.extHint || EXT_HINT_FALLBACK : null,
    },
    coupon: coupon ? couponView(coupon) : null,
  };
}

export interface PlayerProgress {
  campaignId: string;
  stage: QuestStage;
  percent: number;
  completedAt: string | null;
  verified: boolean;
}

export function listPlayerProgress(playerId: string): Map<string, PlayerProgress> {
  const db = getDb();
  const sessions = db
    .prepare("SELECT * FROM quest_sessions WHERE player_id = ?")
    .all(playerId) as unknown as SessionRow[];
  const counts = db
    .prepare("SELECT campaign_id, kind, COUNT(*) AS count FROM clues GROUP BY campaign_id, kind")
    .all() as unknown as Array<{ campaign_id: string; kind: "online" | "instore"; count: number }>;

  const totals = new Map<string, { online: number; instore: number }>();
  for (const row of counts) {
    const entry = totals.get(row.campaign_id) ?? { online: 0, instore: 0 };
    entry[row.kind] = row.count;
    totals.set(row.campaign_id, entry);
  }

  const result = new Map<string, PlayerProgress>();
  for (const session of sessions) {
    const parsed = toSession(session);
    const total = totals.get(parsed.campaignId) ?? { online: 0, instore: 0 };
    const evidence = getLatestEvidence(parsed.id);
    const completion = getCompletion(parsed.id);
    const steps = 1 + 1 + 1 + 1; // online trail, in-store trail, answer, evidence
    const done =
      (parsed.onlineRead >= total.online ? 1 : 0) +
      (parsed.instoreRead >= total.instore ? 1 : 0) +
      (parsed.solvedAt ? 1 : 0) +
      (evidence ? 1 : 0);
    let stage: QuestStage = "online";
    if (completion) stage = "complete";
    else if (evidence?.status === "pending") stage = "reviewing";
    else if (!parsed.solvedAt) {
      stage = parsed.onlineRead < total.online ? "online" : parsed.instoreRead < total.instore ? "instore" : "answer";
    } else stage = "evidence";

    result.set(parsed.campaignId, {
      campaignId: parsed.campaignId,
      stage,
      percent: Math.round((done / steps) * 100),
      completedAt: completion?.verifiedAt ?? null,
      verified: Boolean(completion),
    });
  }
  return result;
}

export interface PlayerAchievement {
  campaignTitle: string;
  campaignSlug: string;
  code: string;
  name: string;
  detail: string;
  earnedAt: string;
  couponEligible: boolean;
}

export function listPlayerAchievements(playerId: string): PlayerAchievement[] {
  const rows = getDb()
    .prepare(
      `SELECT qc.*, c.title AS campaign_title, c.slug AS campaign_slug,
              s.extended_solved_at AS extended_solved_at
       FROM quest_completions qc
       JOIN campaigns c ON c.id = qc.campaign_id
       JOIN quest_sessions s ON s.id = qc.session_id
       WHERE qc.player_id = ?
       ORDER BY qc.verified_at DESC`,
    )
    .all(playerId) as unknown as Array<
    CompletionRow & {
      campaign_title: string;
      campaign_slug: string;
      extended_solved_at: string | null;
    }
  >;

  const achievements: PlayerAchievement[] = [];
  for (const row of rows) {
    achievements.push({
      campaignTitle: row.campaign_title,
      campaignSlug: row.campaign_slug,
      code: "trail_complete",
      name: `${row.campaign_title} — trail complete`,
      detail: "The counter verified your evidence.",
      earnedAt: row.verified_at,
      couponEligible: row.coupon_eligible === 1,
    });
    if (row.extended_solved === 1) {
      achievements.push({
        campaignTitle: row.campaign_title,
        campaignSlug: row.campaign_slug,
        code: "extended_mystery",
        name: `${row.campaign_title} — the second question`,
        detail: "You solved the optional extended mystery.",
        // The achievement is earned when the answer was accepted, not when the
        // basic completion was verified earlier.
        earnedAt: row.extended_solved_at ?? row.verified_at,
        couponEligible: true,
      });
    }
  }
  return achievements;
}

export interface EvidenceQueueItem {
  evidence: Evidence;
  campaignTitle: string;
  campaignSlug: string;
  shopName: string;
  targetObject: string;
  answerQuestion: string;
  answer: string;
  solvedAt: string | null;
  startedAt: string;
}

function evidenceQueue(query: string, params: unknown[] = []): EvidenceQueueItem[] {
  const rows = getDb()
    .prepare(
      `SELECT e.*, c.title AS campaign_title, c.slug AS campaign_slug, c.shop_name,
              c.target_object, c.answer_question, c.answer,
              s.solved_at, s.started_at
       FROM evidence e
       JOIN campaigns c ON c.id = e.campaign_id
       JOIN quest_sessions s ON s.id = e.session_id
       ${query}`,
    )
    .all(...(params as never[])) as unknown as Array<
    EvidenceRow & {
      campaign_title: string;
      campaign_slug: string;
      shop_name: string;
      target_object: string;
      answer_question: string;
      answer: string;
      solved_at: string | null;
      started_at: string;
    }
  >;

  return rows.map((row) => ({
    evidence: toEvidence(row),
    campaignTitle: row.campaign_title,
    campaignSlug: row.campaign_slug,
    shopName: row.shop_name,
    targetObject: row.target_object,
    answerQuestion: row.answer_question,
    answer: row.answer,
    solvedAt: row.solved_at,
    startedAt: row.started_at,
  }));
}

export function listPendingEvidence(): EvidenceQueueItem[] {
  return evidenceQueue("WHERE e.status = 'pending' ORDER BY e.created_at ASC");
}

export function listReviewedEvidence(limit = 8): EvidenceQueueItem[] {
  return evidenceQueue(
    "WHERE e.status != 'pending' ORDER BY e.reviewed_at DESC LIMIT ?",
    [limit],
  );
}

export function countPendingEvidence(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM evidence WHERE status = 'pending'")
    .get() as { count: number };
  return row.count;
}

export function questStats() {
  const db = getDb();
  const active = db
    .prepare("SELECT COUNT(*) AS count FROM quest_sessions WHERE completed_at IS NULL")
    .get() as { count: number };
  const completed = db
    .prepare("SELECT COUNT(*) AS count FROM quest_completions")
    .get() as { count: number };
  const pending = countPendingEvidence();
  const extended = db
    .prepare("SELECT COUNT(*) AS count FROM quest_completions WHERE extended_solved = 1")
    .get() as { count: number };
  return {
    active: active.count,
    completed: completed.count,
    pendingEvidence: pending,
    extendedSolved: extended.count,
  };
}

export function campaignForSession(session: QuestSession): Campaign | null {
  return getCampaignById(session.campaignId);
}

export function getCompletionById(id: string): Completion | null {
  const row = getDb().prepare("SELECT * FROM quest_completions WHERE id = ?").get(id) as unknown as
    | CompletionRow
    | undefined;
  return row ? toCompletion(row) : null;
}

export function setCampaignCounterAccount(campaignId: string, account: string): void {
  getDb()
    .prepare("UPDATE campaigns SET chain_counter_account = ? WHERE id = ?")
    .run(account, campaignId);
}

export interface ChainEvidenceInput {
  status: "incrementing" | "committed" | "failed";
  counterAccount: string;
  programId: string;
  createSignature: string | null;
  delegateSignature: string | null;
  incrementSignature: string | null;
  commitSignature: string | null;
  counterValue: number | null;
  committedValue: number | null;
  erEndpoint: string;
  error: string | null;
}

export function saveChainEvidence(completionId: string, evidence: ChainEvidenceInput): void {
  getDb()
    .prepare(
      `UPDATE quest_completions
       SET chain_status = ?, chain_counter_account = ?, chain_program_id = ?,
           chain_create_signature = ?, chain_delegate_signature = ?,
           chain_increment_signature = ?, chain_commit_signature = ?,
           chain_counter_value = ?, chain_committed_value = ?,
           chain_er_endpoint = ?, chain_updated_at = ?, chain_error = ?
       WHERE id = ?`,
    )
    .run(
      evidence.status,
      evidence.counterAccount,
      evidence.programId,
      evidence.createSignature,
      evidence.delegateSignature,
      evidence.incrementSignature,
      evidence.commitSignature,
      evidence.counterValue,
      evidence.committedValue,
      evidence.erEndpoint,
      new Date().toISOString(),
      evidence.error,
      completionId,
    );
}

export function beginPayout(
  completionId: string,
  wallet: string,
  mint: string,
  amountBaseUnits: number,
): void {
  getDb()
    .prepare(
      `UPDATE quest_completions
       SET payout_status = 'processing', payout_wallet = ?, payout_mint = ?,
           payout_amount_base_units = ?, payout_error = NULL, payout_claimed_at = ?
       WHERE id = ?`,
    )
    .run(wallet, mint, amountBaseUnits, new Date().toISOString(), completionId);
}

export interface PayoutReceiptInput {
  signature: string;
  mint: string;
  amountBaseUnits: number;
  recipient: string;
  recipientTokenAccount: string;
  recipientBeforeBaseUnits: number;
  recipientAfterBaseUnits: number;
}

export function completePayout(completionId: string, receipt: PayoutReceiptInput): void {
  getDb()
    .prepare(
      `UPDATE quest_completions
       SET payout_status = 'paid', payout_signature = ?, payout_mint = ?,
           payout_amount_base_units = ?, payout_wallet = ?,
           payout_recipient_token_account = ?, payout_recipient_before = ?,
           payout_recipient_after = ?, payout_confirmed_at = ?, payout_error = NULL
       WHERE id = ?`,
    )
    .run(
      receipt.signature,
      receipt.mint,
      receipt.amountBaseUnits,
      receipt.recipient,
      receipt.recipientTokenAccount,
      receipt.recipientBeforeBaseUnits,
      receipt.recipientAfterBaseUnits,
      new Date().toISOString(),
      completionId,
    );
}

export function failPayout(completionId: string, message: string, wallet?: string): void {
  const text =
    message.trim() ||
    "The Devnet transfer failed without an error message. Check the treasury balance and RPC endpoint, then retry.";
  getDb()
    .prepare(
      `UPDATE quest_completions
       SET payout_status = 'failed', payout_error = ?, payout_wallet = COALESCE(?, payout_wallet)
       WHERE id = ?`,
    )
    .run(text.slice(0, 500), wallet ?? null, completionId);
}
