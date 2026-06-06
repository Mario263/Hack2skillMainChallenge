import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 1000).success).toBe(true);
    expect(rateLimit(key, 2, 1000).success).toBe(true);
    const blocked = rateLimit(key, 2, 1000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("isolates different keys", () => {
    const a = rateLimit(`a-${Math.random()}`, 1, 1000);
    const b = rateLimit(`b-${Math.random()}`, 1, 1000);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
  });
});
