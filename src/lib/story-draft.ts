import type { StoryConcept, StoryLabInput } from "./story-lab";

/**
 * A Story Lab concept mapped onto the existing campaign form. Fields the
 * concept cannot honestly supply are explicitly marked INCOMPLETE so the
 * merchant must review them before saving or submitting. Nothing here is
 * published, and no address, answer or historical fact is invented.
 */
export interface StoryCampaignDraft {
  title: string;
  shopName: string;
  shopArea: string;
  shopAddress: string;
  teaser: string;
  story: string;
  targetObject: string;
  targetObjectHint: string;
  answerQuestion: string;
  answer: string;
  hint1: string;
  hint2: string;
  extSocialClue: string;
  extWebClue: string;
  extInstoreClue: string;
  extQuestion: string;
  extAnswer: string;
  extHint: string;
  optionalMode: "product_clue";
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
  rewardAmount: string;
  couponItem: string;
  couponMinSpend: string;
  couponValidDays: string;
  couponNotes: string;
  onlineClues: Array<{ title: string; body: string; url: string }>;
  instoreClues: Array<{ title: string; body: string; url: string }>;
}

const INCOMPLETE = "INCOMPLETE —";

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function conceptToCampaignDraft(
  concept: StoryConcept,
  input: StoryLabInput,
  merchantName: string,
): StoryCampaignDraft {
  const product = input.product.trim() || "the signature product";
  const title = clip(concept.title, 80) || "Untitled story draft";
  const shopName = clip(input.businessName.trim() || merchantName, 80);
  const online = concept.onlineClues.map((body, index) => ({
    title: `Draft online clue ${index + 1}`,
    body: clip(body, 400),
    url: "",
  }));
  while (online.length < 1) {
    online.push({
      title: "Draft online clue 1",
      body: clip(concept.premise, 400),
      url: "",
    });
  }

  return {
    title,
    shopName,
    shopArea: clip(input.location, 80),
    // A generated concept cannot know a safe, merchant-approved address.
    shopAddress: "",
    teaser: clip(concept.premise, 160),
    story: `${concept.premise}\n\nStory Lab draft. The premise and backstory are fiction unless the merchant supplied and verified them. Review every field before saving.`,
    targetObject: `${INCOMPLETE} confirm the exact object from the in-store observation.`,
    targetObjectHint: `${INCOMPLETE} confirm the public spot and keep the object reachable without moving anything.`,
    answerQuestion: `${INCOMPLETE} turn this into one short counter question. Story Lab suggestion: ${clip(concept.basicPuzzle, 90)}`,
    answer: "",
    hint1: `${INCOMPLETE} write a nudge that does not reveal the answer.`,
    hint2: `${INCOMPLETE} write the stronger five-minute nudge.`,
    extSocialClue: clip(concept.onlineClues[0] ?? concept.premise, 400),
    extWebClue: clip(concept.onlineClues[1] ?? concept.onlineClues[0] ?? concept.premise, 400),
    extInstoreClue: clip(concept.instoreObservation, 400),
    extQuestion: `${INCOMPLETE} decide what the three optional clues prove.`,
    extAnswer: "",
    extHint: `${INCOMPLETE} add a useful nudge that still withholds the deduction.`,
    optionalMode: "product_clue",
    productName: clip(product, 90),
    productPriceLabel: `${INCOMPLETE} enter a clearly simulated demo price`,
    productProp: clip(input.props || "", 120),
    productClue: clip(concept.productClue, 600),
    finalQuestion: `${INCOMPLETE} decide the final question after the product clue.`,
    finalAnswer: "",
    finalHint: `${INCOMPLETE} add a non-revealing nudge for a wrong final answer.`,
    endingTitle: clip(`${title} — hidden ending`, 90),
    endingBody: clip(concept.hiddenEnding, 900),
    achievementTitle: clip(`Keeper of ${title}`, 90),
    achievementBody: "You followed the product clue to the hidden ending. Replace this draft text if you prefer.",
    rewardAmount: "100",
    couponItem: "Demo entitlement (product-clue mode does not issue a coupon)",
    couponMinSpend: "0",
    couponValidDays: "14",
    couponNotes: "Product-clue campaigns do not issue coupons.",
    onlineClues: online,
    instoreClues: [
      {
        title: "Draft in-store observation",
        body: clip(concept.instoreObservation, 400),
        url: "",
      },
    ],
  };
}
