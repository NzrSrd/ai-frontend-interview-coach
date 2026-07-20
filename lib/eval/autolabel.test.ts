import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter")>();
  return { ...actual, openRouterChat: vi.fn() };
});

import { openRouterChat, OpenRouterError } from "@/lib/openrouter";
import { deriveGoldItem } from "@/lib/eval/autolabel";

const mockChat = vi.mocked(openRouterChat);

const input = {
  id: "iv-q0",
  topic: "React" as const,
  difficulty: "mid" as const,
  question: "What is the virtual DOM?",
};

beforeEach(() => mockChat.mockReset());

describe("deriveGoldItem", () => {
  it("derives a GoldItem from valid labeler JSON", async () => {
    mockChat.mockResolvedValueOnce(
      JSON.stringify({
        keyPoints: ["An in-memory UI tree", "Diffed on updates"],
        distractors: ["It paints pixels faster"],
      }),
    );
    const gold = await deriveGoldItem(input);
    expect(gold.id).toBe("iv-q0");
    expect(gold.question).toBe("What is the virtual DOM?");
    expect(gold.keyPoints).toEqual([
      "An in-memory UI tree",
      "Diffed on updates",
    ]);
    expect(gold.distractors).toEqual(["It paints pixels faster"]);
  });

  it("clamps key points and distractors to their caps", async () => {
    mockChat.mockResolvedValueOnce(
      JSON.stringify({
        keyPoints: Array.from({ length: 10 }, (_, i) => `kp${i}`),
        distractors: Array.from({ length: 10 }, (_, i) => `d${i}`),
      }),
    );
    const gold = await deriveGoldItem(input);
    expect(gold.keyPoints.length).toBeLessThanOrEqual(5);
    expect(gold.distractors.length).toBeLessThanOrEqual(4);
  });

  it("throws OpenRouterError on invalid JSON", async () => {
    mockChat.mockResolvedValueOnce("not json at all");
    await expect(deriveGoldItem(input)).rejects.toThrow(OpenRouterError);
  });

  it("throws when the labeler produces no key points", async () => {
    mockChat.mockResolvedValueOnce(
      JSON.stringify({ keyPoints: [], distractors: ["d0"] }),
    );
    await expect(deriveGoldItem(input)).rejects.toThrow(/no key points/i);
  });
});
