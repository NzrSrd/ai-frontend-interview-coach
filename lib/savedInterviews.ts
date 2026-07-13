// Client-side persistence for generated interviews. Every successful generation
// is auto-saved to localStorage so its answers can be graded later on the eval
// page. This module is browser-only: it touches `window.localStorage` and must
// never be imported into a server component or route.
//
// Everything here treats stored data as untrusted — the payload can be edited
// by hand in devtools — so reads validate the shape and silently drop anything
// malformed rather than throwing into the UI.

import type { InterviewQuestion, InterviewResponse, LlmSettings } from "@/types/interview";
import type { DerivedLabels, SavedInterview } from "@/types/eval";

const STORAGE_KEY = "nextstep.savedInterviews.v1";
/** Keep the newest N interviews; older ones are dropped on write. */
const MAX_SAVED = 50;

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

// A stable empty array so server + empty snapshots keep referential identity
// (useSyncExternalStore loops forever if getSnapshot returns a fresh ref).
const EMPTY: SavedInterview[] = [];

/** Narrow an unknown value from storage into a SavedInterview, or null. */
function coerce(value: unknown): SavedInterview | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return null;
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) return null;
  if (typeof v.topic !== "string" || typeof v.difficulty !== "string") return null;
  if (!Array.isArray(v.questions)) return null;

  const questions: InterviewQuestion[] = [];
  for (const q of v.questions) {
    if (!q || typeof q !== "object") continue;
    const r = q as Record<string, unknown>;
    if (typeof r.question !== "string" || typeof r.answer !== "string") continue;
    const followUps = Array.isArray(r.followUps)
      ? r.followUps.filter((f): f is string => typeof f === "string")
      : [];
    questions.push({ question: r.question, answer: r.answer, followUps });
  }
  if (questions.length === 0) return null;

  return {
    id: v.id,
    createdAt: v.createdAt,
    topic: v.topic as SavedInterview["topic"],
    difficulty: v.difficulty as SavedInterview["difficulty"],
    settings: v.settings as LlmSettings,
    questions,
    labels: coerceLabels(v.labels, questions.length),
  };
}

/** Narrow the cached-labels map, dropping any malformed or out-of-range entry. */
function coerceLabels(
  value: unknown,
  questionCount: number,
): Record<number, DerivedLabels> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<number, DerivedLabels> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= questionCount) continue;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const keyPoints = Array.isArray(r.keyPoints)
      ? r.keyPoints.filter((s): s is string => typeof s === "string")
      : [];
    const distractors = Array.isArray(r.distractors)
      ? r.distractors.filter((s): s is string => typeof s === "string")
      : [];
    if (keyPoints.length === 0) continue;
    out[idx] = { keyPoints, distractors };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Parse a raw JSON string into a sorted, validated list. Never throws. */
function parseRaw(raw: string | null): SavedInterview[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const list = parsed
      .map(coerce)
      .filter((x): x is SavedInterview => x !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
    return list.length === 0 ? EMPTY : list;
  } catch {
    return EMPTY;
  }
}

/** Read all saved interviews, newest first. Never throws. */
export function loadSavedInterviews(): SavedInterview[] {
  if (!hasStorage()) return EMPTY;
  return parseRaw(window.localStorage.getItem(STORAGE_KEY));
}

// --- External-store plumbing for useSyncExternalStore ----------------------
// The snapshot is cached and only recomputed when the underlying raw string
// changes, so getSnapshot returns a stable reference between writes (required
// by useSyncExternalStore). Mutations emit to subscribers; cross-tab writes
// arrive via the native `storage` event.

let cachedRaw: string | null = null;
let cachedList: SavedInterview[] = EMPTY;
let cacheInitialized = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to changes (same-tab mutations + cross-tab storage events). */
export function subscribeSavedInterviews(callback: () => void): () => void {
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

/** Cached client snapshot; recomputed only when the stored string changes. */
export function getSavedInterviewsSnapshot(): SavedInterview[] {
  if (!hasStorage()) return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (cacheInitialized && raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  cachedList = parseRaw(raw);
  cacheInitialized = true;
  return cachedList;
}

/** Server snapshot — no storage exists, so always the stable empty list. */
export function getSavedInterviewsServerSnapshot(): SavedInterview[] {
  return EMPTY;
}

function write(list: SavedInterview[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.slice(0, MAX_SAVED)),
    );
    emit();
  } catch {
    // Quota exceeded or storage disabled — saving is best-effort, so swallow.
  }
}

/** Stable-ish id without a dependency; falls back if randomUUID is unavailable. */
function newId(createdAt: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `iv_${createdAt.toString(36)}_${Math.round(createdAt % 1e6)}`;
}

/**
 * Persist a freshly generated interview. Returns the stored record (with its new
 * id) so callers can reference it. `createdAt` is injected so this module stays
 * free of the banned Date.now() in restricted contexts; defaults to now.
 */
export function saveInterview(
  response: InterviewResponse,
  settings: LlmSettings,
  createdAt: number = Date.now(),
): SavedInterview {
  const record: SavedInterview = {
    id: newId(createdAt),
    createdAt,
    topic: response.topic,
    difficulty: response.difficulty,
    settings,
    questions: response.questions,
  };
  write([record, ...loadSavedInterviews()]);
  return record;
}

/** Remove one saved interview by id. */
export function deleteSavedInterview(id: string): void {
  write(loadSavedInterviews().filter((iv) => iv.id !== id));
}

/**
 * Merge freshly derived labels into the stored dataset so future eval runs can
 * skip the derive call. Keyed by interview id, then by question index. Writes
 * once (a single subscriber notification) regardless of how many items changed.
 */
export function cacheDerivedLabels(
  byInterview: Record<string, Record<number, DerivedLabels>>,
): void {
  const ids = Object.keys(byInterview);
  if (ids.length === 0) return;

  let changed = false;
  const next = loadSavedInterviews().map((iv) => {
    const additions = byInterview[iv.id];
    if (!additions) return iv;
    const merged: Record<number, DerivedLabels> = { ...(iv.labels ?? {}) };
    for (const [idx, labels] of Object.entries(additions)) {
      merged[Number(idx)] = labels;
      changed = true;
    }
    return { ...iv, labels: merged };
  });

  if (changed) write(next);
}

/** Remove every saved interview. */
export function clearSavedInterviews(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    emit();
  } catch {
    // Ignore — nothing actionable if removal fails.
  }
}
