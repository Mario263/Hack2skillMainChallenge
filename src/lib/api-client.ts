// Thin fetch wrapper with timeout + typed JSON. Throws on non-2xx.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
    });

    const text = await res.text();
    const body = text ? JSON.parse(text) : {};

    if (!res.ok) {
      throw new HttpError(
        res.status,
        body?.error ?? `Request failed (${res.status})`,
        body?.code,
      );
    }
    return body as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new HttpError(408, "Request timed out", "timeout");
    }
    throw new HttpError(0, "Network error", "network");
  } finally {
    clearTimeout(timer);
  }
}
