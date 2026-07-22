# CLAUDE.md

This file provides guidance to Claude Code (claude.ai code) when working with code in this repository.

@AGENTS.md

# Project Overview

- A Next.js app that generates frontend interview questions (with model answers and
  likely follow-ups) via OpenRouter, streamed token-by-token, plus an LLM-as-judge
  evaluation harness that grades generated answers against a labeled gold set. The
  feature is fully implemented — see the **Architecture** and **Features** sections
  of `README.md` for the module map and behavior.
- Data stored in `localStorage`

## Key Commands

- `npm run dev` - Start the dev server (<http://localhost:3000>)
- `npm run build` - Build for production
- `npm run start` - Serve the production build
- `npm run lint` - Run ESLint (flat config, `eslint.config.mjs`)
- `npm run typecheck` - Type-check with `tsc --noEmit` (strict mode)
- `npm run format` / `npm run format:check` - Write / check Prettier formatting
- `npm test` - Run the Vitest suite once (`vitest run`)
- `npm run test:watch` - Vitest in watch mode
- `npm run test:coverage` - Run with v8 coverage; enforces a **70% line/branch/
  function/statement threshold** scoped to `lib/**` + `app/api/**`

## Testing

- **Vitest** (`vitest.config.ts`), a test pyramid: unit tests over the pure seams
  (`lib/eval/metrics.ts`, `lib/interviewFormat.ts`, `lib/security.ts`,
  `lib/prompts*`, `lib/eval/goldset.ts`), integration tests with a mocked `fetch`/
  transport (`lib/openrouter.ts`, the `lib/eval/*` runners, and the four
  `app/api/*/route.ts` handlers), storage tests (`lib/saved*.ts`, happy-dom), and a
  few RTL component smoke tests. Tests live next to their subject as `*.test.ts(x)`.
- The coverage gate covers the logic core only; `components/**` and pages are
  excluded from the threshold (see `coverage.exclude` in `vitest.config.ts`).
- Node default environment; storage/component specs opt into happy-dom with a
  `// @vitest-environment happy-dom` file header.
- CI (`.github/workflows/ci.yml`) runs typecheck + lint + `test:coverage` on push/PR.

## Environment

- Requires a `.env` file at the root with `OPENROUTER_API_KEY="sk-or-..."`.
  Only `lib/openrouter.ts` reads it (server-only). Get a key at
  <https://openrouter.ai/settings/keys>.
- A `.env.example` template exists on disk but is **untracked** (the `.env*`
  pattern in `.gitignore` swallows it), so a fresh clone won't have it — create
  `.env` manually with the variable above.
- **Never commit `.env`** — it's gitignored.

## Important Caveats

- **Next.js 16 + React 19, App Router.** Per `AGENTS.md`, this Next.js version
  diverges from older releases — read `node_modules/next/dist/docs/` before
  writing framework code.
- **Tailwind CSS v4, CSS-configured.** There is no `tailwind.config.*`. Theme
  tokens and `@import "tailwindcss"` live in `app/globals.css` via the `@theme`
  directive.
- **Path alias.** `@/*` maps to the repo root (`tsconfig.json`); TypeScript runs
  in `strict` mode.
- **Server-only modules by convention.** `lib/openrouter.ts`, `lib/security.ts`,
  and the `lib/eval/*` runners are server-only but are not guarded by
  `import "server-only"` — don't import them into client components.
- **`types/` is hand-written.** `types/interview.ts` and `types/eval.ts` are the
  project's own shared types — edit them freely. Next.js's generated type files
  (`validator.ts`, `routes.d.ts`, `cache-life.d.ts`) live under `.next/types/`
  (gitignored), not in `types/` — those are the ones not to hand-edit.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
