import { prisma } from "@/lib/prisma";
import { detectCrisisLanguage, type MoodSnapshot } from "@/services/ai/openrouter";

const DAY = 24 * 60 * 60 * 1000;

export interface MoodTrendPoint {
  date: string; // yyyy-mm-dd
  mood: number | null;
  stress: number | null;
}

export interface AnalyticsPayload {
  range: number;
  totalLogs: number;
  totalJournals: number;
  wellnessScore: number; // 0..100
  moodTrend: MoodTrendPoint[];
  triggerFrequency: { label: string; count: number }[];
  journalConsistency: { date: string; count: number }[];
  snapshot: MoodSnapshot;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the full analytics payload for a user over the last `rangeDays`.
 * Pure aggregation in JS keeps it portable across pooled connections.
 */
export async function buildAnalytics(
  userId: string,
  rangeDays = 30,
): Promise<AnalyticsPayload> {
  const since = new Date(Date.now() - rangeDays * DAY);

  const [moods, journals, triggers] = await Promise.all([
    prisma.moodLog.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { mood: true, stress: true, note: true, createdAt: true },
    }),
    prisma.journalEntry.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, sentiment: true },
    }),
    prisma.trigger.groupBy({
      by: ["label"],
      where: { userId, createdAt: { gte: since } },
      _count: { label: true },
      orderBy: { _count: { label: "desc" } },
      take: 8,
    }),
  ]);

  // Daily buckets for mood/stress.
  const moodByDay = new Map<string, { mood: number[]; stress: number[] }>();
  for (const m of moods) {
    const key = dayKey(m.createdAt);
    const bucket = moodByDay.get(key) ?? { mood: [], stress: [] };
    bucket.mood.push(m.mood);
    bucket.stress.push(m.stress);
    moodByDay.set(key, bucket);
  }

  const moodTrend: MoodTrendPoint[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const key = dayKey(d);
    const bucket = moodByDay.get(key);
    moodTrend.push({
      date: key,
      mood: bucket ? avg(bucket.mood) : null,
      stress: bucket ? avg(bucket.stress) : null,
    });
  }

  // Journal consistency per day.
  const journalByDay = new Map<string, number>();
  for (const j of journals) {
    const key = dayKey(j.createdAt);
    journalByDay.set(key, (journalByDay.get(key) ?? 0) + 1);
  }
  const journalConsistency = moodTrend.map((p) => ({
    date: p.date,
    count: journalByDay.get(p.date) ?? 0,
  }));

  const avgMood = moods.length ? avg(moods.map((m) => m.mood)) : 0;
  const avgStress = moods.length ? avg(moods.map((m) => m.stress)) : 0;

  // Wellness score: mood contributes positively, stress negatively, plus a
  // small consistency bonus for journaling. Clamped 0..100.
  const moodComponent = (avgMood / 5) * 60; // up to 60
  const stressComponent = (1 - avgStress / 10) * 30; // up to 30
  const consistencyDays = journalByDay.size;
  const consistencyComponent = Math.min(consistencyDays, 10); // up to 10
  const wellnessScore = moods.length
    ? Math.round(
        Math.max(
          0,
          Math.min(100, moodComponent + stressComponent + consistencyComponent),
        ),
      )
    : 0;

  const recentNotes = moods
    .map((m) => m.note)
    .filter((n): n is string => !!n)
    .slice(-5);

  // Consecutive days (ending today) with at least one mood log.
  let streakDays = 0;
  for (let i = 0; i < rangeDays; i++) {
    const key = dayKey(new Date(Date.now() - i * DAY));
    if (moodByDay.has(key)) streakDays++;
    else break;
  }

  // Coarse burnout-risk band derived from sustained mood/stress signals.
  const burnoutRisk: "Low" | "Moderate" | "High" = moods.length
    ? avgStress >= 8 || avgMood <= 2
      ? "High"
      : avgStress >= 6 || avgMood <= 3
        ? "Moderate"
        : "Low"
    : "Low";

  const snapshot: MoodSnapshot = {
    avgMood,
    avgStress,
    entries: moods.length,
    topTriggers: triggers.map((t) => t.label),
    recentNotes,
    burnoutRisk,
    streakDays,
    // Safety signal scanned from free-text notes.
    crisisFlag: detectCrisisLanguage(recentNotes),
  };

  return {
    range: rangeDays,
    totalLogs: moods.length,
    totalJournals: journals.length,
    wellnessScore,
    moodTrend,
    triggerFrequency: triggers.map((t) => ({
      label: t.label,
      count: t._count.label,
    })),
    journalConsistency,
    snapshot,
  };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}
