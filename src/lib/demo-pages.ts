/**
 * Fictional hosted content for the demo trails. Real social accounts and
 * merchant websites do not exist for these fictional shops, so the clue URLs
 * point at these in-app pages instead. Every page says so on its face.
 */
export interface DemoPage {
  merchant: string;
  kind: "social post" | "social comment" | "photo post" | "website page" | "shop log";
  handle: string;
  title: string;
  posted: string;
  body: string[];
  footer?: string;
}

export const DEMO_PAGES: Record<string, DemoPage> = {
  "umbra-roasters/april-post": {
    merchant: "Umbra Coffee Roasters",
    kind: "social post",
    handle: "@umbra.roasters",
    title: "Nine cups, again",
    posted: "April · pinned",
    body: [
      "Nine cups out again this morning. Eight are for you. The ninth waits where the light does not reach.",
      "The last label we ever stamped ended in 09, and the recipe is still pencilled on the back of it — behind the counter, above the grinder.",
      "Regulars ask why we never pour it. Ask the shelves instead.",
    ],
    footer: "142 likes · 9 comments",
  },
  "umbra-roasters/recipe-rule": {
    merchant: "Umbra Coffee Roasters",
    kind: "social comment",
    handle: "@no.avatar.0419",
    title: "Reply to the April post",
    posted: "April · comment",
    body: [
      "One pour for every shelf above the grinder. Then one more for the cup that was never poured.",
      "That is how the label reads. I have read it. You have not.",
    ],
    footer: "Replying to @umbra.roasters",
  },
  "umbra-roasters/shelf-photo": {
    merchant: "Umbra Coffee Roasters",
    kind: "photo post",
    handle: "@umbra.roasters",
    title: "Photo 3 of 5 · the counter, 06:40",
    posted: "April · photo post",
    body: [
      "The frame cuts off just above the grinder. You can count three boards for certain.",
      "The fourth could be another shelf, or the lid of the machine. We are not going to tell you which — come and count.",
    ],
    footer: "Caption: “first light, before the doors”",
  },
  "umbra-roasters/letter": {
    merchant: "Umbra Coffee Roasters",
    kind: "social post",
    handle: "@umbra.roasters",
    title: "A letter addressed to a cup",
    posted: "2019 · posted once",
    body: [
      "An envelope with no name on it, only a number. We read it once and put it away.",
      "The caption we posted that day: “You kept the ninth. I kept the eleventh.”",
      "The postmark reads 04.09. The envelope is in the frame on the top shelf now.",
    ],
    footer: "37 likes · no comments",
  },
  "umbra-roasters/morning-tally": {
    merchant: "Umbra Coffee Roasters",
    kind: "social post",
    handle: "@umbra.roasters",
    title: "eighth out, eighth back",
    posted: "April – June",
    body: [
      "Three mornings in April. Three in May. Two in June.",
      "Every post has the same caption: “eighth out, eighth back”. Then the posts stop, and so does the regular.",
    ],
    footer: "Fictional post, hosted for the demo trail.",
  },
  "umbra-roasters/saucerless-cup": {
    merchant: "Umbra Coffee Roasters",
    kind: "photo post",
    handle: "@umbra.roasters",
    title: "The shelf above the grinder",
    posted: "Photo post",
    body: [
      "Every cup on the second shelf has a saucer. The one on the left end does not.",
      "We have never explained why. Nobody has asked twice.",
    ],
    footer: "Fictional post, hosted for the demo trail.",
  },
  "umbra-roasters/about": {
    merchant: "Umbra Coffee Roasters",
    kind: "website page",
    handle: "umbra-roasters.example / about",
    title: "About the roastery",
    posted: "Website · about page",
    body: [
      "We started at a market stall in 1998 with nine cups on the table and no shop to put them in.",
      "When the stall closed, two cups never went home with a customer. We have never said which two in print.",
      "The ninth is still here. The other one is not our story to tell.",
    ],
    footer: "Fictional website content, hosted for the demo trail.",
  },
  "mangwon-records/donation-log": {
    merchant: "Mangwon Records",
    kind: "shop log",
    handle: "mangwon-records.example / donation log",
    title: "Donation log · winter intake",
    posted: "Shop log",
    body: [
      "Box 14 — “7in, no label, water damage”. Donor initials M.R.",
      "Box 15 — jazz, torn corner, note inside that is not ours.",
    ],
    footer: "Fictional shop content, hosted for the demo trail.",
  },
  "mangwon-records/closing-playlist": {
    merchant: "Mangwon Records",
    kind: "social post",
    handle: "@mangwon.records",
    title: "Closing track · 22:00",
    posted: "Playlist · seventh post back",
    body: [
      "Every night we post the track we close with.",
      "Seven posts back, the same seven seconds are missing from the file. Nobody has explained it.",
    ],
    footer: "Fictional post, hosted for the demo trail.",
  },
  "mangwon-records/closing-photos": {
    merchant: "Mangwon Records",
    kind: "photo post",
    handle: "@mangwon.records",
    title: "Closing photo, every night",
    posted: "Photo archive",
    body: [
      "The shutter comes down at 22:00 in every photo. The same lamp is still on inside, facing the staff-picks shelf.",
      "The owner says it is for the records. It is not for the records.",
    ],
    footer: "Fictional post, hosted for the demo trail.",
  },
  "mangwon-records/torn-corner": {
    merchant: "Mangwon Records",
    kind: "social post",
    handle: "@mangwon.records",
    title: "A note that isn't mine",
    posted: "February",
    body: [
      "A jazz record came in with a torn corner and a blue index card inside.",
      "The card has a request written on it. We are not the ones who can fulfil it.",
    ],
    footer: "Fictional post, hosted for the demo trail.",
  },
};

export function getDemoPage(merchant: string, page: string): DemoPage | null {
  return DEMO_PAGES[`${merchant}/${page}`] ?? null;
}
