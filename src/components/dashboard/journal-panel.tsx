"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import type { JournalDTO } from "@/types";

const DRAFT_KEY = "wellness-journal-draft";

interface Props {
  refreshKey: number;
  submit: (type: "journal", payload: Record<string, unknown>) => string;
}

const sentimentColor: Record<string, string> = {
  positive: "text-positive",
  negative: "text-critical",
  neutral: "text-muted-foreground",
};

export function JournalPanel({ refreshKey, submit }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [entries, setEntries] = useState<JournalDTO[]>([]);
  const [savedDraft, setSavedDraft] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore autosaved draft on mount.
  useEffect(() => {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw) as { title: string; content: string };
        setTitle(d.title ?? "");
        setContent(d.content ?? "");
      } catch {
        /* ignore corrupt draft */
      }
    }
  }, []);

  // Autosave the draft (debounced) so nothing is lost on refresh / tab close.
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!title && !content) return;
    draftTimer.current = setTimeout(() => {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content }));
      setSavedDraft(true);
      setTimeout(() => setSavedDraft(false), 1500);
    }, 800);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [title, content]);

  useEffect(() => {
    let active = true;
    apiFetch<{ data: JournalDTO[] }>("/api/journal?limit=10")
      .then((r) => active && setEntries(r.data))
      .catch(() => void 0);
    return () => {
      active = false;
    };
  }, [refreshKey]);

  function save() {
    if (!content.trim()) {
      toast.error("Write something first");
      return;
    }
    submit("journal", { title: title || null, content });
    toast.success("Journal saved 📓", { description: "Syncing your entry." });
    setTitle("");
    setContent("");
    window.localStorage.removeItem(DRAFT_KEY);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal</CardTitle>
        <CardDescription>
          A private space to process the pressure. Autosaves as you type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Journal title"
          className="h-10 w-full rounded-[--radius-md] border border-border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind today?"
          rows={6}
          aria-label="Journal entry"
          className="w-full resize-y rounded-[--radius-md] border border-border bg-background p-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {savedDraft ? "Draft saved" : `${content.length} characters`}
          </span>
          <Button size="sm" onClick={save}>
            Save entry
          </Button>
        </div>

        {entries.length > 0 && (
          <ul className="space-y-2 border-t border-border pt-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-[--radius-md] bg-muted p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {entry.title || "Untitled entry"}
                  </span>
                  {entry.sentiment && (
                    <span
                      className={cn(
                        "text-xs capitalize",
                        sentimentColor[entry.sentiment] ??
                          "text-muted-foreground",
                      )}
                    >
                      {entry.sentiment}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {entry.content}
                </p>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
