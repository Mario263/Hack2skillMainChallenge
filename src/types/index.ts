export interface TriggerDTO {
  id: string;
  label: string;
  category: string;
  createdAt: string;
}

export interface MoodLogDTO {
  id: string;
  mood: number;
  stress: number;
  note: string | null;
  clientId: string | null;
  createdAt: string;
  triggers: TriggerDTO[];
}

export interface JournalDTO {
  id: string;
  title: string | null;
  content: string;
  sentiment: string | null;
  score: number | null;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsightDTO {
  id: string;
  kind: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  model: string | null;
  createdAt: string;
}

export interface MoodTrendPoint {
  date: string;
  mood: number | null;
  stress: number | null;
}

export interface AnalyticsDTO {
  range: number;
  totalLogs: number;
  totalJournals: number;
  wellnessScore: number;
  moodTrend: MoodTrendPoint[];
  triggerFrequency: { label: string; count: number }[];
  journalConsistency: { date: string; count: number }[];
}

/** A locally-queued submission awaiting sync. */
export interface PendingItem {
  clientId: string;
  type: "mood" | "journal";
  payload: Record<string, unknown>;
  createdAt: string;
}
