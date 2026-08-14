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
│   ├── server/           # TS Express backend (Phase 1 — NOT started)
│   │   ├── package.json  # deps listed but NOT installed yet
│       ├── tsconfig.json
│       └── src/          # index.ts, app.ts, config/env.ts,
│                         # middleware/{auth,error,logging}.ts,
│                         # routes/{auth,files,cells,history,admin,wa,bot}.ts,
│                         # services/{redis,files,backup,telegram}.ts, lib/{ids,json}.ts — all empty stubs
│   └── android/           # copied from old repo B:\Studio\Tools\SheetSubmit\android
│                         # (WebView wrapper + Android bridge + bubble service); NOT a bun workspace
└── packages/
    └── shared/           # @sheetsubmit/shared — domain types (File, Row, FileType) — populated
```

---

## 2. Stack & decisions (locked)

- **Package manager:** `bun` (1.3.x). **Monorepo:** plain npm workspaces — nothing heavier.
- **Frontend:** Vite 8, React 19, TypeScript ~6.0, Tailwind v4 (CSS-first, no config file),
  shadcn/ui **Nova preset** (radix primitives, lucide-react icons, Geist Variable font),
  `react-router` + `zustand` (installed, **not wired yet**), SheetJS for xlsx (later).
  **Component policy: shadcn components are the base for all generic UI — add, then
  modify minimally (see §6).**
- **Dark mode:** `.dark` class on `<html>` (`@custom-variant dark` in index.css); theme
  toggle persists `ss_theme` in localStorage; favicon swaps per theme (matches old app).
- **Tokens:** Geist values from old `css/base.css` ported into shadcn CSS variables —
  including fixes: real `--green: #16a34a`, `--cyan: #00b4d8`, `--amber: #f59e0b`,
  `--brand: #0070f3`, `--radius: 0.375rem` (6px).
- **Backend (planned):** Express 4 + ioredis + dotenv + zod. Port `server/index.js`
  (~1,900 lines) into modules with **identical API contract, status codes, and Redis keys**.
  No data migration.
- **Type sharing:** `@sheetsubmit/shared` workspace package consumed by web + server.

### Android app in this repo
- `apps/android` was **copied** from the old repo (`B:\Studio\Tools\SheetSubmit\android`,
  build artifacts `.gradle`/`app/build` excluded). It is **NOT a bun workspace** — the root
  `workspaces` glob was changed to `["apps/web", "apps/server", "packages/*", "!apps/android"]`
  so `bun install` ignores it (no package.json). Verified: `bun install --frozen-lockfile` still passes.
- `.github/workflows/build-android.yml` paths/working-dir/keystore/artifact updated from
  `android/**` to `apps/android/**`.
