import {
  handle,
  json,
  requireUser,
  parseBody,
  enforceRateLimit,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildAnalytics } from "@/lib/analytics";
import { insightKindSchema } from "@/lib/validators";
import {
  wellnessSuggestions,
  burnoutCheck,
} from "@/services/ai/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/insights — most recent stored insights.
export const GET = handle(async () => {
  const user = await requireUser();
  const insights = await prisma.insight.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return json({ data: insights });
});

// POST /api/insights — generate a fresh AI insight (rate-limited, graceful).
export const POST = handle(async (req) => {
  const user = await requireUser();
  enforceRateLimit(user.id, "ai:insight", 10, 60_000);

  const { kind } = await parseBody(req, insightKindSchema);
  const { snapshot } = await buildAnalytics(user.id, 14);

  if (snapshot.entries === 0) {
    return json({
      data: {
        kind,
        title: "Start tracking to unlock insights",
        body:
          "Log your mood a few times this week and write a short journal " +
          "entry. Once there's some history, you'll get personalized AI " +
          "wellness guidance here.",
        severity: "info",
        model: null,
      },
      empty: true,
    });
  }

  let title: string;
  let body: string;
  let severity: "info" | "warning" | "critical" = "info";
  let model: string | null = null;

  if (kind === "burnout") {
    const r = await burnoutCheck(snapshot);
    title = "Burnout check";
    body = r.text;
    severity = r.severity;
    model = r.model;
  } else {
    const r = await wellnessSuggestions(snapshot);
    title =
      kind === "weekly" ? "Your weekly wellness summary" : "Wellness suggestions";
    body = r.text;
    model = r.model;
  }

  const insight = await prisma.insight.create({
    data: { userId: user.id, kind, title, body, severity, model },
  });

  return json({ data: insight }, { status: 201 });
});
