export interface CampaignClueInput {
  title: string;
  body: string;
  url?: string;
}

import type { OptionalMode } from "./types";

export interface CampaignInput {
  title: string;
  shopName: string;
  shopArea: string;
  shopAddress: string;
  teaser: string;
  story: string;
  targetObject: string;
  targetObjectHint: string;
  rewardAmount: number;
  couponItem: string;
  couponMinSpend: number;
  couponValidDays: number;
  couponNotes: string;
  /** Player-visible puzzle prompt, e.g. "How many pours does the recipe call for?". */
  answerQuestion: string;
  /** Never sent to players; compared server-side. */
  answer: string;
  hint1: string;
  hint2: string;
  extSocialClue: string;
  extWebClue: string;
  extInstoreClue: string;
  extAnswer: string;
  extHint: string;
  extQuestion: string;
  optionalMode: OptionalMode;
  productName: string;
  productPriceLabel: string;
  productProp: string;
  productClue: string;
  finalQuestion: string;
  finalAnswer: string;
  finalHint: string;
  endingTitle: string;
  endingBody: string;
  achievementTitle: string;
  achievementBody: string;
  onlineClues: CampaignClueInput[];
  instoreClues: CampaignClueInput[];
}

export type FieldErrors = Record<string, string>;

export type ValidationResult =
  | { ok: true; value: CampaignInput }
  | { ok: false; errors: FieldErrors };

const LIMITS = {
  title: [4, 70],
  shopName: [2, 70],
  shopArea: [2, 70],
  shopAddress: [5, 160],
  teaser: [12, 160],
  story: [60, 1400],
  targetObject: [4, 140],
  targetObjectHint: [8, 320],
  couponItem: [3, 90],
  couponNotes: [0, 320],
  answerQuestion: [8, 200],
  answer: [1, 60],
  hint: [8, 260],
  extClue: [8, 400],
  extAnswer: [1, 60],
  extQuestion: [8, 200],
  productName: [3, 90],
  productPriceLabel: [0, 40],
  productProp: [3, 120],
  productClue: [20, 600],
  finalQuestion: [8, 220],
  finalAnswer: [1, 60],
  endingTitle: [3, 90],
  endingBody: [40, 900],
  achievementTitle: [3, 90],
  achievementBody: [8, 320],
  clueTitle: [3, 90],
  clueBody: [8, 400],
  maxCluesPerKind: 5,
} as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lengthError(
  value: string,
  [min, max]: readonly [number, number] | number[],
  label: string,
): string | null {
  if (!value) return `${label} is required.`;
  if (value.length < min) return `${label} needs at least ${min} characters.`;
  if (value.length > max) return `${label} must be under ${max} characters.`;
  return null;
}

function optionalLengthError(
  value: string,
  [min, max]: readonly [number, number] | number[],
  label: string,
): string | null {
  if (!value) return null;
  if (value.length < min) return `${label} needs at least ${min} characters.`;
  if (value.length > max) return `${label} must be under ${max} characters.`;
  return null;
}

/**
 * Clue links may point at an external source or at one of the app's own demo
 * pages ("/demo/..."), so a rooted same-site path is allowed as well as http(s).
 */
function isUsableClueUrl(value: string): boolean {
  if (value.startsWith("/")) return /^\/[^\s<>"]*$/.test(value);
  return /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(value);
}

function parseClues(
  raw: unknown,
  kind: "onlineClues" | "instoreClues",
  errors: FieldErrors,
): CampaignClueInput[] {
  const label = kind === "onlineClues" ? "Online clue" : "In-store clue";
  if (!Array.isArray(raw)) {
    errors[kind] = "Add at least one clue.";
    return [];
  }
  if (raw.length === 0) {
    errors[kind] = "Add at least one clue.";
    return [];
  }
  if (raw.length > LIMITS.maxCluesPerKind) {
    errors[kind] = `Keep it to ${LIMITS.maxCluesPerKind} clues per trail.`;
  }

  const clues: CampaignClueInput[] = [];
  raw.slice(0, LIMITS.maxCluesPerKind).forEach((entry: unknown, index: number) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const title = text(item.title);
    const body = text(item.body);
    const url = text(item.url);

    const titleIssue = lengthError(title, LIMITS.clueTitle, `${label} ${index + 1} title`);
    if (titleIssue) errors[`${kind}.${index}.title`] = titleIssue;
    const bodyIssue = lengthError(body, LIMITS.clueBody, `${label} ${index + 1} text`);
    if (bodyIssue) errors[`${kind}.${index}.body`] = bodyIssue;

    if (url && !isUsableClueUrl(url)) {
      errors[`${kind}.${index}.url`] =
        "Use a full URL starting with http:// or https://, or an in-app path starting with /.";
    }

    clues.push({ title, body, url: url || undefined });
  });
  return clues;
}

