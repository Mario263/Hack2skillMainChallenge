import { z } from "zod";

// Shared trigger taxonomy. "custom" allows any user-provided label.
export const TRIGGER_CATEGORIES = [
  "exams",
  "family",
  "finances",
  "relationships",
  "health",
  "sleep",
  "social",
  "custom",
] as const;

export const moodCreateSchema = z.object({
  mood: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(10),
  note: z.string().max(2000).optional().nullable(),
  // Triggers attached at log time.
  triggers: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        category: z.enum(TRIGGER_CATEGORIES).default("custom"),
      }),
    )
    .max(10)
    .optional()
    .default([]),
  // Stable client id for offline de-duplication.
  clientId: z.string().min(1).max(64).optional(),
  // Optional client timestamp (offline logs created earlier).
  createdAt: z.coerce.date().optional(),
});

export type MoodCreateInput = z.infer<typeof moodCreateSchema>;

export const triggerCreateSchema = z.object({
  label: z.string().min(1).max(60),
  category: z.enum(TRIGGER_CATEGORIES).default("custom"),
});

export const journalCreateSchema = z.object({
  title: z.string().max(140).optional().nullable(),
  content: z.string().min(1, "Journal entry cannot be empty").max(20000),
  clientId: z.string().min(1).max(64).optional(),
  createdAt: z.coerce.date().optional(),
});

export type JournalCreateInput = z.infer<typeof journalCreateSchema>;

export const journalUpdateSchema = z.object({
  title: z.string().max(140).optional().nullable(),
  content: z.string().min(1).max(20000),
});

export const insightKindSchema = z.object({
  kind: z
    .enum(["summary", "burnout", "weekly", "recommendation"])
    .default("summary"),
});
