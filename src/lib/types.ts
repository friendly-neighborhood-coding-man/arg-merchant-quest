export type CampaignStatus = "draft" | "pending" | "published" | "rejected";
export type ClueKind = "online" | "instore";

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
  status: CampaignStatus;
  operatorNote: string | null;
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
