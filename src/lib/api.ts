import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logger, newRequestId } from "@/lib/logger";

export class ApiError extends Error {
  /** Seconds the client should wait before retrying (set for 429s). */
  retryAfter?: number;

  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function error(status: number, message: string, code = "error") {
  return NextResponse.json({ error: message, code }, { status });
}

/** Throws ApiError(401) if there is no authenticated user. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "Authentication required", "unauthorized");
  }
  return session.user;
}

/** Validate a JSON request body against a Zod schema. */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body", "invalid_json");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      422,
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      "validation_error",
    );
  }
  return result.data;
}

/** Per-user rate limit guard. Throws ApiError(429) when exceeded. */
export function enforceRateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowMs: number,
) {
  const result = rateLimit(`${userId}:${bucket}`, limit, windowMs);
  if (!result.success) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    const err = new ApiError(429, "Rate limit exceeded. Please slow down.", "rate_limited");
    err.retryAfter = retryAfter;
    throw err;
  }
  return result;
}

/**
 * Wraps a route handler with request-id logging and centralized error
 * translation (Zod, Prisma, ApiError → consistent JSON responses).
 */
export function handle(
  fn: (req: Request, ctx: { requestId: string }) => Promise<Response>,
) {
  return async (req: Request) => {
    const requestId = newRequestId();
    const started = Date.now();
    try {
      const res = await fn(req, { requestId });
      res.headers.set("x-request-id", requestId);
      logger.info("request.ok", {
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        ms: Date.now() - started,
      });
      return res;
    } catch (e) {
      return translateError(e, requestId, req, started);
    }
  };
}

function translateError(
  e: unknown,
  requestId: string,
  req: Request,
  started: number,
) {
  const base = {
    requestId,
    method: req.method,
    path: new URL(req.url).pathname,
    ms: Date.now() - started,
  };

  if (e instanceof ApiError) {
    if (e.status >= 500) logger.error("request.error", { ...base, err: e.message });
    else logger.warn("request.rejected", { ...base, code: e.code, status: e.status });
    const res = error(e.status, e.message, e.code);
    if (e.retryAfter) res.headers.set("Retry-After", String(e.retryAfter));
    res.headers.set("x-request-id", requestId);
    return res;
  }

  if (e instanceof ZodError) {
    logger.warn("request.validation", { ...base });
    return error(422, "Validation failed", "validation_error");
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      // Unique constraint — treat offline-sync duplicates as idempotent.
      logger.warn("request.duplicate", { ...base, code: e.code });
      return error(409, "Duplicate record", "duplicate");
    }
    if (e.code === "P2025") {
      return error(404, "Record not found", "not_found");
    }
    logger.error("request.prisma", { ...base, code: e.code });
    return error(500, "Database error", "db_error");
  }

  logger.error("request.unhandled", {
    ...base,
    err: e instanceof Error ? e.message : String(e),
  });
  return error(500, "Internal server error", "internal");
}