- `apps/android` is added to `.dockerignore` (server image doesn't ship Android source).
- **Single URL source of truth:** `apps/android/.../app/Config.java` holds `BASE_URL`
  (now `https://sheetsubmit-shadcnui-production.up.railway.app`); `HOME_URL` and `APP_HOST`
  are derived from it. `MainActivity` and `FloatingBubbleService` reference `Config.*` — change
  only `Config.BASE_URL` to retarget the app.

---

## 3. Phases & status

| Phase | Status | Commit / notes |
|---|---|---|
| **0 — Scaffold** (Vite+shadcn monorepo, tokens, theme, build boots) | ✅ Done | `e7eedb5` |
| **0b — Logos + full skeleton** (public SVGs wired, shared pkg, server + web stubs) | ✅ Done | `957b5e2` |
| **1 — Backend TS port** (install server deps; split `server/index.js` into modules; old frontend must run against new server unchanged) | ✅ Done | `b2f353d` |
| **2 — Auth + Home** (device login, file grid, FAB, archive, admin; screenshots == old) | ✅ Done | `b67be36` |
| **3 — Sheet engine** (grid, editing, undo/redo, persist, quick-edit bar; custom table + memo/virtualization; boneyard skeleton loading) | ✅ Done | `6becf75` |
| **4 — Checks, versions, data ops** (check/auto-check, WA cache, history modal + diff, merge/replace xlsx, download) | ✅ Done | `4cfacf2` |
| **5 — Bubble (Android)** (`?bubble=1&file=` mode, clipboard automation, 6s refresh, bundle size) | ✅ Done | `74e3871` |
| **6 — Polish & swap** (dark-mode audit, a11y, serve `dist/`, delete old frontend, Android re-verify) | ✅ Done* | `19b18d1` — *old-frontend deletion CANCELLED by user (old repo stays untouched); Android on-device re-verify is the user's |

---

## 4. Handoff — where we left off & how to resume from any state

### Last state (as of last update)
- **Post-Phase-6 user-feature batch (commit `…`):**
  - **WA check dots update INSTANTLY per row** — `runWaChecks` now pushes each individual live-check result to the store as it resolves (immutable row replace + `set`), so the dot flips green the moment that row's check finishes; the final `persist()` still happens once at the end. Cache hits still apply up-front in one set.
  - **Check no longer creates undo/redo entries or version snapshots** — `runCheck` dropped its `{type:"rows", prevRows}` undo push AND its `persist("check")` action (now plain `persist()`), per explicit user request. Statuses still save; nothing to revert.
  - **Upload on an EMPTY file is now undoable** — `applyUpload` (replace AND append) pushes a rows-undo snapshot when `lastDataIdx === -1` (no data rows) instead of wiping undo/redo; non-empty files keep the old clear-both-stacks parity.
  - **Append rows now lands after the LAST USED row, not after the 100-pad** — `applyUpload("append")` does `rows.splice(lastDataIdx + 1, 0, ...incoming)` instead of `concat`.
  - **Append/Replace dialog skipped when the file is empty** — `SheetToolbar.handleFileChange` detects all-blank rows and calls `applyUpload("replace", …)` directly; `UploadOverlay` shows the real data count (not the padded 100).
  - **⋮ menu "Remove empty rows"** — `store.removeEmptyRows()` filters blank rows within `[0, lastDataIdx]` only (trailing free rows intact), rows-undo snapshot, `persist("clean")`, toast. Verified: 5 accounts with a deleted #3 → row compacted, pads intact.
  - **Desktop vs touch device detection** — `lib/device.ts` (`IS_TOUCH`/`IS_DESKTOP`, `navigator.maxTouchPoints || matchMedia pointer:coarse || ontouchstart`); `main.tsx` toggles `body.is-touch` (activates the vestigial `td.dc overflow:visible` rule); store gains constant `isDesktop`.
  - **Desktop sheet behavior (touch unchanged):** single click selects the cell with NO edit pill (pill only via double-click); ctrl/cmd+click toggles multi-select; mouse-drag rectangle-selects via `selectRange` (window `pointermove`/`elementFromPoint` + `pointerup`; a drag suppresses the trailing click); Del/Backspace deletes selection; Ctrl+A select-all; Ctrl+C copies TSV — all in `SheetPage` keydown (ignored while typing in inputs). Long-press hold timers disabled on desktop (dot-hold log popup kept). **Gotcha: `setPointerCapture` on the wrap div retargets the click so `closest("td.dc")` fails — drag uses window listeners + `elementFromPoint` instead.**
  - **Admin ban + self-delete guard:** `POST /api/admin/user/:id/ban|unban` write `ss:ban:<id>` `{ts}`; login blocked in `/api/auth/telegram` (403 "account banned" → no new account/session with same Telegram); `requireAuth` 403s banned sessions (live check, no cache); `/auth/me` returns null for banned; admin users/search/detail include `banned` (pipeline `GET ss:ban:<id>`). `AdminView`: Delete User hidden when detail user === current user (from `useAuth`); Ban/Unban toggle button; red "BANNED" badge in list. Verified live: banned session → 403 everywhere + me:null; unban restores.
  - Verified: web `tsc -b && vite build` clean, server `tsc --noEmit` clean; browser-verified (Playwright, desktop UA) — pill, ctrl+click, drag-range, Ctrl+A/Del/C, menu item, ban UI, admin badges, `ss:rows` restore.
  - **NOTE:** the smoke env on :3999 was re-seeded during testing (`ss:rows:smoke` restored to the 5 original rows; a scratch `user2` was removed; `.env` restored to the real prod-var file — temp `.env` must be recreated per the smoke recipe if needed).
- **Phase 6 (Polish & swap) — commit `19b18d1`:**
  - **a11y pass** (audited against the Vercel Web Interface Guidelines; ~34 findings, all
    fixed): `aria-label` on every icon-only button (undo/redo/⋮/check-arrow/download/
    rename/delete/restore buttons — 15 spots), `aria-label` on toggle checkboxes (Night
    mode, Floating bubble), `aria-label` on all modal/search/cell inputs (rename ×3,
    version name, search users, cell value), `role="button"`+`tabIndex`+Enter/Space
    `onKeyDown` on clickable divs (3 Android gear rows, 3 file cards, admin user card,
    day-group header, column-toggle checkbox semantics `role="checkbox"`+`aria-checked`,
    "+ Add row" cell). `color-scheme: light/dark` on `:root`/`.dark` (scrollbars/inputs
    theme correctly; theme.ts also sets it inline), `theme-color` meta now swaps with the
    theme in theme.ts.
  - **Dark-mode audit:** remaining hardcoded hex in app.css is either token definitions
    or intentional (btn-danger white-on-red, `.qeb-icon-btn.save` with `.dark` override,
    checkmarks on colored bgs, dup/invalid amber/red) — no fixes needed. touch-action:
    manipulation, prefers-reduced-motion, overscroll-behavior: contain, tap-highlight
    were already ported.
  - **Serve dist/:** already the default — `STATIC_ROOT` falls back to
    `apps/web/dist`; the smoke server on :3999 has been serving the built app all along.
  - **CANCELLED — old-frontend deletion:** the user explicitly said DO NOT delete the
    old repo/codebase (B:\Studio\Tools\SheetSubmit stays intact). The swap is therefore:
    new server serves the new `dist/`; old repo remains as the reference/source of truth.
  - **Android re-verify:** on-device APK rebuild + WebView/bubble verification is the
    user's (needs the old repo's CI flow + a device). Not done here.
  - Bundle note: main chunk ~828 kB min (260 kB gzip) — xlsx (SheetJS ~450 kB) is in the
    main chunk via static imports; a lazy split was considered and skipped (old app
    shipped xlsx.full.min.js ~800 kB uncompressed from CDN — already better). Bubble chunk
    is split (2.8 kB). If the WebView ever struggles, split xlsx next via dynamic import
    in HomePage/SheetToolbar.
