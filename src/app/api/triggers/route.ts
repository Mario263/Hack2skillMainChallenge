import {
  handle,
  json,
  requireUser,
  parseBody,
  enforceRateLimit,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { triggerCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/triggers — trigger frequency for the current user (last 90 days).
export const GET = handle(async () => {
  const user = await requireUser();

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.trigger.groupBy({
    by: ["label"],
    where: { userId: user.id, createdAt: { gte: since } },
    _count: { label: true },
    orderBy: { _count: { label: "desc" } },
    take: 20,
  });

  return json({
    data: grouped.map((g) => ({ label: g.label, count: g._count.label })),
  });
});

// POST /api/triggers — log a standalone trigger.
export const POST = handle(async (req) => {
  const user = await requireUser();
  enforceRateLimit(user.id, "trigger:write", 120, 60_000);

  const input = await parseBody(req, triggerCreateSchema);
  const trigger = await prisma.trigger.create({
    data: { userId: user.id, label: input.label, category: input.category },
  });

  return json({ data: trigger }, { status: 201 });
});
