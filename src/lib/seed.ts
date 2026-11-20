import type { DatabaseSync } from "node:sqlite";

/**
 * Demo seed data. Everything here is fictional: the shops, the people, the
 * links and the coupons. It exists so a reviewer can walk the journey without
 * enrolling a real merchant.
 */

interface SeedClue {
  kind: "online" | "instore";
  title: string;
  body: string;
  url?: string;
}

interface SeedCampaign {
  merchantHandle: string;
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
  status: "draft" | "pending" | "published" | "rejected";
  createdDaysAgo: number;
  submittedDaysAgo?: number;
  reviewedDaysAgo?: number;
  reviewer?: string;
  operatorNote?: string;
  clues: SeedClue[];
}

const MERCHANTS = [
  {
    handle: "umbra-coffee",
    name: "Umbra Coffee Roasters",
    contactEmail: "hello@umbra-roasters.example",
    instagram: "@umbra.roasters",
    website: "https://example.com/umbra-roasters",
  },
  {
    handle: "mangwon-records",
    name: "Mangwon Records",
    contactEmail: "counter@mangwon-records.example",
    instagram: "@mangwon.records",
    website: "https://example.com/mangwon-records",
  },
];

const CAMPAIGNS: SeedCampaign[] = [
  {
    merchantHandle: "mangwon-records",
    slug: "b-side-07",
    title: "B-Side 07",
    shopName: "Mangwon Records",
    shopArea: "Mangwon-dong, Seoul",
    shopAddress: "17 Mangwon-ro 8-gil, Mapo-gu, Seoul (fictional address)",
    teaser: "A record that was never pressed is still playing in the back room.",
    story:
      "In 1998 a pressing plant in Mapo burned a single test pressing and sent the sleeve home with the engineer. No artist name, no catalogue number, one word in pencil on the back: B-SIDE 07.\n\nThe sleeve turned up in a donation box last winter. The owner plays it at closing time, always the same track, always with seven seconds missing. Find the sleeve, find the gap, and the counter will know what you are asking for.",
    targetObject: "The unnumbered 7-inch sleeve behind the second listening booth",
    targetObjectHint:
      "Second booth, on the wall of price tags. It is the only sleeve on the wall without a catalogue number.",
    rewardAmount: 100,
    couponItem: "Secret-menu 'Static Tea' (demo)",
    couponMinSpend: 20000,
    couponValidDays: 10,
    couponNotes:
      "Demo only — not redeemable in a real business. One per visitor, dine-in only, must be mentioned at the counter.",
    status: "published",
    createdDaysAgo: 21,
    submittedDaysAgo: 12,
    reviewedDaysAgo: 11,
    reviewer: "operator.demo",
    clues: [
      {
        kind: "online",
        title: "The donation log",
        body: "The shop's donation log lists one box as '7in, no label, water damage'. The donor's initials are M.R. — the same initials as the shop itself.",
        url: "https://example.com/mangwon-records/donation-log",
      },
      {
        kind: "online",
        title: "Closing-time playlist",
        body: "Every night at 22:00 the shop posts the track it closed with. Scroll to the seventh post back: the same seven seconds are missing there too.",
        url: "https://example.com/mangwon-records/closing-playlist/07",
      },
      {
        kind: "instore",
        title: "Two booths, one blank tag",
        body: "There are two listening booths in the back. The second one has a wall of handwritten price tags. One of them is blank.",
      },
      {
        kind: "instore",
        title: "The gap",
        body: "On the back cover, in pencil: B-SIDE 07. Photograph the sleeve with the blank price tag visible in the same frame.",
      },
    ],
  },
  {
    merchantHandle: "mangwon-records",
    slug: "the-blue-hour",
    title: "The Blue Hour",
    shopName: "Mangwon Records",
    shopArea: "Mangwon-dong, Seoul",
    shopAddress: "17 Mangwon-ro 8-gil, Mapo-gu, Seoul (fictional address)",
    teaser: "The shop closes at 22:00. For one hour, the lights stay on for nobody.",
    story:
      "The shutters come down at 22:00, but the owner leaves the listening room lit until 23:00. Regulars call it the blue hour. A blue index card sits in the staff-picks shelf with a request written on it that nobody has ever fulfilled.\n\nRead the request, bring it to the counter, and name the record it describes. The counter staff will know what to do.",
    targetObject: "The blue index card in the staff-picks shelf",
    targetObjectHint:
      "Staff-picks shelf: third row from the top, tucked inside the sleeve of the only jazz record with a torn corner.",
    rewardAmount: 100,
    couponItem: "Late-hour listening seat (demo)",
    couponMinSpend: 25000,
    couponValidDays: 7,
    couponNotes:
      "Demo only — not redeemable in a real business. One seat, one hour, subject to the demo shop's availability.",
    status: "pending",
    createdDaysAgo: 4,
    submittedDaysAgo: 2,
    clues: [
      {
        kind: "online",
        title: "The 22:00 shutter photo",
        body: "Every closing photo on the shop's feed shows the same thing through the glass: one lamp still on in the listening room, facing the staff-picks shelf.",
        url: "https://example.com/mangwon-records/closing-photos",
      },
      {
        kind: "online",
        title: "The torn corner",
        body: "A post from February mentions a jazz record donated with a torn corner and 'a note inside that isn't mine'.",
        url: "https://example.com/mangwon-records/notes/torn-corner",
      },
      {
        kind: "instore",
        title: "Find the card",
        body: "In the staff-picks shelf, inside the sleeve with the torn corner, there is a blue index card with a handwritten request.",
      },
      {
        kind: "instore",
        title: "Bring it back",
        body: "Photograph the card in front of the lit listening-room lamp, then tell the counter which record the request describes.",
      },
    ],
  },
  {
    merchantHandle: "umbra-coffee",
    slug: "the-ninth-cup",
    title: "The Ninth Cup",
    shopName: "Umbra Coffee Roasters",
    shopArea: "Seongsu-dong, Seoul",
    shopAddress: "24 Yeonmujang-gil, Seongdong-gu, Seoul (fictional address)",
    teaser: "Eight cups are for customers. The ninth has been waiting for you.",
    story:
      "For years the roaster set out nine cups every morning. Eight went to customers. The ninth stayed on the top shelf, and nobody was allowed to pour it.\n\nLast spring a letter arrived addressed to the ninth cup. It was read once, then put away. The recipe it described is still in the room, written in pencil on the back of a shipping label. Follow the old posts, count the shelves, and find the cup that was never poured.",
    targetObject: "The ninth cup — a chipped celadon cup on the top shelf behind the espresso machine",
    targetObjectHint:
      "Behind the espresso machine, above the grinder. Look for a hairline crack that runs like a river.",
    rewardAmount: 100,
    couponItem: "The Ninth Cup pour-over flight (demo secret menu)",
    couponMinSpend: 15000,
    couponValidDays: 14,
    couponNotes:
      "Demo only — not redeemable in a real business. One per visitor, dine-in, mention the ARG at the counter.",
    status: "draft",
    createdDaysAgo: 1,
    clues: [
      {
        kind: "online",
        title: "The roaster's April post",
        body: "The pinned post from April mentions a recipe written in pencil on the back of a shipping label — 'the one that ended in 09'.",
        url: "https://example.com/umbra-roasters/april-post",
      },
      {
        kind: "online",
        title: "Count the shelves",
        body: "In the photo behind the counter you can count the shelves above the grinder. Remember that number before you arrive.",
        url: "https://example.com/umbra-roasters/shelf-photo",
      },
      {
        kind: "instore",
        title: "Ask for the shelf count",
        body: "Behind the counter there are four shelves. The ninth cup sits on the top one, tucked behind the grinder where the light does not reach it.",
      },
      {
        kind: "instore",
        title: "The river crack",
        body: "The cup has a hairline crack that runs like a river. Photograph the cup with the shelf label visible so the counter can confirm the spot.",
      },
    ],
  },
];

