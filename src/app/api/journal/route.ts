import {
  handle,
  json,
  requireUser,
  parseBody,
  enforceRateLimit,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { journalCreateSchema } from "@/lib/validators";
import { analyzeSentiment } from "@/services/ai/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/journal — recent journal entries for the current user.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const limit = Math.min(
    Number(new URL(req.url).searchParams.get("limit") ?? 50),
    100,
  );

  const entries = await prisma.journalEntry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return json({ data: entries });
});

// POST /api/journal — create an entry; runs sentiment analysis (graceful).
export const POST = handle(async (req) => {
  const user = await requireUser();
  enforceRateLimit(user.id, "journal:write", 40, 60_000);

  const input = await parseBody(req, journalCreateSchema);

  if (input.clientId) {
    const existing = await prisma.journalEntry.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: input.clientId } },
    });
    if (existing) return json({ data: existing, deduped: true });
  }

  const { sentiment, score } = await analyzeSentiment(input.content);

  const entry = await prisma.journalEntry.create({
    data: {
      userId: user.id,
      title: input.title ?? null,
      content: input.content,
      sentiment,
      score,
      clientId: input.clientId,
      createdAt: input.createdAt ?? new Date(),
    },
  });

  return json({ data: entry }, { status: 201 });
});
