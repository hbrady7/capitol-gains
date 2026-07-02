/**
 * The LLM provider layer — one door for every brain call (decide, exits, briefing,
 * self-review). Default provider is the **free Google Gemini API** (AI Studio), so
 * the whole autonomous loop runs at $0. Claude stays available as an opt-in switch
 * for anyone who adds an ANTHROPIC_API_KEY, but nothing here requires it.
 *
 *   LLM_PROVIDER = "gemini" (default, free) | "anthropic"
 *   GEMINI_API_KEY            — free key from https://aistudio.google.com/apikey
 *   GEMINI_MODEL              — default "gemini-2.5-pro" (best free reasoning);
 *                               auto-falls back to "gemini-2.5-flash" on error/throttle
 *   ANTHROPIC_API_KEY         — only needed when LLM_PROVIDER=anthropic
 *
 * Both providers support extended THINKING and a strict JSON contract, so the
 * decision quality and the persisted reasoning trace are preserved either way.
 * Structured output is enforced provider-side (Gemini responseSchema / Anthropic
 * structured outputs); a defensive JSON extractor handles any stray code fences.
 *
 * PROMPT-INJECTION GUARD: callers fence all evidence as data; this layer only
 * transports the prompts — it never interprets fetched content as instructions.
 */

export type Provider = "gemini" | "anthropic";

export interface StructuredResult<T> {
  data: T;
  reasoning: string; // summarized thinking trace, if any
  model: string;
}

export interface TextResult {
  text: string;
  model: string;
}

/** A plain JSON-schema object (the `schema` inner object, not the Anthropic wrapper). */
export type JsonSchema = Record<string, unknown>;

const ANTHROPIC_MODEL = "claude-opus-4-8";

export function activeProvider(): Provider {
  return process.env.LLM_PROVIDER === "anthropic" ? "anthropic" : "gemini";
}

/** Is the active provider's credential present? */
export function llmConfigured(): boolean {
  return activeProvider() === "anthropic"
    ? !!process.env.ANTHROPIC_API_KEY
    : !!process.env.GEMINI_API_KEY;
}

/** Human-readable hint for the missing credential (used in error messages). */
export function llmKeyHint(): string {
  return activeProvider() === "anthropic"
    ? "ANTHROPIC_API_KEY is not set (LLM_PROVIDER=anthropic)."
    : "GEMINI_API_KEY is not set — get a FREE key at https://aistudio.google.com/apikey and set it (Actions secret + .env).";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Strict-JSON generation with thinking. Throws if the provider/credential fails. */
export async function generateStructured<T>(opts: {
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens?: number;
}): Promise<StructuredResult<T>> {
  if (activeProvider() === "anthropic") return anthropicStructured<T>(opts);
  return geminiStructured<T>(opts);
}

/** Free-form text generation (e.g. the morning briefing). Throws on failure. */
export async function generateText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<TextResult> {
  if (activeProvider() === "anthropic") return anthropicText(opts);
  return geminiText(opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini (free) — REST, no SDK dependency
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Model fallback chain: configured/best first, then the reliably-free Flash tier. */
function geminiModels(): string[] {
  const primary = process.env.GEMINI_MODEL || "gemini-2.5-pro";
  const chain = [primary, "gemini-2.5-flash", "gemini-2.0-flash"];
  return [...new Set(chain)];
}

async function geminiStructured<T>(opts: {
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens?: number;
}): Promise<StructuredResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error(llmKeyHint());
  const responseSchema = toGeminiSchema(opts.schema);
  const { text, reasoning, model } = await geminiCall({
    key,
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens ?? 8192,
    generationExtra: { responseMimeType: "application/json", responseSchema },
  });
  const data = extractJson<T>(text);
  return { data, reasoning, model };
}

async function geminiText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<TextResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error(llmKeyHint());
  const { text, model } = await geminiCall({
    key,
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens ?? 2048,
    includeThoughts: false,
  });
  return { text: text.trim(), model };
}

async function geminiCall(args: {
  key: string;
  system: string;
  user: string;
  maxTokens: number;
  includeThoughts?: boolean;
  generationExtra?: Record<string, unknown>;
}): Promise<{ text: string; reasoning: string; model: string }> {
  const includeThoughts = args.includeThoughts ?? true;
  const errors: string[] = [];
  for (const model of geminiModels()) {
    try {
      const body = {
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        generationConfig: {
          maxOutputTokens: args.maxTokens,
          temperature: 0.4,
          thinkingConfig: { includeThoughts },
          ...(args.generationExtra ?? {}),
        },
      };
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${args.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const json = (await res.json()) as GeminiResponse;
      const cand = json.candidates?.[0];
      const parts = cand?.content?.parts ?? [];
      let text = "";
      let reasoning = "";
      for (const p of parts) {
        if (!p.text) continue;
        if (p.thought) reasoning += p.text;
        else text += p.text;
      }
      if (!text.trim()) {
        errors.push(`${model}: empty response (finishReason=${cand?.finishReason ?? "?"})`);
        continue;
      }
      return { text, reasoning: reasoning.trim(), model };
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Gemini call failed on all models — ${errors.join(" | ")}`);
}

interface GeminiResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
}

/** Convert a plain JSON schema (Anthropic-style) to Gemini's responseSchema subset:
 *  uppercase types, drop `additionalProperties`, add deterministic propertyOrdering. */
export function toGeminiSchema(s: unknown): Record<string, unknown> {
  if (!s || typeof s !== "object") return {} as Record<string, unknown>;
  const src = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof src.type === "string") out.type = src.type.toUpperCase();
  if (typeof src.description === "string") out.description = src.description;
  if (Array.isArray(src.enum)) out.enum = src.enum;
  if (src.properties && typeof src.properties === "object") {
    const props: Record<string, unknown> = {};
    const order: string[] = [];
    for (const [k, v] of Object.entries(src.properties as Record<string, unknown>)) {
      props[k] = toGeminiSchema(v);
      order.push(k);
    }
    out.properties = props;
    out.propertyOrdering = order;
  }
  if (Array.isArray(src.required)) out.required = src.required;
  if (src.items) out.items = toGeminiSchema(src.items);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic (opt-in) — Claude Opus 4.8 + adaptive thinking + structured outputs
// ─────────────────────────────────────────────────────────────────────────────

async function anthropicStructured<T>(opts: {
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens?: number;
}): Promise<StructuredResult<T>> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(llmKeyHint());
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 32000,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "high", format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const message = await stream.finalMessage();
  let jsonText = "";
  const thinking: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") jsonText += block.text;
    else if (block.type === "thinking") thinking.push(block.thinking);
  }
  return {
    data: extractJson<T>(jsonText),
    reasoning: thinking.join("\n").trim(),
    model: message.model || ANTHROPIC_MODEL,
  };
}

async function anthropicText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<TextResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(llmKeyHint());
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 1500,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  return { text: text.trim(), model: msg.model || ANTHROPIC_MODEL };
}

// ─────────────────────────────────────────────────────────────────────────────
// shared
// ─────────────────────────────────────────────────────────────────────────────

/** Parse JSON, tolerating ```json fences or leading/trailing prose. */
export function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Last resort: grab the outermost {...} span.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new Error(`model did not return valid JSON. Raw: ${text.slice(0, 400)}`);
  }
}
