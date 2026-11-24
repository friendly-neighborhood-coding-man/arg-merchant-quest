import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { milestoneState, type MilestoneState } from "./milestone";
import type { CollectivePhase } from "./collective";
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
       WHERE session_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?`,
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

export interface CompanionContext {
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
    state: MilestoneState;
    committedValue: number | null;
    counterAccount: string | null;
  } | null;
  /**
   * P2 campaign-wide collective gate. `evidence` is populated only when the
   * gate is unlocked; a locked or unavailable read carries status but no text.
   */
  collective: {
    phase: CollectivePhase;
    threshold: number;
    count: number | null;
    countSource: "er" | "base" | null;
    erLive: number | null;
    committed: number | null;
    stale: boolean;
    evidence: { title: string; text: string; source: string } | null;
  } | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * The collective block is reduced to a status object before it reaches a
 * provider. The fragment is copied only for an unlocked state, so a locked
 * read cannot leak shared evidence through the context even if a caller
 * attached an inconsistent state by mistake.
 */
function collectiveContext(view: QuestView): CompanionContext["collective"] {
  const state = view.collective;
  if (!state) return null;
  const unlocked = state.phase === "unlocked";
  return {
    phase: state.phase,
    threshold: state.threshold,
    count: state.count,
    countSource: state.countSource,
    erLive: state.erLive,
    committed: state.committed,
    stale: state.stale,
    evidence: unlocked ? (state.evidence ?? null) : null,
  };
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
    // The final question is part of the released product moment. Do not send it
    // to a provider before the clue is actually in the player's hands.
    finalQuestion: view.optional.clue ? view.optional.final.question : "",
    finalSolved: view.optional.final.solved,
    hints,
    milestone: view.optional.claim?.chain
      ? {
          state: milestoneState(view.optional.claim.chain),
          committedValue: view.optional.claim.chain.committedValue,
          counterAccount: view.optional.claim.chain.counterAccount,
        }
      : null,
    collective: collectiveContext(view),
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

function collectivePromptLines(context: CompanionContext): string[] {
  const shared = context.collective;
  if (!shared) {
    return [
      "SHARED INVESTIGATION: not read in this request. Shared evidence is locked; do not describe it.",
    ];
  }
  const status =
    shared.phase === "unlocked"
      ? `unlocked — ${shared.count ?? "unknown"} eligible clue handoffs (ER live ${shared.erLive ?? "unreadable"}, Solana committed ${shared.committed ?? "not read"})${shared.stale ? "; the ER read is behind the committed value" : ""}`
      : shared.phase === "first"
        ? `locked — 1 eligible clue handoff, ${shared.threshold} needed (ER live ${shared.erLive ?? "unreadable"}, Solana committed ${shared.committed ?? "not read"})`
        : shared.phase === "none"
          ? `locked — no eligible clue handoffs recorded yet (ER live 0, Solana committed ${shared.committed ?? "not read"})`
          : `unavailable — the MagicBlock milestone could not be read (Solana committed ${shared.committed ?? "not read"}); shared evidence stays locked`;
  const lines = [
    `SHARED INVESTIGATION (campaign-wide MagicBlock clue milestone): ${status}. The count records eligible handoffs, not unique people.`,
  ];
  if (shared.phase === "unlocked" && shared.evidence) {
    lines.push(`SHARED EVIDENCE (unlocked): ${shared.evidence.title} — ${shared.evidence.text}`);
  } else {
    lines.push("SHARED EVIDENCE: locked or unavailable. Its content must not appear in your reply.");
  }
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
    "- Never state the basic answer, the optional deduction answer, the hidden-ending answer, or an unreleased product clue.",
    "- If asked directly for the answer or the ending, refuse briefly and offer a process hint instead.",
    "- Do not reveal anything the player has not unlocked. If the product clue is locked, say it is inside the designated product and that staff release it after a demo handoff.",
    "- Challenge weak hypotheses with a question or a comparison; do not simply agree. Name the weakest assumption and one clue that would falsify it.",
    "- Separate what the player has observed from what they are guessing. Say which is which.",
    "- Ask one useful follow-up question rather than giving a list of instructions.",
    "- Do not repeat your previous reply. If the player circles the same point, name a concrete detail to test instead.",
    "- ER CLUE MILESTONE state 'committed' means this player's clue handoff was incremented on the MagicBlock Ephemeral Rollup and committed back to Solana. The committed value is the campaign-wide cumulative count of released clues, so any value of 1 or more is valid. Describe it as game state, not as proof of a real purchase.",
    "- State 'unconfirmed' or 'unavailable' means the clue was released locally but its on-chain record is not confirmed; say so plainly. Never treat the counter's value alone as proof of this player's handoff.",
    "- SHARED INVESTIGATION is the campaign-wide MagicBlock clue count: eligible handoffs, not unique people. Its status is safe to discuss. Its evidence is readable only when the phase is 'unlocked'.",
    "- Shared evidence is LOCKED unless the phase says unlocked. Never guess, paraphrase or invent its content, and never treat the count alone as unlocked evidence. If the count is 1, say a second verified handoff is still needed.",
    "- When shared evidence is unlocked, compare it with this player's own observations, name where it supports or contradicts the theory they stated, and ask one more specific question. Do not change the campaign's answers or reveal them.",
    "- The free reward is fixed and unaffected by the product, hints or this conversation.",
    "",
    `CAMPAIGN: ${context.campaignTitle} at ${context.shopName}, ${context.shopArea}.`,
    `STORY (public): ${context.story}`,
    `STAGE: ${context.stage}. Online clues read ${context.onlineRead}/${context.onlineTotal}; in-store clues read ${context.instoreRead}/${context.instoreTotal}.`,
    `COUNTER QUESTION: ${context.answerQuestion} (solved: ${context.answerSolved}).`,
    `EVIDENCE: ${context.evidenceStatus ?? "not submitted"}; verified: ${context.verified}.`,
    `BASIC REWARD: ${context.rewardStatus ?? "not claimed"}; MagicBlock completion counter: ${context.chainCommittedValue ?? "not recorded"}.`,
    `OPTIONAL MODE: ${context.optionalMode}. Product: ${context.productName || "none"}. Optional deduction solved: ${context.preOrderSolved}. Claim: ${context.claimStatus ?? "not requested"}${context.claimReference ? ` (reference ${context.claimReference})` : ""}.`,
    `PRODUCT CLUE RELEASED: ${context.clueReleased}${context.productClue ? `\nPRODUCT CLUE (released): ${context.productClue}` : ""}.`,
    `FINAL QUESTION: ${context.finalQuestion || "none"} (solved: ${context.finalSolved}).`,
    `ER CLUE MILESTONE: ${context.milestone ? `${context.milestone.state}${context.milestone.state === "committed" ? `, campaign-wide committed count ${context.milestone.committedValue}` : ""}` : "not recorded"}.`,
    ...collectivePromptLines(context),
    `RELEASED HINTS:\n${hints}`,
    "",
    "REVEALED CLUES:",
    ...(clueText.length ? clueText : ["No clues have been revealed yet."]),
  ].join("\n");
}

/**
 * The chat messages sent to the provider: system prompt, stored history, then
 * the current player message exactly once. The history must not already
 * contain the current message (see `answerCompanionMessage`).
 */
export function buildProviderMessages(
  context: CompanionContext,
  view: QuestView,
  message: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    { role: "system", content: systemPrompt(context, view) },
    ...context.messages,
    { role: "user", content: message },
  ];
}

async function callProvider(
  context: CompanionContext,
  view: QuestView,
  message: string,
): Promise<CompanionReply> {
  const key = process.env.ARG_AI_API_KEY as string;
  const model = process.env.ARG_AI_MODEL as string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const payload: Record<string, unknown> = {
    model,
    temperature: 0.6,
    max_tokens: 240,
    messages: buildProviderMessages(context, view, message),
  };

  async function request(body: Record<string, unknown>): Promise<Response> {
    try {
      return await fetch(providerUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("AI provider timed out after 20 seconds.");
      }
      throw error;
    }
  }

  try {
    let response = await request(payload);
    // OpenAI's newer models renamed `max_tokens` to `max_completion_tokens`.
    // Compatible servers vary, so retry once only when the error explicitly
    // names the parameter; every other provider failure goes to the fallback.
    if (response.status === 400) {
      const detail = await response.text();
      if (/max_tokens|max_completion_tokens/i.test(detail)) {
        delete payload.max_tokens;
        payload.max_completion_tokens = 240;
        response = await request(payload);
      }
    }
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

/** The public question the player is currently working on, if any. */
function currentQuestion(view: QuestView): string | null {
  if (!view.answer.solved) return view.answer.question || null;
  if (view.optional.clue && !view.optional.final.solved) return view.optional.final.question || null;
  if (view.extended.available && !view.extended.solved && view.extended.step > 0) {
    return view.extended.question || null;
  }
  return null;
}

function productLabel(view: QuestView): string {
  const name = view.optional.productName.trim();
  return name ? `“${name}”` : "the signature product";
}

/**
 * Deterministic description of the shared investigation gate. Safe in every
 * state: it describes the milestone but never prints the evidence fragment
 * unless the gate is unlocked.
 */
export function collectiveSentence(view: QuestView): string {
  const shared = view.collective;
  if (!shared) {
    return "The campaign's shared investigation record was not read, so its evidence stays locked.";
  }
  switch (shared.phase) {
    case "unlocked":
      return `The campaign's MagicBlock clue milestone is at ${shared.count} eligible handoffs (ER live ${shared.erLive ?? "unreadable"}, Solana committed ${shared.committed ?? "not read"}), so the shared evidence is unlocked.`;
    case "first":
      return `The campaign's MagicBlock clue milestone has 1 eligible handoff (Solana committed ${shared.committed ?? "not read"}). A second verified handoff is still needed before any shared evidence can be used.`;
    case "none":
      return "The campaign's MagicBlock clue milestone has no eligible handoff yet, so there is no shared evidence to investigate.";
    default:
      return "The MagicBlock clue milestone could not be read just now, so shared evidence is unavailable. I will not guess at it.";
  }
}

