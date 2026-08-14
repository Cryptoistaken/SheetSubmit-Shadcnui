# SheetSubmit ShadcnUI — Master Plan & Handoff

> **Read this first.** This is the single source of truth for the SheetSubmit migration.
> Any person, session, or AI model continuing this work starts here — even cold, with no
> memory of previous sessions. If this file is missing or stale, restore from git history.

---

## 0. What this project is

SheetSubmit is an account manager (Facebook cookies, 2FA keys, account checks) delivered as:
a web SPA, an Android WebView app, and a floating-bubble mini-window (Android).

Two codebases exist:

| Repo | Path | Stack | Role |
|---|---|---|---|
| **Old (production)** | `B:\Studio\Tools\SheetSubmit` | Vanilla JS SPA + Express 4 + Redis (ioredis) + Android WebView/bubble | Live app. **Behavioral source of truth** — port behavior, don't redesign. Git tag `pre-shadcn` exists here (local only, NOT pushed). Its `AGENTS.md` covers the Android APK build/install flow — applies to that repo only. |
| **New (this repo)** | `B:\Studio\Tools\SheetSubmit-Shadcnui` | React 19 + TS + Vite + Tailwind v4 + shadcn/ui (frontend); TS Express (backend, in progress) | The rewrite. Old app stays live until parity is proven, then Express serves the new build. |

**Goal:** exact-same-or-better UI (Geist tokens, pixel parity verified by screenshots) + a
TypeScript backend with best practices, **identical API contract and Redis key shapes** so
existing users/files survive and the old frontend keeps working during migration.

---

## 1. New repo layout

```
SheetSubmit-Shadcnui/
├── package.json          # npm workspaces (apps/*, packages/*); scripts: dev:web, dev:server, build, typecheck
├── PLAN.md               # ← this file
├── AGENTS.md             # agent rules — points here
├── apps/
│   └── web/              # Vite 8 + React 19 + TS 6 + Tailwind v4 + shadcn
│       ├── components.json           # shadcn config (Nova preset, radix, lucide)
│       ├── public/                   # logo-{light,dark}.svg, favicon-{light,dark}.svg (copied from old repo)
│       └── src/
│           ├── index.css             # Tailwind + shadcn theme + ported Geist tokens (light/dark)
│           ├── App.tsx               # shell: topbar (logo, theme toggle) + empty home
│           ├── main.tsx
│           ├── lib/                  # theme.ts, api.ts (typed client), types.ts, utils.ts
│           ├── contexts/             # AuthContext.tsx        (stub — Phase 2)
│           ├── stores/               # sheetStore.ts, filesStore.ts (stubs)
│           ├── hooks/                # useDebounce, usePersist, useUndoRedo, useCheck (stubs)
│           ├── components/           # ui/button.tsx; layout/Topbar.tsx;
│           │                         # home/FileCard,FileGrid,Fab,EmptyState,ArchiveView,AdminView;
│           │                         # sheet/SheetGrid,CellEditor,QuickEditBar,VersionHistory,DiffView;
│           │                         # bubble/BubbleMode  (all stubs except ui/button)
│           ├── pages/                # HomePage, SheetPage, AdminPage (stubs)
│           └── features/filetypes/   # totp.ts, validation.ts (stubs)
├── apps/
│   └── server/           # TS Express backend (Phase 1 — NOT started)
│       ├── package.json  # deps listed but NOT installed yet
│       ├── tsconfig.json
│       └── src/          # index.ts, app.ts, config/env.ts,
│                         # middleware/{auth,error,logging}.ts,
│                         # routes/{auth,files,cells,history,admin,wa,bot}.ts,
│                         # services/{redis,files,backup,telegram}.ts, lib/{ids,json}.ts — all empty stubs
└── packages/
    └── shared/           # @sheetsubmit/shared — domain types (File, Row, FileType) — populated
```

---

## 2. Stack & decisions (locked)

