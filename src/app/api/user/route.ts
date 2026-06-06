import { handle, json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/user — current profile + aggregate counts.
export const GET = handle(async () => {
  const user = await requireUser();

  const [profile, moodLogs, journals, insights] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, image: true, createdAt: true },
    }),
    prisma.moodLog.count({ where: { userId: user.id } }),
    prisma.journalEntry.count({ where: { userId: user.id } }),
    prisma.insight.count({ where: { userId: user.id } }),
  ]);

  return json({ data: { profile, counts: { moodLogs, journals, insights } } });
});

// DELETE /api/user — irreversible account + data deletion (cascade).
export const DELETE = handle(async () => {
  const user = await requireUser();
  await prisma.user.delete({ where: { id: user.id } });
  return json({ ok: true });
});
