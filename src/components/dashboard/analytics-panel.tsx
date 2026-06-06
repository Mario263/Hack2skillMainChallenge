"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnalyticsDTO } from "@/types";

function fmtDay(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[--radius-md] bg-muted p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function AnalyticsPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<AnalyticsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ data: AnalyticsDTO }>("/api/analytics?range=30")
      .then((r) => {
        if (active) setData(r.data);
      })
      .catch(() => void 0)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 animate-pulse rounded-[--radius-md] bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalLogs === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your trends</CardTitle>
          <CardDescription>
            Log your mood a few times to unlock charts and your wellness score.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const trend = data.moodTrend.filter((p) => p.mood !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your trends</CardTitle>
        <CardDescription>Last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Wellness score" value={data.wellnessScore} />
          <Stat label="Mood logs" value={data.totalLogs} />
          <Stat label="Journal entries" value={data.totalJournals} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Mood & stress trend</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend} margin={{ left: -20, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                fontSize={11}
                stroke="var(--muted-foreground)"
                minTickGap={24}
              />
              <YAxis fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip
                labelFormatter={(label) => fmtDay(String(label))}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="mood"
                name="Mood (1-5)"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="stress"
                name="Stress (1-10)"
                stroke="var(--warning)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {data.triggerFrequency.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Top triggers</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={data.triggerFrequency}
                margin={{ left: -20, right: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
