import { describe, expect, it } from "vitest";
import {
  detectCrisisLanguage,
  classifyWellnessState,
  stateGuidance,
  WellnessState,
  CRISIS_RESPONSE,
  type WellnessSnapshot,
} from "@/services/ai/openrouter";

function snap(overrides: Partial<WellnessSnapshot>): WellnessSnapshot {
  return {
    avgMood: 3,
    avgStress: 5,
    entries: 5,
    topTriggers: [],
    recentNotes: [],
    crisisFlag: false,
    ...overrides,
  };
}

describe("detectCrisisLanguage", () => {
  it("flags explicit self-harm language", () => {
    expect(detectCrisisLanguage(["I want to die, I can't go on"])).toBe(true);
    expect(detectCrisisLanguage(["thinking about suicide"])).toBe(true);
  });
  it("does not flag ordinary stress", () => {
    expect(detectCrisisLanguage(["so stressed about the exam, exhausted"])).toBe(false);
    expect(detectCrisisLanguage([])).toBe(false);
  });
});

describe("classifyWellnessState", () => {
  it("crisis flag dominates everything", () => {
    expect(classifyWellnessState(snap({ crisisFlag: true, avgMood: 5, avgStress: 1 }))).toBe(
      WellnessState.CRISIS,
    );
  });
  it("high stress + low mood => burnout", () => {
    expect(classifyWellnessState(snap({ avgStress: 9, avgMood: 2 }))).toBe(
      WellnessState.BURNOUT,
    );
  });
  it("high stress alone => high stress", () => {
    expect(classifyWellnessState(snap({ avgStress: 7, avgMood: 3 }))).toBe(
      WellnessState.HIGH_STRESS,
    );
  });
  it("good mood + low stress => thriving", () => {
    expect(classifyWellnessState(snap({ avgMood: 5, avgStress: 2 }))).toBe(
      WellnessState.THRIVING,
    );
  });
  it("procrastination trigger => procrastination", () => {
    expect(
      classifyWellnessState(snap({ topTriggers: ["Lack of progress"] })),
    ).toBe(WellnessState.PROCRASTINATION);
  });
});

describe("stateGuidance", () => {
  it("crisis guidance is the safety response", () => {
    expect(stateGuidance(WellnessState.CRISIS)).toBe(CRISIS_RESPONSE);
  });
  it("every state returns non-empty guidance", () => {
    for (const s of Object.values(WellnessState)) {
      expect(stateGuidance(s).length).toBeGreaterThan(40);
    }
  });
});
