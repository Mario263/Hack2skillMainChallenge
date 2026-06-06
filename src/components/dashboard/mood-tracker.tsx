"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MOODS, COMMON_TRIGGERS, moodMeta } from "@/lib/constants";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MoodLogDTO } from "@/types";

interface Props {
  refreshKey: number;
  submit: (type: "mood", payload: Record<string, unknown>) => string;
}

export function MoodTracker({ refreshKey, submit }: Props) {
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState(5);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState("");
  const [recent, setRecent] = useState<MoodLogDTO[]>([]);

  useEffect(() => {
    let active = true;
    apiFetch<{ data: MoodLogDTO[] }>("/api/mood?limit=5")
      .then((r) => active && setRecent(r.data))
      .catch(() => void 0);
    return () => {
      active = false;
    };
  }, [refreshKey]);

  function toggleTrigger(label: string, category: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[label]) delete next[label];
      else next[label] = category;
      return next;
    });
  }

  function addCustom() {
    const label = custom.trim();
    if (!label) return;
    setSelected((prev) => ({ ...prev, [label]: "custom" }));
    setCustom("");
  }

  function handleSubmit() {
    if (mood === null) {
      toast.error("Pick how you're feeling first");
      return;
    }
    const triggers = Object.entries(selected).map(([label, category]) => ({
      label,
      category,
    }));
    submit("mood", { mood, stress, note: note || null, triggers });
    toast.success("Mood logged 💜", {
      description: "Saved locally and syncing.",
    });
    setMood(null);
    setStress(5);
    setNote("");
    setSelected({});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>How are you feeling?</CardTitle>
        <CardDescription>Takes 10 seconds. Be honest with yourself.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Mood">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mood === m.value}
              aria-label={m.label}
              onClick={() => setMood(m.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[--radius-md] border p-2 transition-colors",
                mood === m.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="text-2xl" aria-hidden>
                {m.emoji}
              </span>
              <span className="text-[11px] text-muted-foreground">{m.label}</span>
            </button>
          ))}
        </div>

        <div>
          <label
            htmlFor="stress"
            className="flex justify-between text-sm font-medium"
          >
            <span>Stress level</span>
            <span className="text-muted-foreground">{stress}/10</span>
          </label>
          <input
            id="stress"
            type="range"
            min={1}
            max={10}
            value={stress}
            onChange={(e) => setStress(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">What&apos;s weighing on you?</p>
          <div className="flex flex-wrap gap-2">
            {COMMON_TRIGGERS.map((t) => (
              <button
                key={t.label}
                type="button"
                aria-pressed={!!selected[t.label]}
                onClick={() => toggleTrigger(t.label, t.category)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  selected[t.label]
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
              placeholder="Add a custom trigger"
              aria-label="Custom trigger"
              className="h-9 flex-1 rounded-[--radius-md] border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="button" size="sm" variant="outline" onClick={addCustom}>
              Add
            </Button>
          </div>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note — what happened today?"
          rows={2}
          aria-label="Mood note"
          className="w-full resize-none rounded-[--radius-md] border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <Button onClick={handleSubmit} className="w-full">
          Log my mood
        </Button>

        {recent.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Recent
            </p>
            <ul className="space-y-1.5">
              {recent.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{moodMeta(log.mood).emoji}</span>
                    <span className="text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    stress {log.stress}/10
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