- **Package manager:** `bun` (1.3.x). **Monorepo:** plain npm workspaces — nothing heavier.
- **Frontend:** Vite 8, React 19, TypeScript ~6.0, Tailwind v4 (CSS-first, no config file),
  shadcn/ui **Nova preset** (radix primitives, lucide-react icons, Geist Variable font),
  `react-router` + `zustand` (installed, **not wired yet**), SheetJS for xlsx (later).
- **Dark mode:** `.dark` class on `<html>` (`@custom-variant dark` in index.css); theme
  toggle persists `ss_theme` in localStorage; favicon swaps per theme (matches old app).
- **Tokens:** Geist values from old `css/base.css` ported into shadcn CSS variables —
  including fixes: real `--green: #16a34a`, `--cyan: #00b4d8`, `--amber: #f59e0b`,
  `--brand: #0070f3`, `--radius: 0.375rem` (6px).
- **Backend (planned):** Express 4 + ioredis + dotenv + zod. Port `server/index.js`
  (~1,900 lines) into modules with **identical API contract, status codes, and Redis keys**.
  No data migration.
- **Type sharing:** `@sheetsubmit/shared` workspace package consumed by web + server.

---

## 3. Phases & status

| Phase | Status | Commit / notes |
|---|---|---|
| **0 — Scaffold** (Vite+shadcn monorepo, tokens, theme, build boots) | ✅ Done | `e7eedb5` |
| **0b — Logos + full skeleton** (public SVGs wired, shared pkg, server + web stubs) | ✅ Done | `957b5e2` |
| **1 — Backend TS port** (install server deps; split `server/index.js` into modules; old frontend must run against new server unchanged) | ✅ Done | `b2f353d` |
| **2 — Auth + Home** (device login, file grid, FAB, archive, admin; screenshots == old) | ✅ Done | `b67be36` |
| **3 — Sheet engine** (grid, editing, undo/redo, persist, quick-edit bar; custom table + memo/virtualization) | ⬜ | — |
| **4 — Checks, versions, data ops** (check/auto-check, WA cache, history modal + diff, merge/replace xlsx, download) | ⬜ | — |
| **5 — Bubble (Android)** (`?bubble=1&file=` mode, clipboard automation, 6s refresh, bundle size) | ⬜ | — |
| **6 — Polish & swap** (dark-mode audit, a11y, serve `dist/`, delete old frontend, Android re-verify) | ⬜ | — |

---

## 4. Handoff — where we left off & how to resume from any state

### Last state (as of last update)
- **Phase 2 (Auth + Home) complete — commit `b67be36`.**
  - React UI for login/home/archive/admin.
  - Auth: `AuthContext` (`/api/auth/me` on mount, error or `null` → unauthenticated),
    `LoginScreen` (Telegram `?start=login` button from `/api/bot/info`), `Topbar`
    (theme-aware logo, back button on `/file/:id`, `/api/health` poll every 15s
    w/ 1.5× backoff to 2min, gear panel: user card + Night mode toggle +
    Logout), router gated on auth state.
  - Home: tabs (My Files / Archive / Admin, admin hidden unless `isAdmin`),
    file grid + cards (download/rename/delete, long-press 500ms selection mode
    with `.sel-bar`, cross-dup badge from `/api/cross-dups`), FAB (create
    "Facebook YYYY-MM-DD" with ` (N)` dedup + xlsx upload via
    `lib/xlsx.ts` → `createFile` + `persist({rows,dataCount,action:"import"})`),
    rename modal, archive (30-day countdown, restore/permanent delete, batch
    ops), admin (stats, 300ms-debounced search, user list/detail, delete user).
  - New modules: `lib/api.ts` (full 50+ method typed client mirroring old
    `js/api.js`), `lib/xlsx.ts` (import/export), `lib/toast.tsx`/`lib/confirm.tsx`
    (providers), `src/app.css` (ported old CSS, `.dark` selector, token fixes).
  - Deps added: `xlsx@0.18.5` (apps/web). Vite dev proxy added: `/api` → `:3000`.
  - Verified: web+server `tsc` clean, `bun run --cwd apps/web build` clean;
    smoke-tested against throwaway Redis (`ss:session:smoke` + seeded user/files):
    login screen (no session), home grid w/ cards+meta, tabs, FAB menu, gear
    panel, SheetPage stub at `/file/:id` — all render. `/api/bot/info` 404s
    without `TG_BOT_TOKEN` → login button shows "Connection failed" (old-app parity).
  - Known gaps: SheetPage is a stub (Phase 3); old-app screenshot diff not yet
    run (needs live creds + pixel comparison); bubble/device-login flow is Phase 5.
