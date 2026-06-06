import { handle, json, requireUser, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { journalUpdateSchema } from "@/lib/validators";
import { analyzeSentiment } from "@/services/ai/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function ownedEntry(userId: string, id: string) {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) throw new ApiError(404, "Journal entry not found", "not_found");
  // Ownership enforcement.
  if (entry.userId !== userId) throw new ApiError(403, "Forbidden", "forbidden");
  return entry;
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async (r) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedEntry(user.id, id);

    const input = await parseBody(r, journalUpdateSchema);
    const { sentiment, score } = await analyzeSentiment(input.content);

    const updated = await prisma.journalEntry.update({
      where: { id },
      data: {
        title: input.title ?? null,
        content: input.content,
        sentiment,
        score,
      },
    });

    return json({ data: updated });
  })(req);
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedEntry(user.id, id);

    await prisma.journalEntry.delete({ where: { id } });
    return json({ ok: true });
  })(req);
}
