import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { aiServiceStatus } from "@/services/ai/openrouter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startedAt = Date.now();

export const GET = handle(async () => {
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }

  return json({
    status: database === "ok" ? "healthy" : "degraded",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    database,
    ai: aiServiceStatus.configured ? "configured" : "degraded",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    time: new Date().toISOString(),
  });
});
