import { describe, it, expect } from "vitest";
import { GOLD_SET, getGoldItem } from "@/lib/eval/goldset";
import { TOPICS, DIFFICULTIES } from "@/types/interview";

describe("GOLD_SET", () => {
  it("is non-empty and has unique ids", () => {
    expect(GOLD_SET.length).toBeGreaterThan(0);
    const ids = GOLD_SET.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a well-formed shape for every item", () => {
    for (const item of GOLD_SET) {
      expect(item.id).toBeTruthy();
      expect(item.question).toBeTruthy();
      expect(TOPICS).toContain(item.topic);
      expect(DIFFICULTIES).toContain(item.difficulty);
      expect(item.keyPoints.length).toBeGreaterThan(0);
      expect(item.distractors.length).toBeGreaterThan(0);
    }
  });
});

describe("getGoldItem", () => {
  it("returns the item for a known id", () => {
    const first = GOLD_SET[0];
    expect(getGoldItem(first.id)).toBe(first);
  });

  it("returns undefined for an unknown id", () => {
    expect(getGoldItem("does-not-exist")).toBeUndefined();
  });
});
