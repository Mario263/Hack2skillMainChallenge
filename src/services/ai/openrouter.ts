import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// OpenRouter AI service layer.
//
// - Model fallback chain (primary -> fallback -> second fallback)
// - Per-request timeout via AbortController
// - Bounded retry with backoff for transient failures
// - Graceful degradation: if the key is missing or every model fails, callers
//   receive deterministic, safe wellness guidance instead of an error.
// ---------------------------------------------------------------------------

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Primary: NVIDIA Nemotron (free, reasoning-capable) on OpenRouter.
// Fallbacks remain for resilience — if the free model is rate-limited or the
// key can't reach them, the service still degrades gracefully.
const MODEL_CHAIN = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-4o-mini",
  "anthropic/claude-3-haiku",
];

// Enable model reasoning (chain-of-thought) on supported models.
const REASONING = { enabled: true } as const;

// Reasoning models can be slower and consume more output tokens, so allow a
// longer timeout and a larger completion budget than a plain chat model.
const TIMEOUT_MS = 45_000;
const MAX_TOKENS = 1500;
const MAX_RETRIES_PER_MODEL = 1;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiResult {
  text: string;
  model: string | null;
  degraded: boolean;
}

function isConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

async function callModel(
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      // Header values must be Latin-1 (ByteString) — keep this ASCII-only.
      "X-Title": "Mindful - Student Wellness Tracker",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: MAX_TOKENS,
      reasoning: REASONING,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${model} ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string; reasoning?: string };
    }[];
  };
  const message = data.choices?.[0]?.message;
  // Reasoning models return the chain-of-thought separately in `reasoning`;
  // we only use the final `content`. Fall back to reasoning text only if the
  // model returned no content at all.
  const content = (message?.content ?? message?.reasoning ?? "").trim();
  if (!content) throw new Error(`OpenRouter ${model}: empty response`);
  return content;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Core chat completion with the full fallback chain. Returns `degraded: true`
 * and an empty string if AI is unavailable — callers decide the fallback copy.
 */
export async function chat(messages: ChatMessage[]): Promise<AiResult> {
  if (!isConfigured()) {
    return { text: "", model: null, degraded: true };
  }

  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const text = await callModel(model, messages, controller.signal);
        clearTimeout(timer);
        return { text, model, degraded: false };
      } catch (e) {
        clearTimeout(timer);
        const message = e instanceof Error ? e.message : String(e);
        logger.warn("ai.model_failed", { model, attempt, message });
        // Backoff before retrying the same model.
        if (attempt < MAX_RETRIES_PER_MODEL) await sleep(400 * (attempt + 1));
      }
    }
  }

  logger.error("ai.all_models_failed", { models: MODEL_CHAIN });
  return { text: "", model: null, degraded: true };
}

// ---------------------------------------------------------------------------
// High-level capabilities
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are a warm, supportive wellness companion for students preparing for " +
  "high-pressure exams (NEET, JEE, UPSC, CAT, GATE, CUET, boards). Be concise, " +
  "practical, and non-clinical. Never diagnose. Encourage healthy habits, rest, " +
  "and seeking human/professional support when distress is high. Avoid toxic " +
  "positivity. Keep responses under 160 words.";

export interface MoodSnapshot {
  avgMood: number; // 1..5
  avgStress: number; // 1..10
  entries: number;
  topTriggers: string[];
  recentNotes: string[];
}

const DEFAULT_GUIDANCE =
  "Here's a grounded reset you can use right now: take three slow breaths " +
  "(in for 4, out for 6). Pick one small next task and give it 25 focused " +
  "minutes, then take a real 5-minute break away from screens. Drink water, " +
  "and aim for a consistent sleep window tonight — rest is part of studying. " +
  "If stress feels heavy or constant, talk to someone you trust or a counsellor.";

