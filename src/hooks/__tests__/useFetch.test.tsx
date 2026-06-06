import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFetch } from "@/hooks/useFetch";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("useFetch", () => {
  it("unwraps the { data } envelope on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { data: [1, 2, 3] }),
    );
    const { result } = renderHook(() => useFetch<number[]>("/api/x", []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a typed error on failure (no silent swallow)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(500, { error: "boom", code: "internal" }),
    );
    const { result } = renderHook(() => useFetch("/api/x", []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error?.status).toBe(500);
  });

  it("does not fetch when url is null", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useFetch(null, []));
    expect(result.current.loading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
