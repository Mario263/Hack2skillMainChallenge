import {
  handle,
  json,
  requireUser,
  parseBody,
  enforceRateLimit,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { moodCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mood — recent mood logs for the current user (with triggers).
export const GET = handle(async (req) => {
  const user = await requireUser();
  const limit = Math.min(
    Number(new URL(req.url).searchParams.get("limit") ?? 60),
    200,
  );

  const logs = await prisma.moodLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { triggers: true },
  });

  return json({ data: logs });
});

// POST /api/mood — create a mood log (+ optional triggers). Idempotent on clientId.
export const POST = handle(async (req) => {
  const user = await requireUser();
  enforceRateLimit(user.id, "mood:write", 60, 60_000);

  const input = await parseBody(req, moodCreateSchema);

  // Offline de-duplication: if this clientId already synced, return it.
  if (input.clientId) {
    const existing = await prisma.moodLog.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: input.clientId } },
      include: { triggers: true },
    });
    if (existing) return json({ data: existing, deduped: true }, { status: 200 });
  }

  const log = await prisma.moodLog.create({
    data: {
      userId: user.id,
      mood: input.mood,
      stress: input.stress,
      note: input.note ?? null,
      clientId: input.clientId,
      createdAt: input.createdAt ?? new Date(),
      triggers: {
        create: input.triggers.map((t) => ({
          userId: user.id,
          label: t.label,
          category: t.category,
        })),
      },
    },
    include: { triggers: true },
  });

  return json({ data: log }, { status: 201 });
});