- **Phase 5 (Bubble) complete — commit `74e3871`:**
  - **Android contract** (verified from `android/` source, untouched): bubble service opens
    `HOME_URL + "/?bubble=1&file=<id>"` (root path + query). Bridge `window.Android`:
    main WebView has `isBubbleEnabled/disableBubble/enableBubble/checkForUpdates/whatsNew/
    openSupport` + clipboard `readClipboard/writeClipboard`; bubble mini WebView has
    `isApp/readClipboard/writeClipboard`. Both inject a `navigator.clipboard` shim on
    page-finished, so the WEB app just uses `navigator.clipboard.*` inside Android.
    The floating bubble's double-tap calls `window.__ss.bubbleSkipNo2FA()`; after each
    clipboard capture the service calls `window.__ss.bubbleAutomate()`.
  - **`BubbleMode.tsx`** (lazy-loaded via `React.lazy` — split chunk, ~2.8 kB; main bundle
    unchanged in structure): `body.bubble-mode` class (ported `css/bubble.css` → app.css:
    compact 40px topbar, `sheet-view` inset 40px, scaled QEB, 24px rows/26px gutters/8px
    dots), `openFile(fileId)` after auth, 6s `refreshSheet` interval, clipboard automation
    (`readClipboard` → empty→6×400ms retries→toast; 15s same-text dedupe; cookie detection
    `c_user=`+`;`+`=`; key detection normalized ≥10 chars `[A-Z2-7]+`), exposes
    `window.__ss.bubbleSkipNo2FA` + `bubbleAutomate`. Store gained `bubbleActiveRow` +
    `bubbleGetActiveRow/bubbleAdvanceActiveRow/bubbleSaveCookie/bubbleSaveKey/
    bubbleSkipNo2FA` — cookie/key saved with `onCellChange`, `persist("bubble")`,
    `vibrate`, TOTP auto-copied to clipboard after key save.
  - **KEY FIX vs old app (A/B-verified):** old `saveKeyToSheet` calls `getActiveRow()`
    which ONLY returns rows WITHOUT cookies → the 2FA-key path is dead code in the old
    app (it always toasts "Copy cookie first for account N+1" — reproduced live on the
    old frontend). New `bubbleSaveKey` targets the ACTIVE row when it has cookies and no
    key (the row the cookie just landed in) → the advertised cookie→2FA→TOTP flow now
    works. All old reject paths (dup key/cookie, no cookie first) preserved.
  - **Bubble picker + gear rows** (`BubblePicker.tsx`, Topbar, Android-only when
    `window.Android` present): Floating bubble toggle (checked = `isBubbleEnabled()`; on →
    picker, off → `disableBubble()` + toast), picker modal lists fb_cookie files (+Create
    new Facebook file), Check for updates / What's new / Report an issue rows → bridge
    calls. (Bubble picker overlay needs `className="modal-overlay open"` — React can't do
    the old rAF `.open`-after-append trick.)
  - **TOTP toast hides the code** ("2FA code copied") — follows the Phase-3 security
    decision (old app toasted `2FA code copied: <code>`). Clipboard still gets the code.
  - Verified: web `tsc` + build clean; browser-tested against the smoke env with a fake
    `window.Android` init-script: bubble mode renders (40px topbar, grid), `__ss` hooks
    exposed, cookie→key→TOTP flow round-trip on the sheet + clipboard, gear rows render,
    picker opens with file list. **On-device APK re-verify is the user's** (Phase 6).
  - Smoke env still running: server :3999 (+ temp `.env`), Redis `ss-smoke-redis` (:6390)
    — session `smoke`, file `smoke` now has extra test rows (cookies 777777/888888/
    999999 + key JBSWY3... on row 5). The A/B parity server (:3998, STATIC_ROOT=old repo)
    was killed after the test.
