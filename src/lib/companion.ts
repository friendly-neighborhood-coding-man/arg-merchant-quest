import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { QuestView } from "./quest-store";

/**
 * P1 investigation companion.
 *
 * The companion only ever receives the player-visible quest view: revealed
 * clues, the current stage, the optional product state and the public campaign
 * story. The answer fields, the unreleased product clue and the hidden ending
 * are not in that view, so they cannot be sent to a model by accident.
 *
 * A configured OpenAI-compatible provider is used when ARG_AI_API_KEY is set.
 * Without a key (or when the provider fails) a deterministic scripted guide
 * answers instead and says so. The scripted path never gives the final answer.
 */

export type CompanionMode = "live" | "scripted" | "scripted_fallback";

export interface CompanionReply {
  reply: string;
  mode: CompanionMode;
  model: string | null;
  note: string | null;
}

export interface CompanionMessage {
  role: "user" | "assistant";
  content: string;
  mode: string;
  createdAt: string;
}

const MAX_HISTORY = 10;
const MAX_MESSAGE_CHARS = 700;
const MAX_REPLY_CHARS = 900;

export function companionConfigured(): boolean {
  return Boolean(process.env.ARG_AI_API_KEY && process.env.ARG_AI_MODEL);
}

export function companionModelName(): string | null {
  return process.env.ARG_AI_MODEL ?? null;
}