/** Scripted answer for collective / revisit-the-theory questions. */
function collectiveReply(view: QuestView): string {
  const shared = view.collective;
  if (!shared) return collectiveSentence(view);
  if (shared.phase !== "unlocked") {
    return `${collectiveSentence(view)} While it stays locked, treat your own theory as a hypothesis: ${followUpFor(view)}`;
  }
  if (!shared.evidence) {
    return `${collectiveSentence(view)} This campaign has no shared evidence fragment, so there is nothing new to compare. Stay with the clues you already have.`;
  }
  const first = revealedClues(view)[0]?.split(": ")[0] ?? null;
  const comparison = first
    ? `Compare that with “${first}”.`
    : "You have not revealed a clue yet, so read the first public record and bring one detail back; then we can test it against this.";
  return `${collectiveSentence(view)} The shared record says: “${shared.evidence.text}” ${comparison} Does your current theory explain why the two readers disagreed about the count, or does it quietly assume one of them was right? That assumption is the next thing to test, and it is a question about method, not about the final number.`;
}

/**
 * One sentence about this claim's clue milestone. It is based on the evidence
 * stored for this player's handoff, never on the campaign-wide counter alone.
 */
export function milestoneSentence(view: QuestView): string {
  const chain = view.optional.claim?.chain ?? null;
  switch (milestoneState(chain)) {
    case "committed":
      return `The release of this clue is committed on the MagicBlock clue counter (${chain?.counterAccount}); the campaign-wide count of released clues is now ${chain?.committedValue}. That is game state, not proof of a purchase.`;
    case "unconfirmed":
      return "The clue was released locally. Its MagicBlock record was sent but is not confirmed on Solana, so treat the on-chain part as unconfirmed.";
    case "unavailable":
      return "The clue was released locally. The MagicBlock milestone was unavailable, so there is no on-chain record of this handoff.";
    default:
      return "";
  }
}

