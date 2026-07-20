// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSavedRuns,
  addSavedRun,
  deleteSavedRun,
  clearSavedRuns,
} from "@/lib/savedRuns";
import type { EvalRun } from "@/types/eval";
import { DEFAULT_LLM_SETTINGS } from "@/types/interview";
import { EMPTY_MATRIX } from "@/lib/eval/metrics";

const STORAGE_KEY = "nextstep.savedEvalRuns.v1";

function evalRun(): EvalRun {
  return {
    settings: DEFAULT_LLM_SETTINGS,
    strategy: "zero-shot",
    items: [],
    aggregate: {
      matrix: EMPTY_MATRIX,
      metrics: {
        precision: null,
        recall: null,
        falsePositiveRate: null,
        f1: null,
        accuracy: null,
      },
      evaluated: 0,
      total: 0,
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("addSavedRun / loadSavedRuns", () => {
  it("round-trips a saved run, newest first", () => {
    addSavedRun(evalRun(), 1000);
    const b = addSavedRun(evalRun(), 2000);
    const loaded = loadSavedRuns();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe(b.id); // newest first
  });

  it("caps the store at 30 runs", () => {
    for (let i = 0; i < 35; i++) addSavedRun(evalRun(), 1000 + i);
    expect(loadSavedRuns()).toHaveLength(30);
  });
});

describe("untrusted read handling", () => {
  it("drops entries whose run fails the structural check", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "bad", savedAt: 1, run: { items: "not-array" } },
        { id: "good", savedAt: 2, run: evalRun() },
      ]),
    );
    const loaded = loadSavedRuns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("good");
  });

  it("returns an empty list on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "nope");
    expect(loadSavedRuns()).toEqual([]);
  });
});

describe("mutations", () => {
  it("deletes a run by id", () => {
    const a = addSavedRun(evalRun(), 1000);
    addSavedRun(evalRun(), 2000);
    deleteSavedRun(a.id);
    expect(loadSavedRuns().some((r) => r.id === a.id)).toBe(false);
  });

  it("clears every run", () => {
    addSavedRun(evalRun(), 1000);
    clearSavedRuns();
    expect(loadSavedRuns()).toEqual([]);
  });
});