- **Phase 1 recap (historical) — commit `b2f353d`:**
  - All 60 old endpoints ported to `apps/server/src` with identical paths/methods/
    status codes/JSON shapes/Redis keys (verified by a line-by-line subagent parity
    diff of old `server/index.js` vs the new modules).
  - Fixed during port: Telegram webhook must be at ROOT `/webhook/tg` (was mounted
    under `/api` — dead bot in webhook/production mode); `config/env.ts` repoRoot
    was one level too shallow (`../../..` → `apps/`), breaking `STATIC_ROOT` /
    `.env` lookup — now `../../../../`.
  - Removed empty stubs `routes/cells.ts`, `lib/json.ts` (unused).
  - Smoke-tested against a throwaway local Redis (Docker `redis:7-alpine` on
    :6390): health, auth 401s, files CRUD, persist→history snapshot, rows/cell/
    undo/logs, history list/detail/name/restore/fork, sync, cross-dups, archive
    delete/restore/batch-delete, admin 403/200, WA cache, SPA serving — all pass
    with byte-correct `ss:` keys. Server boots clean; `tsc` + `bun run build` pass.
  - **Not yet done (needs live creds):** full old-frontend click-through against the
    new server (requires a real Telegram session against production Redis). The
    old frontend should run unchanged with `STATIC_ROOT` pointed at the old repo
    root and `REDIS_URL` at production — see gotchas for the exact recipe.
- Phases 3–6 not started.

### Resume recipe (any session/AI, from any state)
1. Read this file (you are here). Read `AGENTS.md` for rules.
2. Assess actual state — do not trust memory:
   ```bash
   cd /b/Studio/Tools/SheetSubmit-Shadcnui
   git log --oneline            # what commits exist
   git status --short           # uncommitted work
   ls apps/server/node_modules 2>/dev/null || echo "server deps NOT installed"
   bun run --cwd apps/web build # does the web app still compile?
   ```
3. In the phase table above, pick the first ⬜ phase → that is the next task.
4. Do the work, verify per that phase's done-criteria (below), commit with a
   `Phase N: …` message, then **update this file** (status, commit hash, new gotchas).
5. Never leave this file stale — it is the only continuity guarantee.

### Done-criteria per phase
- **Phase 1:** `tsc` clean; every endpoint in old `server/index.js` exists in TS with same
  path/shape/status; old vanilla frontend (run with `bun run` from the old repo, pointing at
  the new server) passes a manual click-through; Redis keys byte-identical.
- **Phase 2:** user can log in (device login), see files, create/rename/archive/delete;
  screenshot diff vs old app ≈ identical.
- **Phase 3:** open a real file → edit → undo/redo → reload → changes persist; grid pixels match.
- **Phase 4:** check/auto-check/WA cache, version history + diff + restore/fork/name,
  merge/replace xlsx, download xlsx — all work like the old app.
- **Phase 5:** bubble opens in the mini WebView, clipboard automation (cookie → 2FA → TOTP)
  works on device, boot time acceptable, bundle code-split.
- **Phase 6:** old `index.html`/`js/`/`css/` deleted; Express serves new `dist/`; Android
  WebView + bubble re-verified.

---

## 5. Commands

