"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineIndicator } from "@/components/dashboard/offline-indicator";
import { MoodTracker } from "@/components/dashboard/mood-tracker";
import { JournalPanel } from "@/components/dashboard/journal-panel";
import { InsightsPanel } from "@/components/dashboard/insights-panel";

// Recharts is heavy; load the analytics panel only on the client, after the
// rest of the dashboard is interactive, to keep the initial bundle small.
const AnalyticsPanel = dynamic(
  () =>
    import("@/components/dashboard/analytics-panel").then(
      (m) => m.AnalyticsPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-72 animate-pulse rounded-[--radius-lg] border border-border bg-card"
        aria-hidden
      />
    ),
  },
);

export function DashboardClient({ name }: { name: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);
  const { submit, online, syncing, pendingCount } = useOfflineSync(bump);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hi {name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Take a moment for yourself. How&apos;s today going?
          </p>
        </div>
        <OfflineIndicator
          online={online}
          syncing={syncing}
          pendingCount={pendingCount}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <MoodTracker refreshKey={refreshKey} submit={submit} />
          <InsightsPanel />
        </div>
        <div className="space-y-6">
          <AnalyticsPanel refreshKey={refreshKey} />
          <JournalPanel refreshKey={refreshKey} submit={submit} />
        </div>
      </div>
    </div>
  );
}
