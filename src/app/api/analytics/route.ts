import { handle, json, requireUser } from "@/lib/api";
import { buildAnalytics } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/analytics?range=30 — full analytics payload for the current user.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const range = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("range") ?? 30), 7),
    90,
  );

  const payload = await buildAnalytics(user.id, range);
  return json({ data: payload });
});