function intInRange(
  raw: unknown,
  field: string,
  min: number,
  max: number,
  label: string,
  errors: FieldErrors,
): number {
  const value = typeof raw === "number" ? raw : Number(text(raw));
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    errors[field] = `${label} must be a whole number.`;
    return min;
  }
  if (value < min || value > max) {
    errors[field] = `${label} must be between ${min} and ${max}.`;
    return min;
  }
  return value;
}

export function validateCampaignInput(raw: unknown): ValidationResult {
  const input = (raw ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const value: CampaignInput = {
    title: text(input.title),
    shopName: text(input.shopName),
    shopArea: text(input.shopArea),
    shopAddress: text(input.shopAddress),
    teaser: text(input.teaser),
    story: text(input.story),
    targetObject: text(input.targetObject),
    targetObjectHint: text(input.targetObjectHint),
    rewardAmount: 100,
    couponItem: text(input.couponItem),
    couponMinSpend: 0,
    couponValidDays: 14,
    couponNotes: text(input.couponNotes),
    answerQuestion: text(input.answerQuestion),
    answer: text(input.answer),
    hint1: text(input.hint1),
    hint2: text(input.hint2),
    extSocialClue: text(input.extSocialClue),
    extWebClue: text(input.extWebClue),
    extInstoreClue: text(input.extInstoreClue),
    extAnswer: text(input.extAnswer),
    extHint: text(input.extHint),
    extQuestion: text(input.extQuestion),
    optionalMode: input.optionalMode === "product_clue" ? "product_clue" : "coupon",
    productName: text(input.productName),
    productPriceLabel: text(input.productPriceLabel),
    productProp: text(input.productProp),
    productClue: text(input.productClue),
    finalQuestion: text(input.finalQuestion),
    finalAnswer: text(input.finalAnswer),
    finalHint: text(input.finalHint),
    endingTitle: text(input.endingTitle),
    endingBody: text(input.endingBody),
    achievementTitle: text(input.achievementTitle),
    achievementBody: text(input.achievementBody),
    onlineClues: [],
    instoreClues: [],
  };

  const checks: Array<[string, string, readonly [number, number] | number[], string]> = [
    ["title", value.title, LIMITS.title, "Campaign title"],
    ["shopName", value.shopName, LIMITS.shopName, "Shop name"],
    ["shopArea", value.shopArea, LIMITS.shopArea, "Neighbourhood"],
    ["shopAddress", value.shopAddress, LIMITS.shopAddress, "Address"],
    ["teaser", value.teaser, LIMITS.teaser, "One-line hook"],
    ["story", value.story, LIMITS.story, "Story briefing"],
    ["targetObject", value.targetObject, LIMITS.targetObject, "Target object"],
    ["targetObjectHint", value.targetObjectHint, LIMITS.targetObjectHint, "Where to look hint"],
    ["couponItem", value.couponItem, LIMITS.couponItem, "Coupon item"],
  ];

  for (const [field, fieldValue, limits, label] of checks) {
    const issue = lengthError(fieldValue, limits, label);
    if (issue) errors[field] = issue;
  }

  if (value.couponNotes.length > LIMITS.couponNotes[1]) {
    errors.couponNotes = `Coupon conditions must be under ${LIMITS.couponNotes[1]} characters.`;
  }

  value.rewardAmount = intInRange(input.rewardAmount, "rewardAmount", 1, 1000, "Reward amount", errors);
  value.couponMinSpend = intInRange(
    input.couponMinSpend,
    "couponMinSpend",
    0,
    500000,
    "Minimum spend",
    errors,
  );
  value.couponValidDays = intInRange(
    input.couponValidDays,
    "couponValidDays",
    1,
    90,
    "Coupon validity",
    errors,
  );

  // The counter answer is required before a campaign can be submitted (checked
  // again by the store), but optional while the draft is still being written.
  const answerQuestionIssue = optionalLengthError(
    value.answerQuestion,
    LIMITS.answerQuestion,
    "Counter question",
  );
  if (answerQuestionIssue) errors.answerQuestion = answerQuestionIssue;
  if (value.answer.length > LIMITS.answer[1]) {
    errors.answer = `Answer must be under ${LIMITS.answer[1]} characters.`;
  }
  if (value.answer && !value.answerQuestion) {
    errors.answerQuestion = "Add the question the counter asks before adding its answer.";
  }
  const hintOneIssue = optionalLengthError(value.hint1, LIMITS.hint, "Hint at 3 minutes");
  if (hintOneIssue) errors.hint1 = hintOneIssue;
  const hintTwoIssue = optionalLengthError(value.hint2, LIMITS.hint, "Hint at 5 minutes");
  if (hintTwoIssue) errors.hint2 = hintTwoIssue;

  const ext = [value.extSocialClue, value.extWebClue, value.extInstoreClue, value.extAnswer];
  if (ext.some(Boolean)) {
    for (const [field, fieldValue, label] of [
      ["extSocialClue", value.extSocialClue, "Extended social clue"],
      ["extWebClue", value.extWebClue, "Extended website clue"],
      ["extInstoreClue", value.extInstoreClue, "Extended in-store clue"],
    ] as const) {
      const issue = lengthError(fieldValue, LIMITS.extClue, label);
      if (issue) errors[field] = issue;
    }
    const extAnswerIssue = lengthError(value.extAnswer, LIMITS.extAnswer, "Extended answer");
    if (extAnswerIssue) errors.extAnswer = extAnswerIssue;
  }
  const extHintIssue = optionalLengthError(value.extHint, LIMITS.hint, "Extended hint");
  if (extHintIssue) errors.extHint = extHintIssue;
  const extQuestionIssue = optionalLengthError(
    value.extQuestion,
    LIMITS.extQuestion,
    "Extended question",
  );
  if (extQuestionIssue) errors.extQuestion = extQuestionIssue;
  if (value.extAnswer && !value.extQuestion) {
    errors.extQuestion = "Add the extended question players answer before adding its answer.";
  }

  // P1 product-clue mystery. All fields stay optional while the merchant is
  // still writing a legacy coupon draft; choosing the product mode makes the
  // product clue, final question and final answer part of a submittable trail.
  if (value.optionalMode === "product_clue") {
    for (const [field, fieldValue, limits, label] of [
      ["productName", value.productName, LIMITS.productName, "Signature product"],
      ["productProp", value.productProp, LIMITS.productProp, "Physical prop"],
      ["productClue", value.productClue, LIMITS.productClue, "Product clue"],
      ["finalQuestion", value.finalQuestion, LIMITS.finalQuestion, "Final question"],
      ["endingTitle", value.endingTitle, LIMITS.endingTitle, "Ending title"],
      ["endingBody", value.endingBody, LIMITS.endingBody, "Ending narrative"],
      ["achievementTitle", value.achievementTitle, LIMITS.achievementTitle, "Achievement title"],
    ] as const) {
      const issue = lengthError(fieldValue, limits, label);
      if (issue) errors[field] = issue;
    }
    if (!value.finalAnswer) errors.finalAnswer = "Add the hidden ending's answer.";
    else if (value.finalAnswer.length > LIMITS.finalAnswer[1]) {
      errors.finalAnswer = `Answer must be under ${LIMITS.finalAnswer[1]} characters.`;
    }
    if (!value.extAnswer) {
      errors.extAnswer = "Add the pre-order deduction answer for the product mystery.";
    }
    const achievementBodyIssue = optionalLengthError(
      value.achievementBody,
      LIMITS.achievementBody,
      "Achievement detail",
    );
    if (achievementBodyIssue) errors.achievementBody = achievementBodyIssue;
    const finalHintIssue = optionalLengthError(value.finalHint, LIMITS.hint, "Final hint");
    if (finalHintIssue) errors.finalHint = finalHintIssue;
  }

  value.onlineClues = parseClues(input.onlineClues, "onlineClues", errors);
  value.instoreClues = parseClues(input.instoreClues, "instoreClues", errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export function validateReviewInput(raw: unknown):
  | { ok: true; decision: "approve" | "reject"; note: string }
  | { ok: false; error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;
  const decision = input.decision === "approve" ? "approve" : input.decision === "reject" ? "reject" : null;
  if (!decision) return { ok: false, error: "Decision must be approve or reject." };
  const note = text(input.note);
  if (decision === "reject" && note.length < 6) {
    return { ok: false, error: "Add a short note so the merchant knows what to fix." };
  }
  if (note.length > 500) return { ok: false, error: "Review notes must be under 500 characters." };
  return { ok: true, decision, note };
}

export function validateEvidenceReviewInput(raw: unknown):
  | { ok: true; decision: "approve" | "reject"; note: string }
  | { ok: false; error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;
  const decision = input.decision === "approve" ? "approve" : input.decision === "reject" ? "reject" : null;
  if (!decision) return { ok: false, error: "Decision must be approve or reject." };
  const note = text(input.note);
  if (decision === "reject" && note.length < 6) {
    return { ok: false, error: "Tell the player what was missing or unreadable." };
  }
  if (note.length > 500) return { ok: false, error: "Review notes must be under 500 characters." };
  return { ok: true, decision, note };
}

export { LIMITS };