/** Personalized wellness suggestions from a mood snapshot. */
export async function wellnessSuggestions(
  snapshot: MoodSnapshot,
): Promise<AiResult> {
  const result = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `My recent wellness data:\n` +
        `- Average mood: ${snapshot.avgMood.toFixed(1)}/5\n` +
        `- Average stress: ${snapshot.avgStress.toFixed(1)}/10\n` +
        `- Logs: ${snapshot.entries}\n` +
        `- Common triggers: ${snapshot.topTriggers.join(", ") || "none logged"}\n` +
        `- Recent notes: ${snapshot.recentNotes.slice(0, 3).join(" | ") || "none"}\n\n` +
        `Give me 3 short, specific, doable wellness actions for today.`,
    },
  ]);
  if (result.degraded) return { ...result, text: DEFAULT_GUIDANCE };
  return result;
}

/** Heuristic + AI burnout signal. */
export async function burnoutCheck(
  snapshot: MoodSnapshot,
): Promise<AiResult & { severity: "info" | "warning" | "critical" }> {
  const heuristic =
    snapshot.avgStress >= 8 || snapshot.avgMood <= 2
      ? "critical"
      : snapshot.avgStress >= 6 || snapshot.avgMood <= 3
        ? "warning"
        : "info";

  const result = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Based on average mood ${snapshot.avgMood.toFixed(1)}/5 and average ` +
        `stress ${snapshot.avgStress.toFixed(1)}/10 over ${snapshot.entries} ` +
        `logs, briefly tell me whether I'm showing burnout signs and one ` +
        `protective step. Be honest but kind.`,
    },
  ]);

  if (result.degraded) {
    const fallback =
      heuristic === "critical"
        ? "Your recent stress is high and mood is low for a sustained period — these can be early burnout signals. Protect one full rest block today and reach out to someone you trust."
        : heuristic === "warning"
          ? "Stress is trending up. Build in short, regular breaks and guard your sleep this week before it compounds."
          : "No strong burnout signals right now. Keep your steady rhythm of focused study and real breaks.";
    return { ...result, text: fallback, severity: heuristic };
  }
  return { ...result, severity: heuristic };
}

/** Sentiment analysis for a journal entry, with a keyword fallback. */
export async function analyzeSentiment(content: string): Promise<{
  sentiment: "positive" | "neutral" | "negative";
  score: number;
  degraded: boolean;
}> {
  const result = await chat([
    {
      role: "system",
      content:
        "You are a sentiment classifier. Respond with ONLY compact JSON: " +
        '{"sentiment":"positive|neutral|negative","score":<-1..1>}. No prose.',
    },
    { role: "user", content: content.slice(0, 4000) },
  ]);

  if (!result.degraded) {
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          sentiment?: string;
          score?: number;
        };
        const sentiment =
          parsed.sentiment === "positive" ||
          parsed.sentiment === "negative" ||
          parsed.sentiment === "neutral"
            ? parsed.sentiment
            : "neutral";
        const score =
          typeof parsed.score === "number"
            ? Math.max(-1, Math.min(1, parsed.score))
            : 0;
        return { sentiment, score, degraded: false };
      }
    } catch {
      // fall through to heuristic
    }
  }

  return { ...keywordSentiment(content), degraded: true };
}

const NEGATIVE = [
  "stress", "anxious", "anxiety", "burnout", "tired", "exhausted", "fail",
  "failure", "scared", "afraid", "lonely", "hopeless", "cry", "panic",
  "overwhelmed", "pressure", "can't", "cannot", "hate", "worthless", "worthless",
];
const POSITIVE = [
  "happy", "calm", "confident", "good", "great", "proud", "hopeful", "relaxed",
  "progress", "win", "achieved", "grateful", "motivated", "focused", "better",
];

function keywordSentiment(text: string): {
  sentiment: "positive" | "neutral" | "negative";
  score: number;
} {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE) if (lower.includes(w)) score += 1;
  for (const w of NEGATIVE) if (lower.includes(w)) score -= 1;
  const normalized = Math.max(-1, Math.min(1, score / 4));
  const sentiment =
    normalized > 0.15 ? "positive" : normalized < -0.15 ? "negative" : "neutral";
  return { sentiment, score: Number(normalized.toFixed(2)) };
}

export const aiServiceStatus = {
  configured: isConfigured(),
  models: MODEL_CHAIN,
};
