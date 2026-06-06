export const MOODS = [
  { value: 5, emoji: "😀", label: "Great" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 3, emoji: "😐", label: "Neutral" },
  { value: 2, emoji: "😞", label: "Stressed" },
  { value: 1, emoji: "😭", label: "Burned Out" },
] as const;

export const COMMON_TRIGGERS = [
  { label: "Exams", category: "exams" },
  { label: "Family", category: "family" },
  { label: "Finances", category: "finances" },
  { label: "Relationships", category: "relationships" },
  { label: "Health", category: "health" },
  { label: "Sleep", category: "sleep" },
  { label: "Social Pressure", category: "social" },
] as const;

export function moodMeta(value: number) {
  return MOODS.find((m) => m.value === value) ?? MOODS[2];
}