/** A concrete follow-up used when the player circles the same question. */
function followUpFor(view: QuestView): string {
  if (view.optional.clue && !view.optional.final.solved) {
    return "Name one detail in the product clue and one earlier detail it changes. If you cannot pair them, the gap is where the answer lives.";
  }
  if (view.optional.claim?.status === "requested") {
    return "The clue is still inside the product. What do you expect it to change about the earlier evidence once staff release it?";
  }
  if (view.extended.available && !view.extended.solved) {
    return "Which two clues in the optional trail seem to disagree, and which one did the shop write later?";
  }
  if (!view.answer.solved) {
    return "Say your current answer out loud, then point to the exact clue that produced it. If you cannot point to one, that is the gap.";
  }
  if (!view.completion) {
    return "What will your photo actually show? Describe the object and the detail that ties it to the story.";
  }
  return "Pick the one detail you have not used yet and tell me what it would change.";
}

/** Deterministic, story-aware fallback. It never reveals answers or locked clues. */
function scriptedReplyOnce(
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
    const question = currentQuestion(view);
    return {
      reply: `I won't hand you the answer — that is the one thing this trail asks you to do.${
        question ? ` Read the question again: “${question}”` : ""
      } Check the numbers and details you have already written down from the clues, and tell me which of them you have not used yet.`,
      mode: "scripted",
    };
  }

  if (view.optional.clue && asked(["unlock", "connect", "sleeve", "what changed", "what now", "product clue"])) {
    const milestone = milestoneSentence(view);
    return {
      reply: `The product clue changes the question. It says: “${view.optional.clue.text}” Treat it as an instruction, not another object to find: apply it to what the earlier clues already established, rather than counting again.${milestone ? ` ${milestone}` : ""}`,
      mode: "scripted",
    };
  }

  if (asked(["summary", "summar", "so far", "discovered", "what do we know"])) {
    const parts = [
      `We are at ${view.campaign.shopName} in ${view.campaign.shopArea}, following "${view.campaign.title}".`,
      `Stage: ${view.stage}. We have read ${view.trail.onlineRead}/${view.trail.onlineTotal} online sources and ${view.trail.instoreRead}/${view.trail.instoreTotal} in-store clues.`,
    ];
    if (clues.length) parts.push(`The last thing we found: ${lastClue}`);
    if (view.answer.solved) parts.push("The counter's question is answered.");
    if (view.completion) parts.push(`The completion is verified; the fixed reward is ${view.completion.payoutStatus}.`);
    if (view.extended.solved) parts.push("The optional deduction is solved.");
    if (view.optional.claim) {
      parts.push(
        view.optional.claim.status === "handed_off"
          ? `The product clue has been released under reference ${view.optional.claim.reference}.${
              milestoneSentence(view) ? ` ${milestoneSentence(view)}` : ""
            }`
          : `The product is requested under reference ${view.optional.claim.reference}, but the clue is still inside it.`,
      );
    }
    if (view.optional.final.solved) parts.push("We reached the hidden ending.");
    if (view.collective?.phase === "unlocked") {
      parts.push(
        "A second verified handoff has opened the shared investigation evidence; ask me to revisit the earlier theories against it.",
      );
    }
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
      next = `Request ${productLabel(view)} at the counter. The clue is in the product, so the demo order is part of the investigation.`;
    } else if (view.optional.claim?.status === "requested") {
      next = `Show reference ${view.optional.claim.reference} to staff and ask them to hand over the product clue.`;
    } else if (view.optional.clue && !view.optional.final.solved) {
      next = `Read the product clue again beside what the earlier clues established, then answer: “${view.optional.final.question}”`;
    } else if (view.completion && !view.optional.final.solved) {
      next = "Finish the free reward first. The optional product trail is an extra story, not a condition for the reward.";
    } else {
      next = "You have what the trail has to give. Reload the page to see the ending and your achievement.";
    }
    return { reply: next, mode: "scripted" };
  }

  if (asked(["hypothesis", "my theory", "could be", "i think"])) {
    const clue = lastClue ? `“${lastClue.split(":")[0]}”` : "the last clue";
    return {
      reply: `Treat it as a hypothesis, not a fact. State it in one sentence, then test it against ${clue}: would that clue look different if you were wrong? If not, your theory is too vague to check. What is the weakest word in your sentence?`,
      mode: "scripted",
    };
  }

  if (asked(["does it fit", "does this fit"])) {
    const clue = lastClue ? `“${lastClue.split(":")[0]}”` : "the last clue";
    return {
      reply: `Test it against ${clue}. Does that clue look different if your idea is wrong? If it fits every possible answer, it is not specific enough yet. Tell me the one detail that would make you abandon the idea.`,
      mode: "scripted",
    };
  }

  if (asked(["contradict", "disagree", "conflict", "doesn't fit", "does not fit"])) {
    const first = clues[0] ?? null;
    return {
      reply:
        first && lastClue && clues.length > 1
          ? `Look for a real contradiction, not just two different facts. Earlier: “${first.split(":")[0]}”. Later: “${lastClue.split(":")[0]}”. Do they describe the same object at different times, or two different objects? Tell me which, and I will help you test it.`
          : "A contradiction needs at least two observations on the table. Read one more source or look at the in-store detail, then bring me the two lines that seem incompatible.",
      mode: "scripted",
    };
  }

  if (asked(["missing evidence", "what evidence", "what am i missing", "haven't found", "not found", "what do i need"])) {
    let missing = "Start with the next public record. We need one observation before we can test a theory.";
    if (view.trail.onlineRead < view.trail.onlineTotal) {
      missing = `We have read ${view.trail.onlineRead} of ${view.trail.onlineTotal} public sources. The missing evidence is the next record${view.trail.nextOnlineTitle ? `, “${view.trail.nextOnlineTitle}”` : ""}. Read it for a detail that can be counted or compared.`;
    } else if (view.trail.instoreRead < view.trail.instoreTotal) {
      missing = `The online trail is read, but we still need the in-store observation${view.trail.nextInstoreTitle ? `, “${view.trail.nextInstoreTitle}”` : ""}. Look at the public counter area without moving anything.`;
    } else if (!view.answer.solved) {
      missing = `We have the clues, but not your deduction. The question is “${view.answer.question}” Look for the one number the clues agree on, then answer it.`;
    } else if (!view.completion) {
      missing = "We have your deduction, but not reviewed evidence. A photo of the object — camera, upload or labelled simulation — is the next missing piece.";
    } else if (view.optional.mode === "product_clue" && !view.extended.solved) {
      missing = "The optional trail is still unopened. Read its three records and look for the one detail that disagrees with the free trail.";
    } else if (view.optional.mode === "product_clue" && !view.optional.claim) {
      missing = `The product handoff has not been requested. The clue is inside ${productLabel(view)}; request it, then show the reference to staff.`;
    } else if (view.optional.claim?.status === "requested") {
      missing = `The missing piece is the handoff itself. Show reference ${view.optional.claim.reference} to staff; they release the clue once.`;
    } else if (view.optional.clue && !view.optional.final.solved) {
      missing = `We have the product clue and the final question: “${view.optional.final.question}” What we are missing is the operation that connects them, not another object.`;
    }
    return { reply: missing, mode: "scripted" };
  }

  if (asked(["changed after", "after the handoff", "what changed", "since the handoff"])) {
    if (view.optional.clue) {
      return {
        reply: `What changed is that the product clue is now in your hands: “${view.optional.clue.text}” It is an instruction that turns the earlier evidence into the final answer.${milestoneSentence(view) ? ` ${milestoneSentence(view)}` : ""}`,
        mode: "scripted",
      };
    }
    if (view.optional.claim) {
      return {
        reply: `The handoff has been requested under ${view.optional.claim.reference}, but the clue is still inside the product. Nothing in the evidence changes until staff release it.`,
        mode: "scripted",
      };
    }
    return {
      reply: "No product handoff has happened yet, so nothing about the clue has changed. The free trail and its fixed reward are already settled.",
      mode: "scripted",
    };
  }

  if (asked(["wrong", "mistaken", "sure"])) {
    return {
      reply: `Certainty is not evidence. Pick the clue you are leaning on most and ask what else it could mean. ${followUpFor(view)}`,
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
      // The campaign's final hint is shown to the player only after a wrong
      // final attempt, so the companion follows the same gate.
      if (view.optional.final.hint && view.optional.final.attempts > 0) {
        return {
          reply: `The counter's note for this step says: “${view.optional.final.hint}” Use that against the product clue.`,
          mode: "scripted",
        };
      }
      return {
        reply: `The product clue is the last instruction. Read it word by word and note what it asks you to do with things you already found earlier on this trail. Then try an answer to “${view.optional.final.question}” — a wrong attempt costs nothing and unlocks the counter's note.`,
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

  if (
    asked([
      "collective",
      "shared",
      "other investigator",
      "other player",
      "everyone",
      "community",
      "revisit",
      "earlier theor",
      "compare theor",
      "what do others",
    ])
  ) {
    return { reply: collectiveReply(view), mode: "scripted" };
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
        reply: `You already have the product clue: “${view.optional.clue.text}” Compare it with what the earlier clues established. It is telling you what to do with those, not another object to find.`,
        mode: "scripted",
      };
    }
    if (view.optional.claim?.status === "handed_off") {
      return {
        reply: `Staff have released the clue under reference ${view.optional.claim.reference}. Reload the trail to read it, and read every line including the small type.`,
        mode: "scripted",
      };
    }
    if (view.optional.claim) {
      return {
        reply: `Your reference is ${view.optional.claim.reference}. The clue stays inside ${productLabel(view)} until staff confirm the demo handoff at the counter. Nothing is charged in this prototype.`,
        mode: "scripted",
      };
    }
    return {
      reply: `${productLabel(view)} holds the last physical clue. Finish the optional deduction first, then request the product at the counter. The clue will not appear in the page before staff release it.`,
      mode: "scripted",
    };
  }

  if (asked(["final", "ending", "end"])) {
    return {
      reply: view.optional.final.solved
        ? "We reached it. Reload the trail to reread the ending; it is yours now."
        : view.optional.clue
          ? "The ending is unlocked only by the final answer, and the product clue is the last one. Re-read it against what the earlier clues already told you."
          : "The ending is still locked behind the product clue. We cannot reason our way past a physical object we have not seen yet.",
      mode: "scripted",
    };
  }

  if (asked(["magicblock", "blockchain", "chain", "on-chain", "er"])) {
    const ownMilestone =
      milestoneSentence(view) ||
      "The MagicBlock counter records the campaign completion and, later, the clue handoff. It does not contain our conversation or the answer. No clue handoff has been recorded for you yet.";
    // The campaign-wide gate is added only when this view was read from the ER,
    // so an older view keeps its original wording.
    return {
      reply: view.collective ? `${ownMilestone} ${collectiveSentence(view)}` : ownMilestone,
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
    return { ...scriptedReply(view, clean, history), model: null, note: null };
  }

  try {
    return await callProvider(context, view, clean);
  } catch (error) {
    const fallback = scriptedReply(view, clean, history);
    return {
      ...fallback,
      mode: "scripted_fallback",
      model: companionModelName(),
      note: `Live AI was unavailable (${(error as Error).message}). The scripted guide answered instead.`,
    };
  }
}

/**
 * Deterministic provider context, for tests and for recorded evidence. The
 * collective block contains the shared fragment only when the ER gate is
 * unlocked, so the same snapshot proves both the locked and unlocked cases
 * without needing a live model.
 */
export function companionContextSnapshot(
  view: QuestView,
  messages: CompanionMessage[] = [],
): CompanionContext {
  return buildContext(view, messages);
}

/**
 * Public scripted entry point. It avoids repeating the immediately previous
 * assistant turn verbatim; when the player circles a point, Mara asks a
 * concrete testing question instead of producing the same paragraph again.
 */
export function scriptedReply(
  view: QuestView,
  message: string,
  history: CompanionMessage[] = [],
): { reply: string; mode: "scripted" } {
  const result = scriptedReplyOnce(view, message);
  const previous = [...history].reverse().find((entry) => entry.role === "assistant");
  if (previous && previous.content.trim() === result.reply.trim()) {
    return {
      reply: `We have circled that already. ${followUpFor(view)}`,
      mode: "scripted",
    };
  }
  return result;
}

/**
 * Answer one player message and store both turns. The reply is generated from
 * the history as it was *before* this message, so the provider receives the
 * current message once; the user turn is stored first so history stays in order.
 */
export async function answerCompanionMessage(
  sessionId: string,
  view: QuestView,
  message: string,
): Promise<CompanionReply> {
  const clean = message.trim().slice(0, MAX_MESSAGE_CHARS);
  const result = await generateCompanionReply(view, clean);
  saveCompanionMessage(sessionId, "user", clean, "user");
  saveCompanionMessage(sessionId, "assistant", result.reply, result.mode);
  return result;
}
