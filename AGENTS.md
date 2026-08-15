# SheetSubmit ShadcnUI — Agent Rules

## Read this first
**Read `PLAN.md` before doing anything.** It is the single source of truth for project
state: what is done, what is next, commands, decisions, gotchas, and how to resume from any
state or session. Keep it updated — it is the only continuity guarantee. Never leave it stale.

## Project quick facts
- Monorepo (npm workspaces: `apps/*`, `packages/*`), package manager is **bun**.
- Frontend: React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui (Nova preset, lucide, Geist).
- Backend: TypeScript Express + ioredis (in progress — see PLAN.md phase table).
- The old production app lives at `B:\Studio\Tools\SheetSubmit` (vanilla JS + Express +
  Redis + Android). It is the **behavioral source of truth** — port behavior, don't redesign.
  Its own `AGENTS.md` (Android APK build/install flow) applies to that repo only.

## Rules
1. Start every task by reading `PLAN.md` §4 (handoff) — assess real state with git, don't
   trust memory.
2. Work on the first phase marked ⬜ in the phase table. Verify against that phase's
   done-criteria.
3. **API/Redis parity is sacred** — the new server must keep identical endpoints, JSON
   shapes, status codes, and Redis keys. Diff against the old `server/index.js` first.
4. After `npx shadcn add`, the CLI writes to a literal `apps/web/@/` folder in this
   monorepo — move files into `src/` and delete `@/` (see PLAN.md §6).
5. Use tokens/CSS variables for colors — no hardcoded hex (see PLAN.md §6).
6. Commit after each completed phase with a `Phase N: …` message, then update `PLAN.md`
   (status, commit hash, gotchas).
7. Do not touch the old repo unless the task explicitly requires it; treat it as protected.
8. **Deploy flow (web/server changes):** after a web/server change is done and the user wants
   it live, ALWAYS do these two steps in order: (1) commit + push to `main`, (2) run
   `redeploy.bat` from the repo root — it `docker build` + `docker push`es
   `popyog/sheetsubmit-shadcnui:latest` (Railway auto-deploys the pushed image). Do not skip
   either step; ask first only if the user hasn't asked to ship.
9. **Android — NEVER build locally, CI only.** `apps/android` is built by GitHub Actions
   (`.github/workflows/build-android.yml`, triggers on push to `apps/android/**` →
   `assembleRelease` + GitHub Release tagged `v<run_number>`). Never run gradle locally.
   The in-app "Check for updates" / "What's new" buttons read
   `https://api.github.com/repos/Cryptoistaken/SheetSubmit-Shadcnui/releases/latest`
   (repo is PUBLIC — anonymous read works; config in `Config.GITHUB_REPO`).
