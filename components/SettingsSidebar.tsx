"use client";

import { useEffect } from "react";
import {
  DEFAULT_LLM_SETTINGS,
  LlmSettings,
  MAX_TOKENS_MAX,
  MAX_TOKENS_MIN,
  MAX_TOKENS_STEP,
  MODEL_DESCRIPTIONS,
  MODEL_LABELS,
  MODELS,
  ModelId,
  REASONING_EFFORTS,
  REASONING_EFFORT_LABELS,
  ReasoningEffort,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  TEMPERATURE_STEP,
} from "@/types/interview";
import {
  DEFAULT_STRATEGY,
  PROMPT_STRATEGIES,
  PromptStrategy,
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
} from "@/lib/prompts/strategies";

interface SettingsSidebarProps {
  open: boolean;
  onClose: () => void;
  settings: LlmSettings;
  onChange: (settings: LlmSettings) => void;
  /** Selected prompting technique used to shape generated answers. */
  strategy: PromptStrategy;
  onStrategyChange: (strategy: PromptStrategy) => void;
  /** Disable controls while a request is in flight. */
  disabled?: boolean;
}

const fieldLabel =
  "flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300";
const helpText = "text-xs font-normal text-zinc-500 dark:text-zinc-400";

export default function SettingsSidebar({
  open,
  onClose,
  settings,
  onChange,
  strategy,
  onStrategyChange,
  disabled = false,
}: SettingsSidebarProps) {
  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function update<K extends keyof LlmSettings>(key: K, value: LlmSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  const isDefault =
    settings.model === DEFAULT_LLM_SETTINGS.model &&
    settings.temperature === DEFAULT_LLM_SETTINGS.temperature &&
    settings.maxTokens === DEFAULT_LLM_SETTINGS.maxTokens &&
    settings.reasoningEffort === DEFAULT_LLM_SETTINGS.reasoningEffort &&
    strategy === DEFAULT_STRATEGY;

  function resetToDefaults() {
    onChange({ ...DEFAULT_LLM_SETTINGS });
    onStrategyChange(DEFAULT_STRATEGY);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Model settings"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-black dark:text-zinc-50">
            Model settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-black dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
          {/* Prompt technique */}
          <label className={fieldLabel}>
            Prompt technique
            <select
              value={strategy}
              disabled={disabled}
              onChange={(e) =>
                onStrategyChange(e.target.value as PromptStrategy)
              }
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
            >
              {PROMPT_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABELS[s]}
                </option>
              ))}
            </select>
            <span className={helpText}>{STRATEGY_DESCRIPTIONS[strategy]}</span>
          </label>

          {/* Model */}
          <label className={fieldLabel}>
            Model
            <select
              value={settings.model}
              disabled={disabled}
              onChange={(e) => update("model", e.target.value as ModelId)}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
            >
              {MODELS.map((model) => (
                <option key={model} value={model}>
                  {MODEL_LABELS[model]}
                </option>
              ))}
            </select>
            <span className={helpText}>
              {MODEL_DESCRIPTIONS[settings.model]}
            </span>
          </label>

          {/* Temperature */}
          <label className={fieldLabel}>
            <span className="flex items-center justify-between">
              Temperature
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                {settings.temperature.toFixed(1)}
              </span>
            </span>
            <input
              type="range"
              min={TEMPERATURE_MIN}
              max={TEMPERATURE_MAX}
              step={TEMPERATURE_STEP}
              value={settings.temperature}
              disabled={disabled}
              onChange={(e) => update("temperature", Number(e.target.value))}
              className="accent-foreground disabled:opacity-50"
            />
            <span className={helpText}>
              Lower is more focused and deterministic; higher is more creative
              and varied.
            </span>
          </label>

          {/* Max tokens */}
          <label className={fieldLabel}>
            <span className="flex items-center justify-between">
              Max tokens
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                {settings.maxTokens}
              </span>
            </span>
            <input
              type="range"
              min={MAX_TOKENS_MIN}
              max={MAX_TOKENS_MAX}
              step={MAX_TOKENS_STEP}
              value={settings.maxTokens}
              disabled={disabled}
              onChange={(e) => update("maxTokens", Number(e.target.value))}
              className="accent-foreground disabled:opacity-50"
            />
            <span className={helpText}>
              Upper bound on the length of the generated response.
            </span>
          </label>

          {/* Reasoning effort */}
          <fieldset className="flex flex-col gap-2" disabled={disabled}>
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Reasoning effort
            </legend>
            <div className="mt-1 grid grid-cols-4 gap-1 rounded-lg border border-zinc-300 p-1 dark:border-zinc-700">
              {REASONING_EFFORTS.map((effort) => {
                const active = settings.reasoningEffort === effort;
                return (
                  <button
                    key={effort}
                    type="button"
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() =>
                      update("reasoningEffort", effort as ReasoningEffort)
                    }
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      active
                        ? "bg-foreground text-background"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {REASONING_EFFORT_LABELS[effort]}
                  </button>
                );
              })}
            </div>
            <span className={helpText}>
              How much the model &ldquo;thinks&rdquo; before answering. Higher
              effort can improve quality but is slower and costs more.
            </span>
          </fieldset>
        </div>

        <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            disabled={disabled || isDefault}
            onClick={resetToDefaults}
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-black disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Reset to defaults
          </button>
        </div>
      </aside>
    </>
  );
}
