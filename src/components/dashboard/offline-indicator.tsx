"use client";

import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function OfflineIndicator({
  online,
  syncing,
  pendingCount,
}: {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
}) {
  const label = !online
    ? `Offline — ${pendingCount} queued`
    : syncing
      ? "Syncing…"
      : pendingCount > 0
        ? `${pendingCount} to sync`
        : "All synced";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs",
        !online && "text-warning",
        online && pendingCount === 0 && "text-positive",
      )}
    >
      {!online ? (
        <CloudOff className="size-3.5" aria-hidden />
      ) : syncing ? (
        <RefreshCw className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Cloud className="size-3.5" aria-hidden />
      )}
      {label}
    </span>
  );
}