- **Phase 4 (Checks, versions, data ops) complete — commit `4cfacf2`** (plus `52bcf11`
  chore: removed unused Vite/shadcn scaffold `favicon.svg`/`icons.svg`):
  - **WA check flow wired** (old `runWaChecks`): `sheetStore.runWaChecks()` — fires after
    `runCheck()` when `ss_waCheck === "true"` (fb_cookie only); eligibility
    `status==='good' && wa_status!=='eligible' && c_user in cookies`; cache pre-filter via
    `GET /api/wa/cache` (hits apply `wa_status`/`wa_ban_reason`); live checks concurrency 3
    via `POST /api/fb/wa-check`; `persist()` with NO action — **parity note:** when WA runs
    after a check, the debounced persist loses the `'check'` action, so NO version snapshot
    is created (exact old-app behavior — the last `persist()` wins in the shared 300ms timer).
  - **Version history modal** (`VersionHistory.tsx`, shadcn-free ported-CSS overlay):
    grouped-by-day list (`.version-day-group.open`), 50/page pager (`← Prev`/`Next →`),
    per-item: name+rename (Enter/blur commit, Escape cancel), time (`14 Aug 2026, 20:56
    (just now)`), summary (client-side from dedup-key diff — same approximate behavior as
    old: fetched lazily, falls back to `Same row count` etc.), detail (`Added +N rows · M
    rows`), badge (`[New]`/`[±Δ]` + action label; `.restore`/`.replace` classes), buttons
    Copy version / Preview / Restore. Preview = inline `DiffView` (row-level diff keyed by
    dedup uid; `vline add/del/ctx` + stats bar + hunk header; one preview open at a time).
    Restore → confirm → `POST history/:v/restore` → store sets rows (pad 100) + rows-undo
    snapshot, NO persist (server already stored; old parity). Fork → confirm → navigate to
    `/file/<newId>`. Version rows cached per-file in `stores/versionCache.ts` (old app's
    module cache leaked across files — fixed).
  - **Download xlsx** (`DownloadOverlay.tsx` + `downloadSheetRows`): fb_cookie shows the
    filter chooser (All/Alive/Cookie+2FA/Only Cookie/Only 2FA/FB Page/No Page/Dead with
    live counts, buttons only when count>0); uid column EXCLUDED, no header row, filename
    `<name><suffix> [N].xlsx`; toasts `No data to download` / `Downloaded`.
  - **Upload/Merge** (`UploadOverlay.tsx` + `parseSheetRows` + store `mergeRows`/
    `applyUpload`): hidden file input in SheetToolbar; header detection (col key/label vs
    positional), `c_user`→uid derivation; Merge = dedup-by-uid append + `persist('merge')`
    + cross-dup refetch + rows-undo snapshot; Upload → Replace (confirm `**permanently
    replaced**`, clears undo/redo, pads 100, `persist('replace')`) / Append (no dedup,
    clears undo/redo, `persist('append')`); toasts `Merged N (skipped M)` / `Replaced with
    N rows` / `Appended N rows`.
  - **Log popup** now includes cross-file-dup section (yellow ⚠ + `NAME (row N)`) and WA
    section (`✓ FB Page` green when eligible / `⚠ reason`) via extended `onDotHold` return.
  - **Home xlsx import** now hydrates WA cache (`hydrateWaCache`) before createFile/persist
    (old home.js behavior).
  - **Deleted** dead `hooks/useCheck.ts` stub (never imported).
  - Verified: web+server `tsc` clean, `bun run --cwd apps/web build` clean; API smoke on
    throwaway Redis (:6390): history snapshots (check/merge actions), version get/restore/
    name/fork, WA cache read, cross-dups — all correct shapes. **Browser-verified by the
    user**: menu items render, version modal list/badges/pager, preview diff, download
    overlay. Smoke server still running for the user on **:3999** (temp `.env`,
    `PORT=3999`/`REDIS_URL=redis://localhost:6390`), Redis container `ss-smoke-redis` up
    with 3 versions on file `smoke` (incl. a `Restore` snapshot from my test).
