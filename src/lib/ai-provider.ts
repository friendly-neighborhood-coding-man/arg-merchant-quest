/**
 * Minimal client for the chat-completions endpoint shared by the investigation
 * companion and the merchant story lab.
 *
 * The default provider is the official Claude API. Anthropic publishes an
 * OpenAI-compatible layer at `POST https://api.anthropic.com/v1/chat/completions`,
 * so one client reaches Claude and any other OpenAI-compatible server named in
 * `ARG_AI_BASE_URL`.
 *
 * Two provider quirks are handled here instead of in each caller:
 *
 * - Claude 4.7 and later (including `claude-opus-5-5`) return HTTP 400 for any
 *   `temperature` or `top_p` below 1. They are removed before the request is
 *   sent for a model known to reject them; the retry below is the safety net for
 *   a model this list does not know yet.
 * - Newer models renamed `max_tokens` to `max_completion_tokens`. A 400 that
 *   names either field is retried once with only that field changed.
 *
 * Anything else is a real failure and reaches the labelled fallback in the
 * caller. The API key stays in the server process; it is never logged, returned
 * or written to a request record.
 */

export const DEFAULT_AI_BASE_URL = "https://api.anthropic.com/v1";
export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const MAX_ADJUSTMENTS = 2;

export function aiBaseUrl(): string {
  return (process.env.ARG_AI_BASE_URL ?? DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
}

export function aiChatCompletionsUrl(base = aiBaseUrl()): string {
  return `${base}/chat/completions`;
}

export function aiTimeoutMessage(timeoutMs: number): string {
  return `AI provider timed out after ${Math.round(timeoutMs / 1000)} seconds.`;
}

export function isAnthropicBase(base: string): boolean {
  try {
    const host = new URL(base).hostname.toLowerCase();
    return host === "api.anthropic.com" || host.endsWith(".anthropic.com");
  } catch {
    return false;
  }
}

/**
 * Claude 4.7 and later, and the Mythos models, reject any temperature below 1
 * with a 400. Older ids such as `claude-opus-4-5-20251101` still accept it, so
 * the decision is made from the model id rather than from the provider alone.
 */
export function rejectsTemperature(model: string): boolean {
  const named = /^claude-(?:opus|sonnet|haiku|fable|mythos)-(\d+)(?:[.-](\d+))?/i.exec(model);
  if (!named) return /^claude-mythos/i.test(model);
  const major = Number(named[1]);
  const minor = Number(named[2] ?? 0);
  return major > 4 || (major === 4 && minor >= 7);
}

/**
 * Headers for one request. Anthropic takes the key as a bearer token and needs a
 * version header; a key that is not scoped to a single workspace also needs
 * `anthropic-workspace-id`. Other OpenAI-compatible servers get the bearer token
 * alone.
 */
export function providerHeaders(
  apiKey: string,
  base = aiBaseUrl(),
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (isAnthropicBase(base)) {
    headers["anthropic-version"] = env.ARG_AI_VERSION || DEFAULT_ANTHROPIC_VERSION;
    if (env.ARG_AI_WORKSPACE_ID) headers["anthropic-workspace-id"] = env.ARG_AI_WORKSPACE_ID;
  }
  return headers;
}

/** Drop the fields a known model rejects, before the first attempt is spent. */
export function preparePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  const model = typeof next.model === "string" ? next.model : "";
  if (rejectsTemperature(model)) {
    delete next.temperature;
    delete next.top_p;
  }
  return next;
}

export interface ChatCompletionRequest {
  apiKey: string;
  payload: Record<string, unknown>;
  timeoutMs: number;
  url?: string;
}

export interface ChatCompletionResult {
  response: Response;
  /** The payload actually accepted (or last sent), for evidence and tests. */
  payload: Record<string, unknown>;
  /** Number of HTTP attempts, including retries after a parameter rejection. */
  attempts: number;
}

/**
 * Retry once for each parameter the provider explicitly rejects. Returns false
 * when the error names nothing this client knows how to adjust.
 */
function adjustPayload(payload: Record<string, unknown>, detail: string): boolean {
  if (/max_tokens|max_completion_tokens/i.test(detail) && "max_tokens" in payload) {
    const limit = payload.max_tokens;
    delete payload.max_tokens;
    payload.max_completion_tokens = limit;
    return true;
  }
  if (/temperature/i.test(detail) && "temperature" in payload) {
    delete payload.temperature;
    return true;
  }
  return false;
}

export async function postChatCompletion(
  request: ChatCompletionRequest,
): Promise<ChatCompletionResult> {
  const base = aiBaseUrl();
  const url = request.url ?? aiChatCompletionsUrl(base);
  const payload = preparePayload(request.payload);
  const headers = providerHeaders(request.apiKey, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  const send = async (): Promise<Response> => {
    try {
      return await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(aiTimeoutMessage(request.timeoutMs));
      throw error;
    }
  };

  try {
    let attempts = 0;
    let response = await send();
    attempts += 1;
    for (let guard = 0; guard < MAX_ADJUSTMENTS && response.status === 400; guard += 1) {
      const detail = await response.text();
      if (!adjustPayload(payload, detail)) {
        // The body is already consumed; rebuild a response so the caller still
        // sees the original status instead of an empty one.
        return {
          response: new Response(detail, { status: 400, headers: { "content-type": "text/plain" } }),
          payload,
          attempts,
        };
      }
      response = await send();
      attempts += 1;
    }
    return { response, payload, attempts };
  } finally {
    clearTimeout(timer);
  }
}
