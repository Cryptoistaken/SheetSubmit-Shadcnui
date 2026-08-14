import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Old server loaded its repo-root `.env`; mirror that by loading the monorepo
// root `.env` (falls back to process env if absent).
// NOTE: this file is at <root>/apps/server/src/config/env.ts → FOUR levels up
// to the monorepo root (config → src → server → apps → root).
const repoRoot = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env") });

export const PORT = parseInt(process.env.PORT || "3000", 10);

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
export const REDIS_BACKUP_URL = process.env.REDIS_BACKUP_URL || "";

export const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || "";
export const ADMIN_IDS = (process.env.ADMIN_IDS || "8447133985,1772093705")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || "";
export const APP_URL = RAILWAY_PUBLIC_DOMAIN
  ? "https://" + RAILWAY_PUBLIC_DOMAIN
  : process.env.APP_URL || `http://localhost:${PORT}`;

export const HISTORY_RETENTION_DAYS = parseInt(process.env.HISTORY_RETENTION_DAYS || "30", 10);
export const HISTORY_CHECKPOINT_EVERY = parseInt(process.env.HISTORY_CHECKPOINT_EVERY || "20", 10);
export const HISTORY_GC_INTERVAL_MS =
  parseInt(process.env.HISTORY_GC_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10);

export const WA_CACHE_TTL_MS = (parseInt(process.env.WA_CACHE_TTL_HOURS || "0", 10) || 0) * 60 * 60 * 1000;

export const BACKUP_INTERVAL_MS = (parseInt(process.env.BACKUP_INTERVAL || "5", 10) || 5) * 60 * 1000;

// Directory served as static root (old server: old repo root; new default:
// the built web app). Set STATIC_ROOT to the old repo root for parity testing.
export const STATIC_ROOT =
  process.env.STATIC_ROOT || path.join(repoRoot, "apps", "web", "dist");
