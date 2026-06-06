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

const SYSTEM_PROMPT = `You are an experienced Student Wellness & Performance Coach with 30+ years of experience helping students navigate high-pressure academic environments including NEET, JEE, UPSC, CAT, GATE, CUET, board examinations, university entrance exams, and competitive academic programs.

Your role is NOT to act as a therapist, psychiatrist, doctor, or crisis counselor. You provide emotional support, stress-management guidance, study-life balance coaching, habit-building strategies, and practical coping techniques.

CORE IDENTITY
You are: warm and empathetic, calm and reassuring, practical and action-oriented, non-judgmental, evidence-informed, student-centric.
You are NOT: a diagnostician, a medical professional, a therapist, or a crisis intervention specialist.

COMMUNICATION STYLE
1. Validate before solving — acknowledge the student's emotional experience before offering solutions ("It makes sense that you're feeling overwhelmed"). Avoid "Don't worry", "Just stay positive", "Everything will be fine".
2. Avoid toxic positivity — never dismiss emotions or pressure students to "push harder". Focus on effort, process, and recovery; normalize setbacks; encourage self-compassion.
3. Keep responses manageable — prioritize ONE insight, ONE practical action, ONE encouragement. No lengthy lectures.
4. Encourage sustainable performance — sleep, recovery, hydration, nutrition, movement, consistency. "Rest is part of preparation, not the opposite of it."
5. Separate worth from performance — exam scores do not define personal value; one bad test does not predict the final outcome; progress is rarely linear; mistakes are information, not identity.

COACHING FRAMEWORK (apply silently, do not label the steps)
STEP 1: Identify the emotional state (calm, motivated, frustrated, anxious, overwhelmed, burned out, discouraged, procrastinating, fearful, self-critical).
STEP 2: Validate the emotion.
STEP 3: Choose the single most helpful intervention (grounding, breathing, task breakdown, reframing, recovery, time management, sleep recovery, confidence rebuilding, self-compassion).
STEP 4: Give one small, achievable next step.

PRIORITY HIERARCHY (always, in order): 1) Safety  2) Emotional regulation  3) Physical well-being  4) Study effectiveness  5) Productivity. Never prioritize productivity over well-being.

SAFETY RULES
If a student expresses self-harm or suicidal thoughts, a desire to disappear, extreme hopelessness, or severe distress: STOP giving study advice, acknowledge their pain, and encourage them to contact a trusted family member, friend, teacher, counselor, mental health professional, or emergency services. Emphasize they do not have to handle this alone. Never provide diagnoses, clinical interpretations, or treatment recommendations.

PERSONALIZATION
Use the available mood history, stress trend, triggers, sleep, energy, and recent notes. Reference them naturally ("I've noticed test scores seem to be a recurring source of stress for you") — never robotically ("According to your data...").

OUTPUT REQUIREMENTS
Every response should contain: (1) validation, (2) a brief observation grounded in their data, (3) one actionable next step, (4) gentle encouragement. Keep responses under 160 words. The student should leave feeling seen, understood, less overwhelmed, and more capable of the next step.`;

/** Coaching pathways selected from the student's current signals. */
export enum WellnessState {
  CRISIS = "crisis",
  BURNOUT = "burnout",
  HIGH_STRESS = "high_stress",
  LOW_MOOD = "low_mood",
  PROCRASTINATION = "procrastination",
  FATIGUE = "fatigue",
  MAINTENANCE = "maintenance",
  THRIVING = "thriving",
}

export interface WellnessSnapshot {
  avgMood: number; // 1..5
  avgStress: number; // 1..10
  sleepHours?: number;
  sleepQuality?: "Poor" | "Average" | "Good";
  energyLevel?: number; // 1..10
  focusLevel?: number; // 1..10
  confidenceLevel?: number; // 1..10
  burnoutRisk?: "Low" | "Moderate" | "High";
  somaticSymptoms?: string[];
  topTriggers: string[];
  recentWins?: string[];
  recentChallenges?: string[];
  studyHours?: number;
  entries: number;
  recentNotes: string[];
  crisisFlag: boolean;
  streakDays?: number;
}

// Backwards-compatible alias (older imports referenced `MoodSnapshot`).
export type MoodSnapshot = WellnessSnapshot;

// Words/phrases that warrant a safety-first response. Conservative on purpose.
const CRISIS_TERMS = [
  "suicide", "suicidal", "kill myself", "end my life", "end it all",
  "want to die", "wanna die", "don't want to live", "do not want to live",
  "self harm", "self-harm", "harm myself", "hurt myself", "cutting myself",
  "disappear forever", "no reason to live", "better off dead", "can't go on",
  "cant go on", "give up on life",
];

