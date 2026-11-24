/**
 * P1 merchant story-drafting aid.
 *
 * It proposes draft ARG concepts from merchant-provided material. A configured
 * OpenAI-compatible provider can rewrite them; without a key a deterministic
 * local drafter is used and labelled as such. Nothing is published: every idea
 * is a draft, and no historical fact is presented as verified.
 */

export interface StoryLabInput {
  businessName: string;
  location: string;
  history: string;
  product: string;
  season: string;
  props: string;
  atmosphere: string;
  sourceUrl?: string;
}

export interface StoryConcept {
  title: string;
  premise: string;
  onlineClues: string[];
  instoreObservation: string;
  productClue: string;
  basicPuzzle: string;
  hiddenEnding: string;
}

export interface StoryLabResult {
  concepts: StoryConcept[];
  mode: "live" | "local-draft";
  model: string | null;
  note: string;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseStoryLabInput(raw: unknown): StoryLabInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  return {
    businessName: clean(input.businessName, 80),
    location: clean(input.location, 100),
    history: clean(input.history, 900),
    product: clean(input.product, 120),
    season: clean(input.season, 80),
    props: clean(input.props, 240),
    atmosphere: clean(input.atmosphere, 240),
    sourceUrl: clean(input.sourceUrl, 300),
  };
}

function localDrafts(input: StoryLabInput): StoryConcept[] {
  const shop = input.businessName || "the shop";
  const place = input.location || "the neighbourhood";
  const product = input.product.replace(/^(the|a|an)\s+/i, "") || "signature item";
  const productTitle = product.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  const props = input.props || "a paper sleeve, label or receipt insert";
  const season = input.season || "this season";
  const atmosphere = input.atmosphere || "quiet and slightly out of time";
  const history = input.history
    ? `The merchant's own note says: “${input.history.slice(0, 240)}”`
    : "The merchant has not supplied a history yet, so treat the backstory below as fiction, not fact.";

  return [
    {
      title: `The ${productTitle} That Was Never Served`,
      premise: `${shop} keeps one ${product} aside every closing. Nobody orders it, and the staff will not say who it is for. A regular's old note ties it to a number the shop has stopped saying aloud. ${history}`,
      onlineClues: [
        `A public post about ${season} mentions the ${product} in the same sentence as a closing-time ritual.`,
        `An old staff bio or menu page lists a quantity that does not match the current menu.`,
        `A customer photo of ${place} shows the ${product} on a shelf where it should not be.`,
      ],
      instoreObservation: `At the counter, count the objects the ritual names and compare that count with the public record. Do not move anything; the clue is meant to be read where it sits.`,
      productClue: `A phrase printed on ${props} gives an instruction, not another fact: it tells the player to combine the shelf count with the number from the older record.`,
      basicPuzzle: `Ask the player for the count the public record and the counter agree on. The answer should be a short number, checked on the server.`,
      hiddenEnding: `The reserved ${product} was a memorial, not a menu item. The final number is the total of the ritual plus the people it remembers.`,
    },
    {
      title: `Closing Time at ${shop}`,
      premise: `The shop is ${atmosphere}. One object in ${place} is photographed differently every year, always at the same hour, and the captions never explain it. The merchant knows why but has never written it down. ${history}`,
      onlineClues: [
        `Three seasonal posts repeat the same object and time with one detail changed.`,
        `A public review mentions a sound or smell that does not belong to ${product}.`,
        `The shop's own about page gives a date that contradicts the annual posts.`,
      ],
      instoreObservation: `The player finds the object from the posts in the public counter area. The in-store detail that matters is its position relative to something named online.`,
      productClue: `The packaging carries a small mark and a fragment of the annual date. It completes the pattern only when read beside the public posts.`,
      basicPuzzle: `Ask for the hour or the date the annual posts agree on. Keep the answer private on the server.`,
      hiddenEnding: `The annual photo was taken by someone who no longer visits. The last clue turns the ritual into a farewell, and the player is the first person to notice.`,
    },
    {
      title: `The Ledger Under the ${product}`,
      premise: `A hand-written ledger at ${shop} records ${season} in two columns that never balance. The missing entry is not money — it is a ${product} given away. ${history}`,
      onlineClues: [
        `A public post shows one column of the ledger but crops the other.`,
        `An old menu or price list uses a unit the current shop no longer uses.`,
        `A comment thread argues about a number the shop never corrects.`,
      ],
      instoreObservation: `The player compares the visible ledger with the public crop. One entry is written in a different hand.`,
      productClue: `The ${props} reproduces the missing entry as a code: the number is split across the packaging and the ledger.`,
      basicPuzzle: `Ask for the missing count in the ledger, not the total.`,
      hiddenEnding: `The missing entry was the owner's own order, kept open so the shop would have a reason to keep the ledger. The player closes the account.`,
    },
  ];
}

function providerConfigured(): boolean {
  return Boolean(process.env.ARG_AI_API_KEY && process.env.ARG_AI_MODEL);
}

async function liveDrafts(input: StoryLabInput): Promise<StoryConcept[]> {
  const base = (process.env.ARG_AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ARG_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.ARG_AI_MODEL,
        temperature: 0.8,
        max_tokens: 1400,
        messages: [
          {
            role: "system",
            content:
              "You draft location-based ARG campaigns for small shops. Return strict JSON: {\"concepts\":[{\"title\",\"premise\",\"onlineClues\":[3 strings],\"instoreObservation\",\"productClue\",\"basicPuzzle\",\"hiddenEnding\"}]} with exactly 3 concepts. Use the merchant's facts as facts, but never invent a historical claim and present it as verified. Mark invented backstory as fiction inside the premise. The product clue must contain an instruction that combines with earlier evidence. No real payments, no first-finder mechanics.",
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The model did not return JSON.");
    const parsed = JSON.parse(match[0]) as { concepts?: StoryConcept[] };
    const concepts = (parsed.concepts ?? []).slice(0, 3);
    if (concepts.length < 1) throw new Error("The model returned no concepts.");
    return concepts;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateStoryIdeas(input: StoryLabInput): Promise<StoryLabResult> {
  if (!providerConfigured()) {
    return {
      concepts: localDrafts(input),
      mode: "local-draft",
      model: null,
      note: "No AI key is configured. These are deterministic draft concepts assembled from your inputs — not live AI output, and not verified history.",
    };
  }
  try {
    return {
      concepts: await liveDrafts(input),
      mode: "live",
      model: process.env.ARG_AI_MODEL ?? null,
      note: "Draft concepts generated by the configured AI provider. Merchant review is required before publishing; invented backstory is fiction.",
    };
  } catch (error) {
    return {
      concepts: localDrafts(input),
      mode: "local-draft",
      model: process.env.ARG_AI_MODEL ?? null,
      note: `Live AI was unavailable (${(error as Error).message}). Local draft concepts are shown instead.`,
    };
  }
}
