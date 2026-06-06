import { describe, expect, it } from "vitest";
import {
  moodCreateSchema,
  journalCreateSchema,
  triggerCreateSchema,
} from "@/lib/validators";

describe("moodCreateSchema", () => {
  it("accepts a valid mood payload", () => {
    const r = moodCreateSchema.safeParse({
      mood: 4,
      stress: 6,
      note: "ok day",
      triggers: [{ label: "Exams", category: "exams" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects out-of-range mood", () => {
    expect(moodCreateSchema.safeParse({ mood: 9, stress: 5 }).success).toBe(false);
  });

  it("rejects out-of-range stress", () => {
    expect(moodCreateSchema.safeParse({ mood: 3, stress: 99 }).success).toBe(
      false,
    );
  });

  it("defaults triggers to an empty array", () => {
    const r = moodCreateSchema.parse({ mood: 3, stress: 5 });
    expect(r.triggers).toEqual([]);
  });
});

describe("journalCreateSchema", () => {
  it("rejects empty content", () => {
    expect(journalCreateSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("accepts content", () => {
    expect(
      journalCreateSchema.safeParse({ content: "felt better today" }).success,
    ).toBe(true);
  });
});

describe("triggerCreateSchema", () => {
  it("defaults category to custom", () => {
    const r = triggerCreateSchema.parse({ label: "Roommate" });
    expect(r.category).toBe("custom");
  });
});