/** Detect crisis language in free-text notes (used to set snapshot.crisisFlag). */
export function detectCrisisLanguage(texts: string[]): boolean {
  const haystack = texts.join(" \n ").toLowerCase();
  return CRISIS_TERMS.some((term) => haystack.includes(term));
}

/** Safety-first message shown whenever a crisis signal is present. */
export const CRISIS_RESPONSE =
  "It sounds like you're carrying a tremendous amount right now, and I'm really " +
  "glad you put it into words. You don't have to manage this alone. For now, " +
  "please step away from studying and reach out to someone you trust — a family " +
  "member, friend, mentor, counselor, or a mental health professional. Your " +
  "well-being matters far more than any exam, and one conversation can make a " +
  "real difference. If you ever feel unsafe, please contact local emergency " +
  "services or a helpline right away. In India you can call Tele-MANAS at 14416.";

/** Classify the student's current state from the available signals. */
export function classifyWellnessState(s: WellnessSnapshot): WellnessState {
  if (s.crisisFlag) return WellnessState.CRISIS;

  const lowEnergy = (s.energyLevel ?? 10) < 3;
  const poorSleep = s.sleepQuality === "Poor" || (s.sleepHours ?? 8) < 5;
  const manySymptoms = (s.somaticSymptoms?.length ?? 0) >= 2;

  if (
    s.burnoutRisk === "High" ||
    (s.avgStress >= 8 && s.avgMood <= 2) ||
    (s.avgStress >= 8 && (lowEnergy || poorSleep || manySymptoms))
  ) {
    return WellnessState.BURNOUT;
  }

  const triggers = s.topTriggers.map((t) => t.toLowerCase());
  const noteText = s.recentNotes.join(" ").toLowerCase();
  if (
    triggers.some((t) => /procrastinat|lack of progress|can't start|cant start|stuck/.test(t)) ||
    /procrastinat|can't start|cant start|keep avoiding/.test(noteText)
  ) {
    return WellnessState.PROCRASTINATION;
  }

  if (s.avgStress >= 7) return WellnessState.HIGH_STRESS;
  if (s.avgMood <= 2) return WellnessState.LOW_MOOD;
  if (lowEnergy || poorSleep) return WellnessState.FATIGUE;
  if (s.avgMood >= 4 && s.avgStress <= 4) return WellnessState.THRIVING;
  return WellnessState.MAINTENANCE;
}

/** Deterministic, safe guidance per state — used when AI is unavailable. */
export function stateGuidance(state: WellnessState): string {
  switch (state) {
    case WellnessState.CRISIS:
      return CRISIS_RESPONSE;
    case WellnessState.BURNOUT:
      return (
        "Your mind and body appear to be asking for recovery, not more effort — " +
        "and that's not weakness, it usually means you've been carrying pressure " +
        "for a long time. Today's goal isn't to study harder. Take a real " +
        "30-minute recovery break: hydrate, eat something nourishing, move your " +
        "body, and step outside if you can. Recovery improves learning far more " +
        "than forcing another exhausted session."
      );
    case WellnessState.HIGH_STRESS:
      return (
        "It sounds like your mind is racing ahead to outcomes you can't control " +
        "yet. Let's bring it back to today. Try this: take three slow breaths " +
        "(in for 4, out for 6), write down your single biggest worry, then ask " +
        "'What's one thing I can do about it in the next 20 minutes?' Focus on " +
        "the next step, not the whole journey."
      );
    case WellnessState.LOW_MOOD:
      return (
        "A low, heavy day doesn't mean you're failing — it means you're human, " +
        "and feelings pass. Be as kind to yourself as you'd be to a friend. You " +
        "don't have to fix everything today; pick one gentle, doable thing " +
        "(a short walk, one easy revision page, a glass of water) and let that " +
        "be enough. Showing up at all, on a hard day, counts."
      );
    case WellnessState.PROCRASTINATION:
      return (
        "You don't need motivation to start — motivation usually shows up after " +
        "you begin, not before. Shrink the task until it feels almost too easy: " +
        "instead of 'finish the chapter,' try 'read one page.' Set a timer for " +
        "10 minutes and only focus on starting. Momentum will do the rest."
      );
    case WellnessState.FATIGUE:
      return (
        "Your energy is running low, and pushing through a depleted body rarely " +
        "pays off. Treat rest as part of the plan: a glass of water, a 20-minute " +
        "break away from screens, and a realistic sleep window tonight. A rested " +
        "hour of study beats three tired ones — protect your recovery first."
      );
    case WellnessState.THRIVING:
      return (
        "You're in a good rhythm right now — steady mood and manageable stress. " +
        "That's worth noticing and protecting. Keep the basics that got you here " +
        "(sleep, breaks, consistency), and maybe channel a little of this energy " +
        "into one slightly harder topic while you feel capable. Nicely done."
      );
    case WellnessState.MAINTENANCE:
    default:
      return (
        "Here's a grounded reset: take three slow breaths (in for 4, out for 6), " +
        "drink a glass of water, choose one priority task, work for 25 focused " +
        "minutes, then take a genuine 5-minute break away from screens. " +
        "Preparation isn't only studying — sleep, recovery, movement, and " +
        "consistency are part of learning. Focus on the next step, not the whole mountain."
      );
  }
}

/** Build the data context block passed to the model, using only known fields. */
function snapshotContext(s: WellnessSnapshot): string {
  const lines = [
    `- Average mood: ${s.avgMood.toFixed(1)}/5`,
    `- Average stress: ${s.avgStress.toFixed(1)}/10`,
    `- Logs in window: ${s.entries}`,
    `- Common triggers: ${s.topTriggers.join(", ") || "none logged"}`,
  ];
  if (s.burnoutRisk) lines.push(`- Burnout risk: ${s.burnoutRisk}`);
  if (s.streakDays != null) lines.push(`- Logging streak: ${s.streakDays} days`);
  if (s.sleepHours != null) lines.push(`- Sleep: ${s.sleepHours}h${s.sleepQuality ? ` (${s.sleepQuality})` : ""}`);
  if (s.energyLevel != null) lines.push(`- Energy: ${s.energyLevel}/10`);
  if (s.focusLevel != null) lines.push(`- Focus: ${s.focusLevel}/10`);
  if (s.confidenceLevel != null) lines.push(`- Confidence: ${s.confidenceLevel}/10`);
  if (s.recentWins?.length) lines.push(`- Recent wins: ${s.recentWins.slice(0, 3).join("; ")}`);
  if (s.recentChallenges?.length) lines.push(`- Recent challenges: ${s.recentChallenges.slice(0, 3).join("; ")}`);
  if (s.recentNotes.length) lines.push(`- Recent notes: ${s.recentNotes.slice(0, 3).join(" | ")}`);
  return lines.join("\n");
}

/**
 * Personalized coaching from a wellness snapshot. Always safety-first: a crisis
 * signal short-circuits to the deterministic safety response without calling AI.
 */
export async function wellnessSuggestions(
  snapshot: WellnessSnapshot,
): Promise<AiResult> {
  const state = classifyWellnessState(snapshot);

  if (state === WellnessState.CRISIS) {
    return { text: CRISIS_RESPONSE, model: null, degraded: false };
  }

  const result = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Here's where I'm at:\n${snapshotContext(snapshot)}\n\n` +
        `You've sensed my current state is "${state}". Coach me through it: ` +
        `validate how I'm feeling, share one observation from the data above, ` +
        `give me one small next step I can do today, and end with a brief, ` +
        `genuine encouragement.`,
    },
  ]);

  if (result.degraded) return { ...result, text: stateGuidance(state) };
  return result;
}

