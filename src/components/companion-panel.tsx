"use client";

import { useEffect, useRef, useState } from "react";
import { MaraText } from "@/components/mara-text";

interface Message {
  role: "user" | "assistant";
  content: string;
  mode: string;
  createdAt?: string;
}

interface AiState {
  enabled: boolean;
  reason: string | null;
  priceLabel: string | null;
  balanceLabel: string | null;
  wallet: string | null;
  remainingToday: number | null;
  refundCredits: number;
  disclosure: string;
}

const STARTERS = [
  "What have we discovered?",
  "What is suspicious about the last clue?",
  "How might these clues connect?",
  "What should I inspect next?",
  "Can I have a small hint?",
  "I have no idea what to do.",
];

/**
 * P1 investigation companion. It is a buddy at the counter, not a support bot.
 * The server owns the context; this drawer only renders what it is given and
 * labels whether the reply came from live AI or the scripted guide.
 */
export function CompanionPanel({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "scripted" | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [ai, setAi] = useState<AiState | null>(null);
  const [quote, setQuote] = useState<{ intentId: string; priceLabel: string; payUri: string | null } | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);
  const [deepReceipt, setDeepReceipt] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  // P2: the shared-investigation panel can ask Mara to revisit an earlier theory.
  useEffect(() => {
    function handleAsk(event: Event) {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setOpen(true);
      if (message) void sendRef.current(message);
    }
    window.addEventListener("arg:ask-mara", handleAsk);
    return () => window.removeEventListener("arg:ask-mara", handleAsk);
  }, []);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch(`/api/quests/${slug}/companion`)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          messages?: Message[];
          mode?: string;
          model?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (data.messages) setMessages(data.messages);
        setMode(data.mode === "live" ? "live" : "scripted");
        setModel(data.model ?? null);
        if (data.error) setError(data.error);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load the conversation. The trail itself still works.");
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, slug]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/quests/${slug}/ai`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setAi(data as AiState);
      })
      .catch(() => {
        if (!cancelled) setAi(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, deepReceipt]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setInput("");
    setMessages((current) => [...current, { role: "user", content: message, mode: "user" }]);
    try {
      const response = await fetch(`/api/quests/${slug}/companion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        mode?: string;
        model?: string | null;
        note?: string | null;
        error?: string;
      };
      if (!response.ok || !data.reply) {
        setError(data.error ?? "The companion could not answer just now.");
      } else {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: data.reply as string,
            mode: data.mode ?? "scripted",
          },
        ]);
        setMode(data.mode === "live" ? "live" : "scripted");
        setModel(data.model ?? null);
        setNote(data.note ?? null);
      }
    } catch {
      setError("Network error — the companion did not answer. Try again in a moment.");
    }
    setBusy(false);
  }

  async function aiPost(payload: Record<string, unknown>) {
    const response = await fetch(`/api/quests/${slug}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  }

  async function refreshAi() {
    try {
      const response = await fetch(`/api/quests/${slug}/ai`);
      setAi((await response.json()) as AiState);
    } catch {
      // The panel simply keeps the previous balance.
    }
  }

  async function investigate(intentId: string) {
    const data = await aiPost({ action: "investigate", intentId });
    if (data.status !== "ok" || typeof data.reply !== "string") {
      setDeepError(String(data.reason ?? "The investigation could not run."));
      return;
    }
    const usage = (data.usage ?? {}) as { inputTokens?: number; outputTokens?: number };
    const receipt = (data.receipt ?? {}) as { amountLabel?: string; signature?: string };
    setMessages((current) => [
      ...current,
      { role: "assistant", content: data.reply as string, mode: "paid_ai" },
    ]);
    setDeepReceipt(
      `Deep investigation · paid ${receipt.amountLabel ?? ""} · ${String(data.model ?? "")} · ` +
        `${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out · ~$${Number(
          data.estimatedCostUsd ?? 0,
        ).toFixed(4)} API cost · tx ${receipt.signature ?? "credit"}${data.balanceAfter ? ` · balance ${data.balanceAfter}` : ""}`,
    );
    setQuote(null);
    void refreshAi();
  }

  async function quoteDeep() {
    if (input.trim().length < 3) {
      setDeepError("Write the question you want investigated first.");
      return;
    }
    setDeepBusy(true);
    setDeepError(null);
    setDeepReceipt(null);
    try {
      const data = await aiPost({ action: "quote", question: input });
      if (!data.ok) {
        setDeepError(String(data.reason ?? "A quote could not be issued."));
        return;
      }
      if (data.fundedByCredit) {
        await investigate(String(data.intentId));
        return;
      }
      setQuote({
        intentId: String(data.intentId),
        priceLabel: String(data.priceLabel ?? ""),
        payUri: typeof data.payUri === "string" ? data.payUri : null,
      });
    } catch {
      setDeepError("Could not reach the server to issue a quote.");
    } finally {
      setDeepBusy(false);
    }
  }

  async function verifyDeep() {
    if (!quote) return;
    setDeepBusy(true);
    setDeepError(null);
    try {
      const data = await aiPost({ action: "settle", intentId: quote.intentId });
      if (!data.ok) {
        setDeepError(String(data.reason ?? "The payment was not found yet."));
        return;
      }
      await investigate(quote.intentId);
    } catch {
      setDeepError("Could not reach the server to verify the payment.");
    } finally {
      setDeepBusy(false);
    }
  }

  sendRef.current = send;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-amber/45 bg-ink/95 px-4 py-3 text-[12.5px] font-semibold text-amber-soft shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur transition hover:border-amber/70 sm:right-6 sm:bottom-6"
        aria-expanded={open}
        aria-controls="companion-panel"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full border border-amber/40 bg-amber/10 text-[12px]">
          ✦
        </span>
        {open ? "Close companion" : "Ask Mara"}
      </button>

      {open ? (
        <div
          id="companion-panel"
          role="dialog"
          aria-label="Investigation companion"
          className="fixed inset-x-0 bottom-0 z-40 flex max-h-[78vh] flex-col border-t border-amber/30 bg-ink/97 shadow-[0_-16px_50px_rgba(0,0,0,0.55)] backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-20 sm:max-h-[70vh] sm:w-[390px] sm:rounded-2xl sm:border"
        >
          <div className="flex items-start justify-between gap-3 border-b border-line/60 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display text-lg leading-none text-white/95">Mara</p>
                <span
                  className={`chip ${
                    mode === "live"
                      ? "border-mint/40 bg-mint/10 text-mint"
                      : "border-amber/35 bg-amber/[0.08] text-amber-soft"
                  }`}
                >
                  {mode === "live" ? "Live AI" : "Scripted guide"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-sage/55">
                Fellow investigator · {title}
                {mode === "live" && model ? ` · ${model}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-line/70 px-2 py-1 text-[11px] text-sage/60 hover:text-white"
            >
              Close
            </button>
          </div>

          {mode === "scripted" ? (
            <p className="border-b border-line/50 bg-amber/[0.04] px-4 py-2 text-[10.5px] leading-relaxed text-amber/70">
              No AI key is configured on this server. Mara is a deterministic scripted guide, not
              live model output. Her replies still use your revealed clues.
            </p>
          ) : null}

          <div ref={listRef} className="min-h-[140px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !busy && !loaded && !error ? (
              <p className="text-[12.5px] leading-relaxed text-sage/55">Loading the conversation…</p>
            ) : null}
            {messages.length === 0 && !busy && loaded ? (
              <p className="text-[12.5px] leading-relaxed text-sage/70">
                I am Mara — another investigator, not the answer sheet. Ask me what we have found,
                what looks wrong, or what to inspect next. I will not hand you the ending.
              </p>
            ) : null}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[86%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed break-words ${
                    message.role === "user"
                      ? "border border-amber/25 bg-amber/[0.08] text-sage/90"
                      : "border border-line/70 bg-ink-soft/70 text-sage/80"
                  }`}
                >
                  <MaraText text={message.content} />
                  {message.role === "assistant" && message.mode === "scripted_fallback" ? (
                    <span className="mt-1 block text-[10px] text-amber/60">scripted fallback</span>
                  ) : null}
                  {message.role === "assistant" && message.mode === "paid_ai" ? (
                    <span className="mt-1 block text-[10px] text-mint/70">
                      deep investigation · token-funded
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-[12px] text-sage/55">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
                Mara is reading the trail…
              </div>
            ) : null}
          </div>

          {note ? (
            <p className="border-t border-amber/20 bg-amber/[0.05] px-4 py-2 text-[10.5px] leading-relaxed text-amber/70">
              {note}
            </p>
          ) : null}
          {error ? (
            <p className="border-t border-rust/25 bg-rust/[0.06] px-4 py-2 text-[11px] leading-relaxed text-rust/90">
              {error}
            </p>
          ) : null}

          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-1.5 border-t border-line/50 px-3 py-2">
              {STARTERS.slice(0, 4).map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void send(starter)}
                  className="rounded-full border border-line/70 px-2.5 py-1 text-[10.5px] text-sage/65 hover:border-amber/40 hover:text-amber-soft"
                >
                  {starter}
                </button>
              ))}
            </div>
          ) : null}

          {ai ? (
            <div className="border-t border-line/60 bg-mint/[0.04] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10.5px] font-semibold tracking-wide text-mint/80 uppercase">
                  Deep investigation
                </p>
                <span className="text-[10px] text-sage/50">{ai.priceLabel ?? "unavailable"}</span>
              </div>
              {ai.enabled ? (
                <>
                  <p className="mt-1 text-[10.5px] text-sage/60">
                    Balance {ai.balanceLabel ?? (ai.wallet ? "unreadable" : "— claim your reward first")} ·{" "}
                    {ai.remainingToday ?? 0} left today
                    {ai.refundCredits > 0 ? ` · ${ai.refundCredits} refund credit` : ""}
                  </p>
                  {quote ? (
                    <div className="mt-1.5 space-y-1">
                      {quote.payUri ? (
                        <a
                          className="block truncate rounded border border-mint/30 px-2 py-1 text-[10px] text-mint/80"
                          href={quote.payUri}
                        >
                          Open in wallet · {quote.priceLabel}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void verifyDeep()}
                        disabled={deepBusy}
                        className="rounded border border-mint/35 px-2 py-1 text-[10.5px] text-mint/85 disabled:opacity-50"
                      >
                        {deepBusy ? "Checking Devnet…" : "I paid — verify"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void quoteDeep()}
                      disabled={deepBusy}
                      className="mt-1.5 rounded border border-mint/35 px-2 py-1 text-[10.5px] text-mint/85 disabled:opacity-50"
                    >
                      {deepBusy ? "Quoting…" : `Quote deep investigation · ${ai.priceLabel}`}
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-1 text-[10.5px] text-sage/50">{ai.reason ?? "Unavailable."}</p>
              )}
              {deepReceipt ? (
                <p className="mt-1 text-[10px] leading-snug break-words text-mint/70">{deepReceipt}</p>
              ) : null}
              {deepError ? <p className="mt-1 text-[10px] text-amber/80">{deepError}</p> : null}
              <p className="mt-1 text-[9.5px] leading-snug text-sage/40">{ai.disclosure}</p>
            </div>
          ) : null}

          <form
            className="flex items-end gap-2 border-t border-line/60 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              className="input min-h-[38px] py-2 text-[12.5px]"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Mara about the trail…"
              aria-label="Question for the companion"
              maxLength={700}
            />
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              className="btn-primary shrink-0 px-3 py-2 text-[12px]"
            >
              Send
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