function daysAgo(days: number, extraMinutes = 0): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - extraMinutes * 60 * 1000).toISOString();
}

export function seedDatabase(db: DatabaseSync) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM campaigns").get() as { count: number };
  if (existing.count > 0) return;

  const insertMerchant = db.prepare(
    `INSERT INTO merchants (id, handle, name, contact_email, instagram, website, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertCampaign = db.prepare(
    `INSERT INTO campaigns (
       id, merchant_id, slug, title, shop_name, shop_area, shop_address, teaser, story,
       target_object, target_object_hint, reward_amount, coupon_item, coupon_min_spend,
       coupon_valid_days, coupon_notes, status, operator_note, submitted_at, reviewed_at,
       reviewed_by, published_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertClue = db.prepare(
    `INSERT INTO clues (id, campaign_id, kind, position, title, body, url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec("BEGIN");
  try {
    const merchantIds = new Map<string, string>();
    MERCHANTS.forEach((merchant, index) => {
      const id = `mrc_${merchant.handle.replace(/-/g, "_")}`;
      merchantIds.set(merchant.handle, id);
      insertMerchant.run(
        id,
        merchant.handle,
        merchant.name,
        merchant.contactEmail,
        merchant.instagram,
        merchant.website,
        daysAgo(45 - index),
      );
    });

    for (const campaign of CAMPAIGNS) {
      const merchantId = merchantIds.get(campaign.merchantHandle);
      if (!merchantId) continue;
      const id = `cmp_${campaign.slug.replace(/-/g, "_")}`;
      const created = daysAgo(campaign.createdDaysAgo);
      const submitted = campaign.submittedDaysAgo ? daysAgo(campaign.submittedDaysAgo) : null;
      const reviewed = campaign.reviewedDaysAgo ? daysAgo(campaign.reviewedDaysAgo) : null;
      const updated = submitted ?? created;

      insertCampaign.run(
        id,
        merchantId,
        campaign.slug,
        campaign.title,
        campaign.shopName,
        campaign.shopArea,
        campaign.shopAddress,
        campaign.teaser,
        campaign.story,
        campaign.targetObject,
        campaign.targetObjectHint,
        campaign.rewardAmount,
        campaign.couponItem,
        campaign.couponMinSpend,
        campaign.couponValidDays,
        campaign.couponNotes,
        campaign.status,
        campaign.operatorNote ?? null,
        submitted,
        reviewed,
        campaign.status === "draft" ? null : (campaign.reviewer ?? "operator.demo"),
        campaign.status === "published" ? reviewed : null,
        created,
        updated,
      );

      let onlinePosition = 0;
      let instorePosition = 0;
      for (const clue of campaign.clues) {
        const position = clue.kind === "online" ? onlinePosition++ : instorePosition++;
        insertClue.run(
          `clu_${id.slice(4)}_${clue.kind}_${position}`,
          id,
          clue.kind,
          position,
          clue.title,
          clue.body,
          clue.url ?? null,
        );
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