/** Burnout signal combining the snapshot's risk band with an AI explanation. */
export async function burnoutCheck(
  snapshot: WellnessSnapshot,
): Promise<AiResult & { severity: "info" | "warning" | "critical" }> {
  if (snapshot.crisisFlag) {
    return { text: CRISIS_RESPONSE, model: null, degraded: false, severity: "critical" };
  }

  // Prefer an explicit risk band when present, else derive from mood/stress.
  const severity: "info" | "warning" | "critical" =
    snapshot.burnoutRisk === "High" || snapshot.avgStress >= 8 || snapshot.avgMood <= 2
      ? "critical"
      : snapshot.burnoutRisk === "Moderate" || snapshot.avgStress >= 6 || snapshot.avgMood <= 3
        ? "warning"
        : "info";

  const result = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Using this snapshot, gently tell me whether I'm showing burnout signs ` +
        `and give me one protective step for today. Be honest but kind.\n\n` +
        snapshotContext(snapshot),
    },
  ]);

  if (result.degraded) {
    const fallback =
      severity === "critical"
        ? stateGuidance(WellnessState.BURNOUT)
        : severity === "warning"
          ? "Stress is trending up. Build in short, regular breaks and guard your sleep this week before it compounds — recovery now prevents burnout later."
          : "No strong burnout signals right now. Keep your steady rhythm of focused study and real breaks, and protect your sleep.";
    return { ...result, text: fallback, severity };
  }
  return { ...result, severity };
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
