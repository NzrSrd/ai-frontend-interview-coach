# Production Deployment Plan — Vercel + CI-gated auto-deploy

## Context

The app currently has no deployment path — README documents only local `npm run build`
/ `npm start`, there's no `vercel.json`, no `Dockerfile`, and CI
(`.github/workflows/ci.yml`) runs typecheck/lint/coverage but never ships. Goal: get
the app live on **Vercel**, deploying **automatically on push to `main` once the
existing CI gate passes**.

The app is a good fit for Vercel and needs very little to go live:

- **Stateless** — all persistence is client-side `localStorage` (`lib/savedInterviews.ts`,
  `lib/savedRuns.ts`). No DB, no filesystem writes, no background jobs.
- **Two env vars**, both read only in `lib/openrouter.ts`: `OPENROUTER_API_KEY`
  (required secret) and `OPENROUTER_MODEL` (optional override).
- **No Node-only APIs** in server code; routes run on the default Node.js runtime.

Two facts shape the config:

1. **Streaming routes** `app/api/interview/route.ts` and `app/api/answer/route.ts`
   return a `ReadableStream` with `Cache-Control: no-store` and `X-Accel-Buffering: no`.
   Vercel streams natively — no extra work.
2. **Long eval routes** `app/api/evaluate/route.ts` and `app/api/evaluate/saved/route.ts`
   fan out multiple LLM calls with a **120s** internal timeout. This exceeds the default
   serverless function duration and must be raised per-route (see Step 3). >60s duration
   requires a **Vercel Pro** plan; Hobby caps at 60s.

## Decisions taken

- **Platform:** Vercel (first-party Next.js 16 host).
- **Trigger:** auto-deploy to production after the existing CI job passes on `main`.
  GitHub Actions is the single source of truth for production deploys (Vercel's own
  auto-deploy for `main` is turned off so CI is a true gate, not a parallel race).

## Steps

### 1. Create & link the Vercel project (one-time, dashboard/CLI)
- Import the GitHub repo into Vercel. Framework auto-detects as Next.js; build command
  `next build`, output handled automatically — **no `vercel.json` required** and no
  `output: "standalone"` change to `next.config.ts`.
- In **Project → Settings → Git**, disable **automatic production deployments** for
  `main` (we drive prod from CI). Optionally leave **preview deployments** on for PRs.
- Capture three values for CI: `VERCEL_TOKEN` (account token),
  `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (from `.vercel/project.json` after
  `vercel link`, or the dashboard).

### 2. Configure environment variables (Vercel dashboard → Settings → Environment Variables)
- `OPENROUTER_API_KEY` = `sk-or-...` → scope to **Production** (and **Preview** if PR
  previews are enabled). Never committed — matches the existing `.env` gitignore rule.
- `OPENROUTER_MODEL` (optional) → set only if overriding the in-code default model.

### 3. Raise the function duration on the eval routes (code change, at execution time)
Add to the top of **both** `app/api/evaluate/route.ts` and
`app/api/evaluate/saved/route.ts` (they already export `dynamic = "force-dynamic"`):

```ts
export const maxDuration = 120; // matches the route's internal 120s AbortController budget
```

The two streaming routes (45s internal timeout) are safely under the default and need
no change. **Requires Vercel Pro.** If staying on Hobby: either accept that eval runs
>60s will be killed, or lower the eval budget — call out the tradeoff before shipping.

### 4. Add a CI-gated deploy job to `.github/workflows/ci.yml`
Append a `deploy` job that `needs:` the existing test job, guarded to
`github.ref == 'refs/heads/main'` and `push` events only. It should:
- `npm i -g vercel@latest`
- `vercel pull --yes --environment=production --token=$VERCEL_TOKEN`
- `vercel build --prod --token=$VERCEL_TOKEN`
- `vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN`

Store `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as **GitHub repo secrets**
(Settings → Secrets and variables → Actions). Because the job `needs` the test job, a
failing typecheck/lint/coverage run blocks the deploy — the requested gate.

### 5. Document it in README (docs, at execution time)
Add a short **Deployment** section: Vercel host, the two env vars and their scopes, the
CI-gated auto-deploy on `main`, and the Pro-plan requirement for the eval routes.

## Known limitations to note (not blockers)
- **In-memory rate limiter** (`lib/security.ts`, module-level `Map`, 10 req/60s) is
  per-instance and resets on redeploy. On Vercel's serverless model each instance has
  its own bucket, so effective limits are looser than 10/60s under load. Fine for an
  MVP; the code already flags "swap for Redis/Upstash for real scale." Out of scope
  here.
- No custom domain step included — add later via Vercel dashboard if wanted.

## Verification
1. **CI gate:** push a trivial commit to a branch, open a PR → confirm CI runs and (if
   previews on) a Vercel preview URL is posted. Merge to `main` → confirm the `deploy`
   job runs only after tests pass and produces a production URL.
2. **Secrets wired:** on the live URL, generate an interview → tokens **stream** in
   (confirms `OPENROUTER_API_KEY` is set and streaming isn't buffered). A missing key
   surfaces as the `OpenRouterError("OPENROUTER_API_KEY is not configured.")` 500.
3. **Eval duration:** run an evaluation on the live site and confirm it completes past
   60s without a platform timeout (validates `maxDuration` + Pro plan). On Hobby,
   expect a ~60s cutoff.
4. **No-cache/streaming headers:** `curl -N` the live `/api/interview` and confirm a
   progressive (not buffered) response.