- **Phase 3 fixes round 2 — commit `974fccb`:** user-reported issues fixed:
  - **Grid layout broken (headers/cells misaligned, ~65% empty, content-sized columns):** ROOT CAUSE — the `<table className="grid">` collides with **Tailwind v4's on-demand `.grid { display: grid }` utility**. The table became `display: grid`, which makes `table-layout: fixed` inert (computed style still reports "fixed" — misleading) and thead/tbody become independent anonymous tables sized by content. FIX: `display: table` added to the `table.grid` rule in app.css (unlayered, beats the layered Tailwind utility). The old app had no Tailwind so `class="grid"` was inert there. **Gotcha: never rename `table.grid` without keeping `display: table`, and don't add Tailwind's `grid` class to anything that must be a table.** Verified live: columns now equal-width (36|109|109|109|36) and headers align with cells. (The stale `ss_cols_smoke=["uid"]` one-column state was the user's own toggle testing — not a bug.)
  - **Check button looked wrong:** it showed AMBER text (`.warning` = duplicates state, from the dup rows in the smoke file). Removed the amber warning from the button — always white-on-blue now.
  - **Page Check toggle missing:** it was admin-gated (`user.isAdmin`); now always visible in the check dropdown (persists `ss_waCheck`; the WA flow itself is still Phase 4).
  - **TOTP code visible in toast:** dot-click toast now says just "TOTP copied" (no code — secret).
  - **Double-tap copy/paste in cells NOT working:** the native `dblclick` event was unreliable (QEB opening between the two clicks, and `dblclick` never fires on touch). Replaced with a **click-based double-tap detector** in `SheetGrid.handleClick` (same cell within 400ms → `doubleTap` + QEB cancel; single clicks unchanged). Clipboard failures are now visible toasts ("Cannot copy" / "Cannot read clipboard") instead of silent. Works for mouse AND touch (tap-tap).
- **Phase 3 parity-fix pass — commit `f0b7783` (after `6becf75`).** User reported the sheet
  "looks broken / missing things / behavior differs" vs the old HTML app. Two read-only
  parity audits (CSS/layout + behavior) found and fixed:
  - **FONTS (the big one — root cause of "looks broken"):** `--sans`/`--mono` referenced
    `'Geist Sans'`/`'Geist Mono'` which were NEVER loaded → whole app rendered in system
    fonts. Fix: `@fontsource-variable/geist-mono` added; `--sans` → `'Geist Variable'`,
    `--mono` → `'Geist Mono Variable'` (both loaded via index.css).
  - **Sheet-screen topbar parity:** old `openFile` hides logo, "Sheet Submit" title,
    conn-status pill and gear/profile button on the sheet screen (`sheet.js:53-57`); the
    new Topbar showed all of them. Now hidden via `style={{display:"none"}}` when
    `isFilePage` (health polling keeps running; gear panel closes on entering the file page).
  - **Sheet title button now opens the Rename modal** (old `sheet.js:2203`); commit →
    `PUT /files/:id` + store `file.name` update. Truncation uses `'...'` (old) not `'…'`.
  - **Check split button + dropdown now implemented** (was deferred; old app SHOWS it for
    fb_cookie — `checkBtnGroup` gated on `behavior.checkAccounts`): blue "Check" pill +
    chevron, `data-check="checking"` + `Checking...` label, `.warning` (amber) when dups,
    dropdown with **Auto-check toggle (functional: `ss_autoCheck` + `maybeAutoCheck` on
    cookies commit → `runCheck()`)** + admin-only "Page Check" section (persists
    `ss_waCheck`; actual WA flow still Phase 4). `runCheck()` ported: dup/invalid guards,
    rows-undo snapshot (`{type:'rows'}`), statuses via `behavior.checkAccounts`, apiLogs
    entries, `persist('check')`, result toast. Verified `/api/fb/check` works with the
    seeded session (returns `{valid,dead,uncertain}`).
  - **More menu now matches old item list:** Copy all data, Download xlsx, Upload xlsx,
    Merge, Versions (Phase-4 items show a "… — Phase 4" toast), separator, column toggles
    — with the old 14px inline SVG icons.
  - **Undo/redo glyphs:** old 18px SVG arrows (quoted from `index.html:190-195`) replace
    the `↺/↻` text glyphs.
  - **`#sheetView` port:** new `.sheet-view` class (flex:1 column, `min-height:0`,
    `overflow:hidden`, `position:relative`) replaces the ad-hoc Tailwind classes on the
    SheetPage root. `body.is-touch table.grid td.dc {overflow:visible}` ported (touch.css).
  - **Deferred still (documented):** Sync button (hidden in old for fb_cookie — no
    `syncRow`), WA check flow + auto-check Page-Check backend (Phase 4), real
    download/upload/merge/versions flows (Phase 4), log-popup cross-file-dup/WA sections
    (Phase 4). `--green` token stays real green `#16a34a` (PLAN §2 deliberate fix — old
    was teal; the conn pill/log status colors differ from old BY DESIGN).
  - Verified: web `tsc` + `vite build` clean (Geist Mono woff2s now in the bundle);
    `/api/fb/check` + auth OK on the smoke env. **Browser re-verification is the user's**
    — see checklist below.
