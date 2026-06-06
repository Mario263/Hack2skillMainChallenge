import { describe, expect, it, vi, afterEach } from "vitest";
import { apiFetch, HttpError } from "@/lib/api-client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("returns parsed JSON on 2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { data: { ok: true } }),
    );
    const r = await apiFetch<{ data: { ok: boolean } }>("/api/x");
    expect(r.data.ok).toBe(true);
  });

  it("throws HttpError with server code on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(422, { error: "bad", code: "validation_error" }),
    );
    await expect(apiFetch("/api/x", { method: "POST", body: "{}" })).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
    });
  });

  it("maps network failures to HttpError(0)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("boom"));
    await expect(apiFetch("/api/x")).rejects.toBeInstanceOf(HttpError);
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("maps aborts/timeouts to HttpError(408)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 408,
      code: "timeout",
    });
  });
});
