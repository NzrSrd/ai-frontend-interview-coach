// Client-side persistence for completed evaluation runs (Saved-interviews tab
// only) so metrics can be compared across sessions, surviving reloads. Same
// browser-only, untrusted-read contract as lib/savedInterviews.ts: reads
// validate the shape and drop anything malformed rather than throwing.

import type { EvalRun } from "@/types/eval";

const STORAGE_KEY = "nextstep.savedEvalRuns.v1";
/** Keep the newest N runs; older ones are dropped on write. */
const MAX_RUNS = 30;

/** One persisted evaluation run with the time it was saved. */
export interface SavedEvalRun {
  id: string;
  /** Epoch ms when the run completed and was saved. */
  savedAt: number;
  run: EvalRun;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

// Stable empty array so server + empty snapshots keep referential identity
// (useSyncExternalStore loops forever if getSnapshot returns a fresh ref).
const EMPTY: SavedEvalRun[] = [];

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Light structural check on an EvalRun read back from storage. */
function isEvalRunLike(v: unknown): v is EvalRun {
  if (!isRecord(v)) return false;
  if (!Array.isArray(v.items)) return false;
  if (!isRecord(v.aggregate)) return false;
  const agg = v.aggregate as Record<string, unknown>;
  return (
    isRecord(agg.metrics) &&
    isRecord(agg.matrix) &&
    typeof agg.evaluated === "number" &&
    typeof agg.total === "number"
  );
}

/** Narrow an unknown value from storage into a SavedEvalRun, or null. */
function coerce(value: unknown): SavedEvalRun | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  if (typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)) {
    return null;
  }
  if (!isEvalRunLike(value.run)) return null;
  return { id: value.id, savedAt: value.savedAt, run: value.run };
}

function parseRaw(raw: string | null): SavedEvalRun[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const list = parsed
      .map(coerce)
      .filter((x): x is SavedEvalRun => x !== null)
      .sort((a, b) => b.savedAt - a.savedAt);
    return list.length === 0 ? EMPTY : list;
  } catch {
    return EMPTY;
  }
}

/** Read all saved runs, newest first. Never throws. */
export function loadSavedRuns(): SavedEvalRun[] {
  if (!hasStorage()) return EMPTY;
  return parseRaw(window.localStorage.getItem(STORAGE_KEY));
}

// --- External-store plumbing for useSyncExternalStore ----------------------

let cachedRaw: string | null = null;
let cachedList: SavedEvalRun[] = EMPTY;
let cacheInitialized = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSavedRuns(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

export function getSavedRunsSnapshot(): SavedEvalRun[] {
  if (!hasStorage()) return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (cacheInitialized && raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  cachedList = parseRaw(raw);
  cacheInitialized = true;
  return cachedList;
}

export function getSavedRunsServerSnapshot(): SavedEvalRun[] {
  return EMPTY;
}

function write(list: SavedEvalRun[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.slice(0, MAX_RUNS)),
    );
    emit();
  } catch {
    // Quota exceeded or storage disabled — best-effort, so swallow.
  }
}

function newId(savedAt: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run_${savedAt.toString(36)}`;
}

/**
 * Persist a completed run. Returns the stored record (with its id) so the caller
 * can, e.g., expand it immediately. `savedAt` is injected for testability;
 * defaults to now.
 */
export function addSavedRun(
  run: EvalRun,
  savedAt: number = Date.now(),
): SavedEvalRun {
  const record: SavedEvalRun = { id: newId(savedAt), savedAt, run };
  write([record, ...loadSavedRuns()]);
  return record;
}

/** Remove one saved run by id. */
export function deleteSavedRun(id: string): void {
  write(loadSavedRuns().filter((r) => r.id !== id));
}

/** Remove every saved run. */
export function clearSavedRuns(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    emit();
  } catch {
    // Ignore — nothing actionable if removal fails.
  }
}