- **Phase 3 (Sheet engine) complete — commit `6becf75`:**
  - `stores/sheetStore.ts` (zustand, ~900 ln): faithful port of old `sheet.js` state machine —
    openFile (4 parallel fetches + cross-dups, 100-row pad, `ss_cols_<id>` visible cols),
    commitCell (single commit pipeline: immutable row update → `onCellChange` → dup/invalid
    marks → 300ms-debounced persist), undo/redo (client stacks, `{undo,redo}` ride every
    persist; capped 100), QEB (open/draft/commit/cancel/paste/clear), **keyboard nav
    `moveEdit` (NEW — user-approved)**, selection mode (tap-hold 500ms + vibrate, row/col/
    cell toggle, select-all, copy TSV, delete, `selRows`/`selCols` derived flags),
    addRow (+100), double/triple tap, dot TOTP + logs, `toggleVisibleCol`.
  - Components: `SheetGrid` (memo'd `GridRow`/`GridCell` w/ per-cell zustand selectors —
    typing only re-renders the active cell; table = old DOM structure exactly; delegation:
    click/dblclick/triple-tap 400ms/pointer-hold 500ms; dot-hold log popup), `QuickEditBar`
    + `CellEditor` (Enter/Tab/arrows/Escape), `SelectionBar`, `SheetToolbar` (undo/redo +
    ⋮ more menu: Copy all + column toggles; Phase-4 items not yet rendered), `SheetPage`
    (open/close file, `usePersist`, global Escape, boneyard `<Skeleton name="sheet-grid">`).
  - Hooks: `usePersist` (beforeunload flush), `useUndoRedo`, `useDebounce`. `useCheck` still empty (Phase 4).
  - Filetypes: `features/filetypes/{totp,validation,fbcookie,index}.ts` (TOTP WebCrypto SHA-1
    + cache, validateCell, onCellChange w/ uid autofill, onDotDoubleTap, onDotHold,
    checkAccounts ported for Phase 4). `lib/toast.tsx` gained module-level `toast()` so
    non-React store code can toast; `lib/utils.ts` gained `vibrate`.
  - **Boneyard skeleton loading** (user-requested): `boneyard-js` dep + vite plugin
    (`skipInitial: true`), `src/bones/sheet-grid.bones.json` (126 bones, 6 breakpoints)
    + generated `registry.ts` **committed**. Capture recipe below (§6).
  - **Deviations from old app (deliberate, user-approved):** keyboard nav in QEB
    (Tab/Shift+Tab/arrows/Enter=commit+down); clicking a DIFFERENT cell while QEB open
    commits the draft (old silently discarded it); dot colors map to real `--cyan`/`--green`
    tokens; sheet toolbar hidden off the file page.
  - Verified by me: web+server `tsc` clean, `bun run --cwd apps/web build` clean. Smoke
    test (throwaway Redis, session `smoke` → user `smoke1`, file `smoke` w/ 4 data rows):
    grid renders 100 rows + dup/yellow dots + seeded data; QEB opens; Enter commits +
    moves down; Tab moves right; Escape closes; undo/redo round-trip; **reload → edits
    persist**; `ss:undo:smoke`/`ss:rows:smoke` byte-correct (trim to max(lastData+51,100));
    row selection (3 cells, `.row-selected`/`.ms-sel`), Copy → TSV on clipboard,
    "Copied 3 cells"; ⋮ menu opens w/ Copy all + column toggles.
  - **KNOWN GAP — user must finish browser verification** (I'm not allowed to drive the
    browser): column-toggle hide (was mid-test when a gear-panel/⋮ overlap bug was found
    and fixed — retest), dot-click TOTP toast, dot-hold log popup, triple-tap, delete
    selected, and the **screenshot diff vs old app** (Phase-3 done-criteria "grid pixels
    match" — old app can run against the same seeded Redis: from old repo
    `bun run` with `REDIS_URL=redis://localhost:6390 PORT=3999`).
  - **Smoke environment is still RUNNING** for the user: Express :3000 (serves latest
    `dist/`), Vite dev :5173, Redis `ss-smoke-redis` container on :6390 with seeded
    session. Log in via devtools: Application → Cookies → add `session=smoke` for
    `localhost`, then open `http://localhost:3000/file/smoke` (or :5173 for HMR). Stop
    later: `docker rm -f ss-smoke-redis`, kill processes on :3000/:5173, delete temp
    `.env` (gitignored).