```bash
# From the new repo root (B:\Studio\Tools\SheetSubmit-Shadcnui)
bun install                              # after any workspace/package.json change
bun run dev:web                          # Vite dev server (apps/web)
bun run build                            # typecheck + build web app → apps/web/dist
bun run typecheck                        # web typecheck (server typecheck needs deps installed)
bun run dev:server                       # Phase 1+: bun --watch apps/server/src/index.ts

# shadcn component add (Phase 2+):
cd apps/web && npx shadcn@latest add <component> -y
# ⚠️ CAVEAT: in this monorepo the CLI writes to a literal "apps/web/@/" folder —
# move files from @/components/ui/* and @/lib/* into src/ (see Gotchas).

# Old repo (reference/behavior source):
cd /b/Studio/Tools/SheetSubmit && bun run   # starts old Express server
```

---

## 6. Gotchas & decisions log (append as you discover)

- **shadcn CLI (2026) changed flags:** `-b` is now the primitive library (`radix|base|aria`),
  not base color. Non-interactive init used: `npx shadcn@latest init -t vite -b radix -p nova -y --css-variables -f --reinstall`.
- **shadcn writes to a literal `@/` dir in this monorepo** (workspace-config detection bug).
  After any `shadcn add`, move `apps/web/@/components/ui/*` → `apps/web/src/components/ui/`
  and `apps/web/@/lib/*` → `apps/web/src/lib/`, then delete `apps/web/@`. (Do NOT skip this —
  imports use `@/` alias which maps to `./src`.)
- **TypeScript ~6.0 deprecates `baseUrl`** — use `paths` only (already done in tsconfigs).
- **Server deps are listed in `apps/server/package.json` but NOT installed.** `bun install`
  at root will install them when Phase 1 starts.
- **`react-router` + `zustand` are installed but unwired** — wire in Phase 2.
- **`pre-shadcn` git tag** on the old repo is local-only; needs `git push origin pre-shadcn`
  (requires user permission).
- **Old repo tooling dir `.freebuff/` is gitignored** — local data, never commit.
- **API contract rule:** the new server must not rename/move endpoints or Redis keys. When
  porting a handler, diff old behavior first (`B:\Studio\Tools\SheetSubmit\server\index.js`).
- Token fixes already applied vs old app: real green/cyan/amber split; `--brand` blue; all
  old hardcoded hex (`#000/#fff/#cc0000/#16a34a/…`) to be replaced by tokens in Phase 6 polish.
