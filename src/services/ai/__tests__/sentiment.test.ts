import { describe, expect, it, beforeEach } from "vitest";
import { analyzeSentiment } from "@/services/ai/openrouter";

// With no OPENROUTER_API_KEY set, the service must degrade gracefully to the
// deterministic keyword classifier instead of throwing.
describe("analyzeSentiment (degraded mode)", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("classifies a clearly negative entry", async () => {
    const r = await analyzeSentiment(
      "I feel so anxious and exhausted, the exam pressure is overwhelming.",
    );
    expect(r.degraded).toBe(true);
    expect(r.sentiment).toBe("negative");
    expect(r.score).toBeLessThan(0);
  });

  it("classifies a clearly positive entry", async () => {
    const r = await analyzeSentiment(
      "Feeling calm, confident and proud of my progress today.",
    );
    expect(r.sentiment).toBe("positive");
    expect(r.score).toBeGreaterThan(0);
  });
});