- **Phase 2 recap (historical) — commit `b67be36`:**
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
- Phases 4–6 not started.

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
- **Build UI from shadcn pre-built components (https://ui.shadcn.com/docs), modify — don't hand-roll.** Before writing any new UI, check the shadcn catalog for a ready component (Button, Input, Dialog, DropdownMenu, Tooltip, Skeleton, Table, etc.), `npx shadcn@latest add <name>` it, then customize minimally (className/variants/composition, Geist tokens). Exception: old-app-specific widgets whose pixel-parity CSS is already ported to `app.css` (grid table/cells, QEB, sel-bar, log-popup, sheet-more-menu, row-dots) stay custom — re-styling shadcn primitives to match would cost more than ported CSS. Phase 4+ overlays (version modal, download filter dialog, upload/merge, admin) should use shadcn Dialog/DropdownMenu/Input as their base.
- **Boneyard capture recipe (Phase 3+):** deps: `boneyard-js` (Vite plugin, `skipInitial: true` — no browser at dev-start). To (re)capture grid skeleton bones: (1) run the seeded-Redis server + `bun run dev:web`; (2) `boneyard.config.json` (apps/web) must hold `auth.cookies` with a `path: "/"` — **missing `path` makes the CLI crash** with "Cookie should have a url or a domain/path pair"; cookie value must match a seeded `ss:session:<value>`; (3) `cd apps/web && npx boneyard-js build http://localhost:5173/file/<id> --out ./src/bones` → writes `<name>.bones.json` + regenerates `registry.ts` (it imports `registerBones` from `'boneyard-js'` root, NOT `/react`). Commit both. The generated registry is a build input — `vite build` fails if `src/bones/registry.ts` is missing.
- **`<Skeleton>` only marks while mounted:** SheetPage returns the boneyard skeleton for `status !== ready` AND adds a `__BONEYARD_BUILD`-mode branch that renders the skeleton+fixture even after load, so the capture always finds the `[data-boneyard]` marker. Without that branch the marker unmounts before the capture snapshots (0 skeletons captured).
- **Fonts must stay loaded:** `--sans`/`--mono` in `app.css` point at `'Geist Variable'` /
  `'Geist Mono Variable'` (loaded via `@fontsource-variable/geist` + `geist-mono` imports
  in `index.css`). If anyone renames the tokens back to `'Geist Sans'`/`'Geist Mono'` the
  app silently falls back to system fonts (the "looks broken" bug from the Phase-3 parity pass).
- **Topbar on the sheet screen:** old app hides logo / home title / conn pill / gear button
  (`sheet.js:53-57`); Topbar mirrors that with `display:none` when `isFilePage`. The health
  poll keeps running. The sheet-title button opens the rename modal (store `file.name`
  update via `useSheetStore.setState`).
- **Check button is part of Phase 3** (old shows it for fb_cookie): `runCheck()` in the
  store (dup/invalid guards, rows-undo snapshot, `checkAccounts`, apiLogs entries,
  `persist('check')`, toast) + Auto-check via `ss_autoCheck` + `maybeAutoCheck` on cookies
  commit. Remaining check-related Phase-4 work: WA follow-up (`runWaChecks`, `/fb/wa-check`
  + `ss:wa:` cache — the admin "Page Check" toggle already persists `ss_waCheck` but is a
  no-op until then) and the Sync button (hidden for fb_cookie anyway).
- **Sheet toolbar vs gear panel:** the ⋮ (`sheet-more-btn`) handler must NOT `stopPropagation()` — if it does, Topbar's click-outside listener never fires and the gear panel stays open, overlapping the more menu (gear z-800 > menu z-600) and intercepting clicks. SheetToolbar's own doc listener exempts the ⋮ button + menu via `contains()`. If both menus change, retest the overlap.
- **QEB draft vs other cells:** the live-preview draft lives in the store; only the ACTIVE `GridCell` subscribes to it (selector returns `null` for other cells) so typing re-renders exactly one cell. Rows must be updated immutably (row object replaced) or memo'd cells never re-render.
- **`Row` type widened** to `Record<string, string | null | undefined>` in BOTH `apps/web/src/lib/types.ts` and `packages/shared/src/types.ts` (real data has `wa_ban_reason: null`; old type would crash at runtime on `null`).
- **`openFile` race guard:** module-level `openSeq` counter — a stale in-flight `openFile` result (fast file-to-file navigation or unmount mid-fetch) is discarded (`seq !== openSeq` → return). `closeFile()` bumps the counter too.
- **Phase-3 deviations logged:** QEB keyboard nav (Enter=commit+down, Tab/Shift+Tab, arrows) is NEW (user-approved; old app had Enter/Escape only); clicking a different cell while QEB open COMMITS the draft (old discarded it — data-loss bug); log-popup cross-file dup section deferred to Phase 4 (store `onDotHold` returns only logs+label); `checkAccounts` ported but its apiLogs pushes are omitted until Phase 4 wires the check flow; `useCheck.ts` still empty.
- **Skeleton loading screens: `boneyard-js`** (https://github.com/0xGF/boneyard,
  MIT, 6.8k★ — pixel-perfect skeletons captured from real UI, no manual
  measurement). Added at user request; related to the sheet loading state
  (Phase 3 — the old app had no loader, just a blank 100-row pad). Integration:
  `<Skeleton name=...>` from `boneyard-js/react` wraps the grid; `boneyardPlugin()`
  in `vite.config.ts`; `import "./bones/registry"` in `main.tsx`. The Vite plugin
  supports `boneyard.config.json` `auth.cookies` + `routes` — capture recipe:
  seeded throwaway Redis session (smoke-test recipe) → run `bun run dev:web` →
  plugin captures `/file/<id>` at 375/768/1280px and writes `apps/web/src/bones/*.bones.json`
  + `registry.tsx` (commit them!). Without bones, `<Skeleton>` falls back to the
  `fallback` prop, so runtime is safe pre-capture. `apply: "serve"` only — capture
  happens on the dev server, never during `vite build`. Grid skeleton bones are
  deterministic (36px rows) so a hand-authored `.bones.json` is a valid fallback.
- **Phase 4 overlay pattern (decision):** version modal, download chooser and
  upload-mode modal use the PORTED old-app CSS classes (`.modal-overlay`/`.modal-box`,
  `.version-*`, `.vdiff-*`, `.download-opt-*`) — NOT shadcn Dialog. Rationale: the
  Phase-2/3 codebase already uses `.modal-overlay`/`.modal-box` (confirm.tsx, HomePage,
  Topbar), and the old DOM/CSS ports give byte-parity markup + pixel parity for free
  (shadcn Dialog would need full re-styling anyway). This deviates from the earlier
  gotcha suggestion ("Phase 4+ overlays should use shadcn Dialog") — the old-app-specific
  widgets fall under that gotcha's own ported-CSS exception.
- **`#versionOverlay .modal-box` width gotcha:** the old CSS has `width: 440px;
  max-width: calc(100vw - 40px)` for the version modal box. The Phase-4 CSS port
  (subagent) MISSED this rule (only ported `.vdiff*` selectors under `#versionOverlay`),
  and the version list renders at the default 320px `.modal-box` width without it. It was
  added manually to app.css — if someone re-runs a CSS port, do NOT drop it.
- **Version rename fix over old app:** old `startVersionRename` re-rendered the list from
  the STALE `_versionMeta` (ignored the server's returned meta) so the new name only
  appeared after reopening the modal. New app updates `meta` from the API response
  (`nameVersion` returns `{ok, meta}`) — same-or-better, deliberate deviation.
- **WA-after-check version behavior (parity):** because `persist()` is a shared 300ms
  debounce where the LAST call's action wins, running WA checks after a check silently
  drops the `'check'` action (no version snapshot). This is EXACTLY the old app's
  behavior (old `runWaChecks` also calls `persist()` afterwards). Do not "fix" this
  without re-checking the old app's history.
- **`Row` type + WA fields:** `Row` is `Record<string, string | null | undefined>` so
  `wa_status`/`wa_ban_reason` ride along freely; `wa_ban_reason` is `null` when absent
  (real data has `null` — the widened type already handles it).
- **Version rows cache** lives in `stores/versionCache.ts`, keyed per `fileId` (old app
  cached per version number globally and could show another file's rows — fixed silently).
  `dedupKeyForRow` is exported from `sheetStore.ts` (used by merge, summaries, diff).
- **Smoke env for Phase 4+:** server runs on `:3999` (temp repo-root `.env`:
  `PORT=3999`, `REDIS_URL=redis://localhost:6390`; gitignored) serving latest
  `apps/web/dist`. Redis container `ss-smoke-redis` (:6390) has session `smoke` (user
  `smoke1`, admin), file `smoke` with 2 data rows + 3 history versions. Login: devtools
  cookie `session=smoke` for `localhost`. Stop later: kill PID from
  `Get-CimInstance Win32_Process | where CommandLine -match "server/src/index.ts"`,
  `docker rm -f ss-smoke-redis`, delete `.env`.
- **Bubble mode entry contract:** `/?bubble=1&file=<id>` ONLY activates when
  `window.Android` exists (the Android WebView bridge). Desktop browsers will never see
  bubble mode — good for testing the normal app. To test bubble locally, inject a fake
  `window.Android` via Playwright `addInitScript` BEFORE navigation (see Phase-5 recap).
  `BubbleMode` is wrapped in `<MemoryRouter>` because `SheetToolbar`→`VersionHistory`
  uses `useNavigate` (no browser router in bubble mode).
- **`window.__ss` globals:** BubbleMode exposes `window.__ss.bubbleSkipNo2FA` and
  `window.__ss.bubbleAutomate` (Android bridge contract) and cleans them up on unmount.
  Do not rename — FloatingBubbleService.java injects these exact names.
- **Phase 6 decision — old repo is PROTECTED:** the user cancelled the planned
  "delete old frontend" step. B:\Studio\Tools\SheetSubmit stays as-is (reference +
  Android CI). Do not delete/modify it; AGENTS.md rule 7 applies permanently.
- **a11y convention going forward:** icon-only buttons get `aria-label` (+`title` kept
  for tooltips); clickable divs that can't become `<button>` (parity CSS) get
  `role="button"`/`tabIndex={0}` + Enter/Space `onKeyDown`; modal inputs get
  `aria-label`. `color-scheme` lives in `:root`/`.dark` (app.css) AND inline via
  theme.ts — keep both in sync when touching theme code.

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