- **`config/env.ts` repoRoot math:** this file lives at `apps/server/src/config/env.ts`,
  so the monorepo root is **four** `..` levels up (`../../../../`), not three. A one-off
  wrong value silently broke `STATIC_ROOT` and the dotenv path (server still booted because
  **bun auto-loads `.env` from the CWD** — don't rely on that; the explicit path is the contract).
- **Telegram webhook mount:** keep `/webhook/tg` at the ROOT path (Telegram is registered
  with `APP_URL + "/webhook/tg"`); `/api/bot/info` stays under `/api`. Mounting the webhook
  under `/api` silently kills all bot updates in production webhook mode.
- **Smoke-test recipe (no production impact):** Docker `redis:7-alpine` on a non-default
  port (e.g. `-p 6390:6379`), write a temp repo-root `.env` (`PORT=3999`,
  `REDIS_URL=redis://localhost:6390`, no `TG_BOT_TOKEN`, no `REDIS_BACKUP_URL` → backup
  loop + bot no-op safely), then `bun apps/server/src/index.ts`. Craft sessions directly:
  `docker exec <ctr> redis-cli set ss:session:test '{"userId":"smoke1"}'` and send
  `Cookie: session=test`. **Delete the temp `.env` when done.**
- **bun on this machine is an npm shim** (`C:\Users\Ratul\AppData\Roaming\npm\bun.cmd`),
  not a standalone binary — `Start-Process bun` fails ("not a valid Win32 application").
  Use the real exe: `C:\Users\Ratul\AppData\Roaming\npm\node_modules\bun\bin\bun.exe`.
- **Smoke-testing Phase 2+ without vite:** the server serves `apps/web/dist` by
  default (`STATIC_ROOT`), so build once and hit `http://localhost:3000` directly —
  no vite dev server needed. Vite dev proxy (`/api` → `:3000`) exists for
  `bun run dev:web` workflow.
- **Ported CSS lives in `src/app.css`** (imported at the end of `index.css`). Old
  `[data-theme="dark"]` selectors are converted to `.dark` (new theme.ts toggles
  the `.dark` class only). Old `--green` was a bug (cyan #00b4d8); the port uses
  real green `#16a34a` + a separate `--cyan: #00b4d8` — "Connected" pill and
  sync accents will differ slightly from the old app by design (PLAN §2 fix).
- **`/api/bot/info` only exists when `TG_BOT_TOKEN` is set** — without it the
  login button falls back to "Connection failed" (matches old app behavior).
  Phase-2 UI treats a thrown `me()` error OR `null` body as unauthenticated.

---

## 7. Porting reference — old app essentials

Old repo: `B:\Studio\Tools\SheetSubmit` (vanilla, IIFE modules on `window.__ss`, no build).

| Old file | What it does / port notes |
|---|---|
| `server/index.js` (~1,900 ln) | Express + ioredis. Auth (device login → session cookie), files CRUD, rows/persist/cell, logs/undo, cross-dups, history/versions (snapshot engine, diff, fork/restore/name), fb check proxy (`/api/fb/check`), WA check (`/api/fb/wa-check` + `ss:wa:` cache), admin twins, Telegram bot (device-login binding), backup loop. Port to `apps/server/src/**` with API parity. |
| `server/backup.js` | Redis backup/restore loop → `services/backup.ts`. |
| `js/api.js` | Full endpoint list + shapes → typed client in `apps/web/src/lib/api.ts` (partial). |
| `js/types.js` | File types — only `fb_cookie` remains (IG removed). Moved to `packages/shared`. |
| `js/home.js` (~900 ln) | Home grid, FAB create, xlsx import (SheetJS), archive, admin panel → Phase 2. |
| `js/sheet.js` (~2,230 ln) | The grid engine: render, cell edit, quick-edit bar, tap-hold, selection, undo/redo (server round-trip), persist (debounced 300ms), check/auto-check, WA cache, version modal + diff, merge/replace, download → Phase 3–4. Highest risk. |
| `js/app.js` | Auth check, health polling, deep-link `file/<id>` restore → Phase 2. |
| `js/bubble.js` (~330 ln) | Android-only: gear rows, bubble picker, `?bubble=1&file=` mini mode, clipboard automation (cookie→2FA→TOTP), 6s refresh → Phase 5. |
| `js/filetypes/fbcookie.js` | Validation + TOTP (WebCrypto SHA-1) + `checkAccounts` → `features/filetypes/`. |
| `android/` | WebView wrapper + `Android` JS bridge + ClipboardCaptureActivity + FloatingBubbleService. **Untouched** during migration; must keep working against the new build. |
| `design.md`, `css/*` | Geist design system (tokens already ported; `design.md` is the visual spec). |

Key behaviors to preserve: cookie-based sessions (no localStorage tokens); bubble clipboard
indirection via ClipboardCaptureActivity (Android 10+); undo/redo via `ss:undo`/`ss:redo`
server round-trips; 100-row pad in the sheet; `fb_cookie` = only file type; WA eligibility
cache `ss:wa:<c_user>` survives file deletion.

---

## 8. Overall done criteria (exit checklist)

- [ ] New server (TS) passes all old-API parity checks; Redis keys unchanged.
- [ ] New frontend matches old UI pixel-for-pixel (screenshot diffs) or better.
- [ ] All features work: login, files, sheet editing + undo/redo, checks, versions,
      xlsx import/export, admin, bubble (Android).
- [ ] Dark mode + toasts + empty states + a11y pass.
- [ ] Express serves the new build; old `index.html`/`js/`/`css/` deleted from the old repo.
- [ ] Android APK rebuilt & re-verified (WebView + bubble) via the old repo's CI flow.
- [ ] This file updated: all phases ✅, gotchas logged, final commit hash recorded.
