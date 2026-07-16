# CLAUDE.md

This file provides guidance to Claude Code (claude.ai code) when working with code in this repository.

@AGENTS.md

# Project Overview

A Next.js app that generates frontend interview questions (with model answers and
likely follow-ups) via OpenRouter, streamed token-by-token, plus an LLM-as-judge
evaluation harness that grades generated answers against a labeled gold set. The
feature is fully implemented — see the **Architecture** and **Features** sections
of `README.md` for the module map and behavior.

## Key Commands

- `npm run dev` - Start the dev server (<http://localhost:3000>)
- `npm run build` - Build for production
- `npm run start` - Serve the production build
- `npm run lint` - Run ESLint (flat config, `eslint.config.mjs`)
- `npm run typecheck` - Type-check with `tsc --noEmit` (strict mode)
- `npm run format` / `npm run format:check` - Write / check Prettier formatting

There is **no test script and no test suite** — nothing under `npm test`. The eval
harness (`lib/eval/`) partially substitutes for tests by measuring answer quality,
but the pure modules (`lib/eval/metrics.ts`, `lib/interviewFormat.ts`,
`lib/security.ts` validators) are unit-testable and currently uncovered.

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
