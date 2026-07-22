// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSavedInterviews,
  saveInterview,
  deleteSavedInterview,
  cacheDerivedLabels,
  clearSavedInterviews,
  getSavedInterviewsSnapshot,
  getSavedInterviewsServerSnapshot,
} from "@/lib/savedInterviews";
import type { InterviewResponse } from "@/types/interview";
import { DEFAULT_LLM_SETTINGS } from "@/types/interview";

const STORAGE_KEY = "nextstep.savedInterviews.v1";

function response(topic = "React"): InterviewResponse {
  return {
    topic: topic as InterviewResponse["topic"],
    difficulty: "mid",
    questions: [{ question: "Q?", answer: "A.", followUps: ["f1"] }],
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("saveInterview / loadSavedInterviews", () => {
  it("round-trips a saved interview", () => {
    const rec = saveInterview(response(), DEFAULT_LLM_SETTINGS, 1000);
    const loaded = loadSavedInterviews();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(rec.id);
    expect(loaded[0].questions[0].question).toBe("Q?");
  });

  it("returns the newest interview first", () => {
    saveInterview(response("React"), DEFAULT_LLM_SETTINGS, 1000);
    saveInterview(response("CSS"), DEFAULT_LLM_SETTINGS, 2000);
    const loaded = loadSavedInterviews();
    expect(loaded.map((i) => i.topic)).toEqual(["CSS", "React"]);
  });

  it("caps the store at 50 entries", () => {
    for (let i = 0; i < 55; i++) {
      saveInterview(response(), DEFAULT_LLM_SETTINGS, 1000 + i);
    }
    expect(loadSavedInterviews()).toHaveLength(50);
  });
});

describe("untrusted read handling", () => {
  it("drops malformed records but keeps valid ones", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "bad" }, // missing required fields
        {
          id: "good",
          createdAt: 5,
          topic: "React",
          difficulty: "mid",
          questions: [{ question: "Q", answer: "A", followUps: [] }],
        },
      ]),
    );
    const loaded = loadSavedInterviews();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("good");
  });

  it("returns an empty list on corrupt JSON without throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{ not json");
    expect(loadSavedInterviews()).toEqual([]);
  });
});

describe("mutations", () => {
  it("deletes a saved interview by id", () => {
    const a = saveInterview(response(), DEFAULT_LLM_SETTINGS, 1000);
    saveInterview(response(), DEFAULT_LLM_SETTINGS, 2000);
    deleteSavedInterview(a.id);
    const loaded = loadSavedInterviews();
    expect(loaded.some((i) => i.id === a.id)).toBe(false);
    expect(loaded).toHaveLength(1);
  });

  it("merges derived labels into the matching interview", () => {
    const rec = saveInterview(response(), DEFAULT_LLM_SETTINGS, 1000);
    cacheDerivedLabels({
      [rec.id]: { 0: { keyPoints: ["kp"], distractors: ["d"] } },
    });
    const loaded = loadSavedInterviews();
    expect(loaded[0].labels?.[0]).toEqual({
      keyPoints: ["kp"],
      distractors: ["d"],
    });
  });

  it("clears every saved interview", () => {
    saveInterview(response(), DEFAULT_LLM_SETTINGS, 1000);
    clearSavedInterviews();
    expect(loadSavedInterviews()).toEqual([]);
  });
});

describe("useSyncExternalStore snapshots", () => {
  it("returns a stable reference until the store changes", () => {
    saveInterview(response(), DEFAULT_LLM_SETTINGS, 1000);
    const first = getSavedInterviewsSnapshot();
    expect(getSavedInterviewsSnapshot()).toBe(first); // same ref, no write
    saveInterview(response(), DEFAULT_LLM_SETTINGS, 2000);
    expect(getSavedInterviewsSnapshot()).not.toBe(first); // changed after write
  });

  it("uses a stable empty server snapshot", () => {
    expect(getSavedInterviewsServerSnapshot()).toBe(
      getSavedInterviewsServerSnapshot(),
    );
  });
});
