export interface CampaignClueInput {
  title: string;
  body: string;
  url?: string;
}

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

    if (url && !/^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(url)) {
      errors[`${kind}.${index}.url`] = "Use a full URL starting with http:// or https://.";
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
    ["couponNotes", value.couponNotes, LIMITS.couponNotes, "Coupon conditions"],
  ];

  for (const [field, fieldValue, limits, label] of checks) {
    if (field === "couponNotes") {
      // Optional, but still capped.
      if (fieldValue.length > LIMITS.couponNotes[1]) {
        errors[field] = `${label} must be under ${LIMITS.couponNotes[1]} characters.`;
      }
      continue;
    }
    const issue = lengthError(fieldValue, limits, label);
    if (issue) errors[field] = issue;
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

  if (Object.keys(errors).length > 0) {
    // Still parse clues so the UI can show every problem at once.
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

export { LIMITS };
