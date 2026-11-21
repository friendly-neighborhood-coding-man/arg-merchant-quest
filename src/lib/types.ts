export type CampaignStatus = "draft" | "pending" | "published" | "rejected";
export type ClueKind = "online" | "instore";

/**
 * P1 optional mystery mode. `coupon` is the accepted P0.4 behaviour and stays
 * the default for every existing campaign. `product_clue` replaces the coupon
 * with a product-contained clue, a staff handoff and a hidden ending.
 */
export type OptionalMode = "coupon" | "product_clue";

export interface Clue {
  id: string;
  campaignId: string;
  kind: ClueKind;
  position: number;
  title: string;
  body: string;
  url: string | null;
}

export interface Campaign {
  id: string;
  merchantId: string;
  merchantName: string;
  slug: string;
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
  /**
   * P0.2 private campaign fields. None of these are sent to a player's browser:
   * the answer is checked on the server and the verification details belong to
   * the merchant and the operator. Player-visible clues live in `clues`.
   */
  answerQuestion: string;
  answer: string;
  hint1: string;
  hint2: string;
  extSocialClue: string;
  extWebClue: string;
  extInstoreClue: string;
  extAnswer: string;
  extHint: string;
  /** The extended mystery's question. Optional: seeded campaigns fall back to
   * a generic prompt when it is empty. */
  extQuestion: string;
  /** P1 optional mystery. See OptionalMode. */
  optionalMode: OptionalMode;
  /** P1 product-clue fields. The clue itself is private until staff handoff. */
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
  /** Completion-counter account on Solana, once this campaign has one. */
  chainCounterAccount: string | null;
  status: CampaignStatus;
  operatorNote: string | null;
  /** The most recent rejection reason. Survives a resubmission so the operator
   * can still see what the merchant was asked to correct. */
  lastRejectionNote: string | null;
  lastRejectionAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clues: Clue[];
}

export interface Merchant {
  id: string;
  name: string;
  contactEmail: string;
  instagram: string | null;
  website: string | null;
}

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  pending: "In review",
  published: "Live",
  rejected: "Needs changes",
};

export const REWARD_UNIT_COPY = "Devnet test credits";

export type QuestStage =
  | "online"
  | "instore"
  | "answer"
  | "evidence"
  | "reviewing"
  | "complete";

export type EvidenceKind = "camera" | "upload" | "simulation";
export type EvidenceStatus = "pending" | "approved" | "rejected";

/** P0.3 — real devnet payout state for a verified completion. */
export type PayoutStatus = "pending" | "processing" | "paid" | "failed";

/** P0.3 — MagicBlock counter lifecycle for a verified completion. */
export type ChainStatus = "none" | "incrementing" | "committed" | "failed";