function providerUrl(): string {
  const base = (process.env.ARG_AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

export function listCompanionMessages(sessionId: string, limit = 40): CompanionMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT role, content, mode, created_at FROM companion_messages
       WHERE session_id = ? ORDER BY created_at ASC LIMIT ?`,
    )
    .all(sessionId, limit) as unknown as Array<{
    role: "user" | "assistant";
    content: string;
    mode: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    role: row.role,
    content: row.content,
    mode: row.mode,
    createdAt: row.created_at,
  }));
}

export function saveCompanionMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  mode: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO companion_messages (id, session_id, role, content, mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`msg_${randomUUID()}`, sessionId, role, content.slice(0, MAX_REPLY_CHARS), mode, new Date().toISOString());
}

interface CompanionContext {
  campaignTitle: string;
  shopName: string;
  shopArea: string;
  story: string;
  stage: string;
  onlineRead: number;
  onlineTotal: number;
  instoreRead: number;
  instoreTotal: number;
  answerQuestion: string;
  answerSolved: boolean;
  evidenceStatus: string | null;
  verified: boolean;
  rewardStatus: string | null;
  chainCommittedValue: number | null;
  optionalMode: string;
  productName: string;
  preOrderSolved: boolean;
  claimStatus: string | null;
  claimReference: string | null;
  clueReleased: boolean;
  productClue: string | null;
  finalQuestion: string;
  finalSolved: boolean;
  hints: string[];
  milestone: {
    status: string | null;
    committedValue: number | null;
    counterAccount: string | null;
  } | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

function buildContext(view: QuestView, messages: CompanionMessage[]): CompanionContext {
  const hints: string[] = [];
  if (view.hints.one.text) hints.push(view.hints.one.text);
  if (view.hints.two.text) hints.push(view.hints.two.text);

  return {
    campaignTitle: view.campaign.title,
    shopName: view.campaign.shopName,
    shopArea: view.campaign.shopArea,
    story: view.campaign.story,
    stage: view.stage,
    onlineRead: view.trail.onlineRead,
    onlineTotal: view.trail.onlineTotal,
    instoreRead: view.trail.instoreRead,
    instoreTotal: view.trail.instoreTotal,
    answerQuestion: view.answer.question,
    answerSolved: view.answer.solved,
    evidenceStatus: view.evidence?.status ?? null,
    verified: Boolean(view.completion),
    rewardStatus: view.completion?.payoutStatus ?? null,
    chainCommittedValue: view.completion?.chain.committedValue ?? null,
    optionalMode: view.optional.mode,
    productName: view.optional.productName,
    preOrderSolved: view.extended.solved,
    claimStatus: view.optional.claim?.status ?? null,
    claimReference: view.optional.claim?.reference ?? null,
    clueReleased: Boolean(view.optional.clue),
    productClue: view.optional.clue?.text ?? null,
    finalQuestion: view.optional.final.question,
    finalSolved: view.optional.final.solved,
    hints,
    milestone: view.optional.claim?.chain
      ? {
          status: view.optional.claim.chain.status,
          committedValue: view.optional.claim.chain.committedValue,
          counterAccount: view.optional.claim.chain.counterAccount,
        }
      : null,
    messages: messages.slice(-MAX_HISTORY).map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };
}

function revealedClues(view: QuestView): string[] {
  const lines: string[] = [];
  for (const clue of view.trail.online) lines.push(`Online — ${clue.title}: ${clue.body}`);
  for (const clue of view.trail.instore) lines.push(`In store — ${clue.title}: ${clue.body}`);
  for (const clue of view.extended.clues) lines.push(`Optional — ${clue.title}: ${clue.body}`);
  return lines;
}

function systemPrompt(context: CompanionContext, view: QuestView): string {
  const clueText = revealedClues(view);
  const hints = context.hints.length
    ? context.hints.map((hint, index) => `${index + 1}. ${hint}`).join("\n")
    : "None yet. Do not invent stronger hints; time-gated hints are not released.";

  return [
    "You are a fellow investigator inside a fictional location-based ARG at an independent shop.",
    "Your role: a curious, practical partner at the counter. Not customer support, not a game show host.",
    "Answer in 2-5 short sentences, under 120 words. Calm, specific, story-appropriate.",
    "RULES:",
    "- Use only the campaign facts and player-visible clues below. Never invent historical facts about the real world.",
    "- Never state the basic answer, the pre-order deduction answer, the hidden-ending answer, or an unreleased product clue.",
    "- If asked directly for the answer or the ending, refuse briefly and offer a process hint instead.",
    "- Do not reveal anything the player has not unlocked. If the product clue is locked, say it is inside the designated product and that staff release it after a demo handoff.",
    "- Challenge weak hypotheses with a question or a comparison; do not simply agree.",
    "- If a real MagicBlock milestone is present with committedValue 1, you may use it: the clue handoff was recorded on the Ephemeral Rollup. Describe it as game state, not as proof of a real purchase.",
    "- The free reward is fixed and unaffected by the product, hints or this conversation.",
    "",
    `CAMPAIGN: ${context.campaignTitle} at ${context.shopName}, ${context.shopArea}.`,
    `STORY (public): ${context.story}`,
    `STAGE: ${context.stage}. Online clues read ${context.onlineRead}/${context.onlineTotal}; in-store clues read ${context.instoreRead}/${context.instoreTotal}.`,
    `COUNTER QUESTION: ${context.answerQuestion} (solved: ${context.answerSolved}).`,
    `EVIDENCE: ${context.evidenceStatus ?? "not submitted"}; verified: ${context.verified}.`,
    `BASIC REWARD: ${context.rewardStatus ?? "not claimed"}; MagicBlock completion counter: ${context.chainCommittedValue ?? "not recorded"}.`,
    `OPTIONAL MODE: ${context.optionalMode}. Product: ${context.productName || "none"}. Pre-order deduction solved: ${context.preOrderSolved}. Claim: ${context.claimStatus ?? "not requested"}${context.claimReference ? ` (reference ${context.claimReference})` : ""}.`,
    `PRODUCT CLUE RELEASED: ${context.clueReleased}${context.productClue ? `\nPRODUCT CLUE (released): ${context.productClue}` : ""}.`,
    `FINAL QUESTION: ${context.finalQuestion || "none"} (solved: ${context.finalSolved}).`,
    `ER CLUE MILESTONE: ${context.milestone ? `${context.milestone.status}, committed value ${context.milestone.committedValue}` : "not recorded"}.`,
    `RELEASED HINTS:\n${hints}`,
    "",
    "REVEALED CLUES:",
    ...(clueText.length ? clueText : ["No clues have been revealed yet."]),
  ].join("\n");
}

async function callProvider(
  context: CompanionContext,
  view: QuestView,
  message: string,
): Promise<CompanionReply> {
  const key = process.env.ARG_AI_API_KEY as string;
  const model = process.env.ARG_AI_MODEL as string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(providerUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 240,
        messages: [
          { role: "system", content: systemPrompt(context, view) },
          ...context.messages,
          { role: "user", content: message },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AI provider returned HTTP ${response.status}.`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("AI provider returned an empty reply.");
    return {
      reply: text.slice(0, MAX_REPLY_CHARS),
      mode: "live",
      model,
      note: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic, story-aware fallback. It never reveals answers or locked clues. */
export function scriptedReply(
  view: QuestView,
  message: string,
): { reply: string; mode: "scripted" } {
  const text = message.toLowerCase();
  const asked = (words: string[]) => words.some((word) => text.includes(word));
  const clues = revealedClues(view);
  const lastClue = clues[clues.length - 1] ?? null;

  if (
    asked(["final answer", "the answer", "tell me the answer", "solution", "solve it", "just tell"]) ||
    (asked(["answer"]) && asked(["what is", "give", "tell"]))
  ) {
    return {
      reply:
        "I won't hand you the answer — that is the one thing this trail asks you to do. But I will tell you what kind of answer it wants: the counter's question asks you to count something the story names twice. Check the numbers you have already written down and tell me which of them you have not used yet.",
      mode: "scripted",
    };
  }

  if (view.optional.clue && asked(["unlock", "connect", "sleeve", "what changed", "what now", "product clue"])) {
    const milestone = view.optional.claim?.chain?.committedValue === 1;
    return {
      reply: `The sleeve changes the question. It says: “${view.optional.clue.text}” That is an instruction, not another number to find: the room already told us how many shelves there are, and the letter already gave us its total. Apply the sleeve's operation to those two numbers — and do not count the cups again.${milestone ? ` The handoff that released this clue is recorded on the MagicBlock counter (${view.optional.claim?.chain?.counterAccount}); that is why I can reason about it as released game state, though it is not proof of a purchase.` : ""}`,
      mode: "scripted",
    };
  }

  if (asked(["summary", "summar", "so far", "discovered", "what do we know"])) {
    const parts = [
      `We are at ${view.campaign.shopName} in ${view.campaign.shopArea}, on the "${view.campaign.title}" trail.`,
      `Stage: ${view.stage}. We have read ${view.trail.onlineRead}/${view.trail.onlineTotal} online sources and ${view.trail.instoreRead}/${view.trail.instoreTotal} in-store clues.`,
    ];
    if (clues.length) parts.push(`The last thing we found: ${lastClue}`);
    if (view.answer.solved) parts.push("The counter's question is answered.");
    if (view.completion) parts.push(`The completion is verified; the fixed reward is ${view.completion.payoutStatus}.`);
    if (view.extended.solved) parts.push("The pre-order deduction is solved.");
    if (view.optional.claim) {
      parts.push(
        view.optional.claim.status === "handed_off"
          ? `The product clue has been released under reference ${view.optional.claim.reference}${
              view.optional.claim.chain?.committedValue === 1
                ? ` and the handoff is committed on the MagicBlock counter (${view.optional.claim.chain.counterAccount})`
                : ""
            }.`
          : `The product is requested under reference ${view.optional.claim.reference}, but the clue is still inside it.`,
      );
    }
    if (view.optional.final.solved) parts.push("We reached the hidden ending.");
    return { reply: parts.join(" "), mode: "scripted" };
  }

  if (asked(["suspicious", "photo", "observe", "notice", "wrong with"])) {
    return {
      reply: lastClue
        ? `Start with the last record: “${lastClue.split(": ")[0]}”. Every detail there was chosen by the shop. Ask which part is a number, which part is a place, and which part repeats earlier. The suspicious detail is usually the one that does not fit the object around it.`
        : "We have not opened a record yet. Read the first online source, then tell me which single detail feels out of place — a number, a time, or an object that should not be there.",
      mode: "scripted",
    };
  }

  if (asked(["connect", "compare", "linked", "together", "mean"])) {
    const first = clues[0] ?? null;
    return {
      reply:
        first && lastClue && clues.length > 1
          ? `Put these two side by side. Earlier: “${first.split(": ")[0]}”. Now: “${lastClue.split(": ")[0]}”. They agree on one thing and disagree on another. Name the number both of them mention — that is the thread to pull.`
          : "There is not enough on the table to compare yet. Find a second record, then we can look for a number or an object that appears in both.",
      mode: "scripted",
    };
  }

  if (asked(["next", "what should", "where should", "inspect", "do now"])) {
    let next = "Read the next online record and bring me one detail from it.";
    if (view.trail.onlineRead < view.trail.onlineTotal) {
      next = `Read source ${view.trail.onlineRead + 1} of ${view.trail.onlineTotal}${view.trail.nextOnlineTitle ? ` — “${view.trail.nextOnlineTitle}”` : ""}. Look for a number you can compare later.`;
    } else if (view.trail.instoreRead < view.trail.instoreTotal) {
      next = `At the counter, find clue ${view.trail.instoreRead + 1}${view.trail.nextInstoreTitle ? ` — “${view.trail.nextInstoreTitle}”` : ""}. Count the things the counter rule asks about.`;
    } else if (!view.answer.solved) {
      next = "Answer the counter's question with the number you have counted. If it is rejected, recount the in-store detail; do not guess the reward.";
    } else if (!view.completion) {
      next = "Submit your evidence and wait for a person to review it. Nothing is approved automatically.";
    } else if (view.optional.mode === "product_clue" && !view.extended.solved) {
      next = "Open the optional second question. It is a deduction from records you already have, not a purchase.";
    } else if (view.optional.mode === "product_clue" && !view.optional.claim) {
      next = `Request the ${view.optional.productName} at the counter. The clue is in the product, so the order is part of the investigation.`;
    } else if (view.optional.claim?.status === "requested") {
      next = `Show reference ${view.optional.claim.reference} to staff and ask them to hand over the product clue.`;
    } else if (view.optional.clue && !view.optional.final.solved) {
      next = "Read the sleeve again beside the shelf count and the letter's total. Add the numbers the way the sleeve tells you, not the way the cups are counted.";
    } else if (view.completion && !view.optional.final.solved) {
      next = "Finish the free reward first. The optional product trail is an extra story, not a condition for the reward.";
    } else {
      next = "You have what the trail has to give. Reload the page to see the ending and your achievement.";
    }
    return { reply: next, mode: "scripted" };
  }

  if (asked(["hypothesis", "wrong", "mistaken", "sure"])) {
    return {
      reply:
        "A good check: state your hypothesis in one sentence, then find one clue that would be false if you were right. If every clue still fits, you are probably reading a coincidence as a pattern. Tell me your sentence and I will point at the weakest word in it.",
      mode: "scripted",
    };
  }

  if (asked(["neighbourhood", "neighborhood", "area", "mapo", "seongsu", "seoul"])) {
    return {
      reply: `${view.campaign.shopName} is in ${view.campaign.shopArea}. Keep to the public counter area and do not move anything. The neighbourhood is part of the atmosphere, not a place to search outside the shop.`,
      mode: "scripted",
    };
  }

  if (asked(["hint", "help", "stuck", "no idea", "confused", "lost"])) {
    if (view.optional.clue && !view.optional.final.solved && asked(["hint", "stuck", "no idea"])) {
      return {
        reply: `The sleeve is the last instruction. It tells you to pour twice for every shelf, then add the number the letter already gave you. The shelves are the ones you counted in the shop; the letter's number is the one you used to unlock this product. Do that one sum and answer with the total.`,
        mode: "scripted",
      };
    }
    if (view.hints.two.text) {
      return { reply: `The counter's second note says: “${view.hints.two.text}” Use that, and tell me which part of it you can already see in the clues.`, mode: "scripted" };
    }
    if (view.hints.one.text) {
      return { reply: `The counter's first note says: “${view.hints.one.text}” Start there. If it still does not land, stay on the trail a little longer; the second note unlocks at five minutes.`, mode: "scripted" };
    }
    return {
      reply:
        "No stronger hint yet. Describe the last clue in your own words and name the number or object it repeats. That usually makes the next step obvious. The counter's timed notes unlock at three and five minutes.",
      mode: "scripted",
    };
  }

  if (asked(["product", "order", "buy", "purchase", "sleeve", "cup", "clue"])) {
    if (view.optional.mode !== "product_clue") {
      return {
        reply:
          "This trail's optional ending is a demo coupon, not a product clue. The free reward is separate from it. Ask me about the clues if you want to compare them.",
        mode: "scripted",
      };
    }
    if (view.optional.clue) {
      return {
        reply: `You already have the product clue: “${view.optional.clue.text}” Compare it with the shelf count and the letter's total. The sleeve is telling you an operation, not another object to find.`,
        mode: "scripted",
      };
    }
    if (view.optional.claim?.status === "handed_off") {
      return {
        reply: `Staff have released the clue under reference ${view.optional.claim.reference}. Reload the trail to read the sleeve — it is printed, not spoken, so read every line including the small type.`,
        mode: "scripted",
      };
    }
    if (view.optional.claim) {
      return {
        reply: `Your reference is ${view.optional.claim.reference}. The clue stays inside the ${view.optional.productName} until staff confirm the demo handoff at the counter. Nothing is charged in this prototype.`,
        mode: "scripted",
      };
    }
    return {
      reply: `The ${view.optional.productName} is the last physical clue. Finish the pre-order deduction first, then request the product at the counter. The clue will not appear in the page before staff release it.`,
      mode: "scripted",
    };
  }

  if (asked(["final", "ending", "end"])) {
    return {
      reply: view.optional.final.solved
        ? "We reached it. Reload the trail to reread the ending; it is yours now."
        : view.optional.clue
          ? "The ending is unlocked only by the final answer, and the sleeve is the last clue. Re-read it against what the shop and the letter already told you."
          : "The ending is still locked behind the product clue. We cannot reason our way past a physical object we have not seen yet.",
      mode: "scripted",
    };
  }

  if (asked(["magicblock", "blockchain", "chain", "on-chain", "er"])) {
    return {
      reply: view.optional.claim?.chain?.committedValue === 1
        ? `The clue handoff was recorded as game state on a MagicBlock Ephemeral Rollup (counter ${view.optional.claim.chain.counterAccount}). That changes what I can reason about — the release is real game state — but it is not proof of a purchase or a payment.`
        : "The MagicBlock counter records the campaign completion and, later, the clue handoff. It does not contain our conversation or the answer. Until a milestone is recorded, treat that part as pending.",
      mode: "scripted",
    };
  }

  if (!lastClue) {
    return {
      reply:
        "We are at the beginning. The shop left a public trail, and the first record usually names a number, a place or an object. Read it, then tell me which detail you would expect a normal shop to explain — and which one it does not.",
      mode: "scripted",
    };
  }

  return {
    reply: `Let's stay with the evidence. The last thing we found was “${lastClue.split(": ")[0]}”. What detail there can you actually count, and what does the counter's question ask you to count? Tell me your guess and we will test it against the earlier record.`,
    mode: "scripted",
  };
}

export async function generateCompanionReply(
  view: QuestView,
  message: string,
): Promise<CompanionReply> {
  const clean = message.trim().slice(0, MAX_MESSAGE_CHARS);
  const history = listCompanionMessages(view.sessionId);
  const context = buildContext(view, history);

  if (!companionConfigured()) {
    return { ...scriptedReply(view, clean), model: null, note: null };
  }

  try {
    return await callProvider(context, view, clean);
  } catch (error) {
    const fallback = scriptedReply(view, clean);
    return {
      ...fallback,
      mode: "scripted_fallback",
      model: companionModelName(),
      note: `Live AI was unavailable (${(error as Error).message}). The scripted guide answered instead.`,
    };
  }
}
