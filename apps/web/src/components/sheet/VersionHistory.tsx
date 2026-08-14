import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
import { dedupKeyForRow, useSheetStore } from "@/stores/sheetStore";
import { getCachedVersionRows, getVersionRows } from "@/stores/versionCache";
import type { VersionMeta } from "@/lib/types";
import DiffView from "./DiffView";

const PAGE_SIZE = 50;
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const ACTION_LABELS: Record<string, string> = {
  edit: "Edit",
  replace: "Replace",
  append: "Append",
  merge: "Merge",
  restore: "Restore",
  check: "Check",
  sync: "Sync",
  import: "Import",
};

function fmtVersionTime(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  let rel: string;
  if (diff < 60000) rel = "just now";
  else if (diff < 3600000) rel = Math.floor(diff / 60000) + " min ago";
  else if (diff < 86400000) rel = Math.floor(diff / 3600000) + " hr ago";
  else
    rel =
      Math.floor(diff / 86400000) +
      " day" +
      (Math.floor(diff / 86400000) > 1 ? "s" : "") +
      " ago";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getDate() +
    " " +
    MONTHS[d.getMonth()] +
    " " +
    d.getFullYear() +
    ", " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    "  (" +
    rel +
    ")"
  );
}

function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function fmtDayHeader(ts: number): string {
  const d = new Date(ts);
  return WEEK[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
}

function computeSummary(rec: VersionMeta, prev: VersionMeta | null, fileId: string): string {
  if (!prev) {
    return (
      "Created file with " +
      rec.rowCount +
      " row" +
      (rec.rowCount === 1 ? "" : "s")
    );
  }
  const cur = getCachedVersionRows(fileId, rec.v);
  const old = getCachedVersionRows(fileId, prev.v);
  if (cur && old && cur.keys.size && old.keys.size) {
    let added = 0;
    let removed = 0;
    cur.keys.forEach((k) => {
      if (!old.keys.has(k)) added++;
    });
    old.keys.forEach((k) => {
      if (!cur.keys.has(k)) removed++;
    });
    let waChanged = 0;
    const oldByKey = new Map<string, unknown>();
    old.rows.forEach((r) => {
      const k = dedupKeyForRow(r);
      if (k !== null && k !== undefined) oldByKey.set(String(k), r);
    });
    cur.rows.forEach((r) => {
      const k = dedupKeyForRow(r);
      if (k === null || k === undefined) return;
      const o = oldByKey.get(String(k)) as { wa_status?: string } | undefined;
      if (o && (o.wa_status || "") !== (r.wa_status || "")) waChanged++;
    });
    const delta = (rec.rowCount ?? 0) - (prev.rowCount ?? 0);
    const parts: string[] = [];
    if (added) {
      parts.push(
        "Added " +
          added +
          " row" +
          (added === 1 ? "" : "s") +
          " (" +
          added +
          " new uid" +
          (added === 1 ? "" : "s") +
          ")",
      );
    }
    if (removed) {
      parts.push("Removed " + removed + " row" + (removed === 1 ? "" : "s"));
    }
    if (waChanged) {
      parts.push(
        "Changed wa_status on " + waChanged + " row" + (waChanged === 1 ? "" : "s"),
      );
    }
    if (!parts.length) {
      if (delta !== 0) {
        return "Full replace " + prev.rowCount + "→" + rec.rowCount + " rows";
      }
      return "Same rows (" + rec.rowCount + ")";
    }
    return parts.join(", ");
  }
  if (rec.rowCount !== prev.rowCount) {
    const d = (rec.rowCount ?? 0) - (prev.rowCount ?? 0);
    if (d > 0) return "+" + d + " rows";
    return d + " rows";
  }
  return "Same row count (" + rec.rowCount + " rows)";
}

function detailText(rec: VersionMeta, prev: VersionMeta | null): string {
  if (!prev) {
    return (
      "Created file with " +
      rec.rowCount +
      " row" +
      (rec.rowCount === 1 ? "" : "s") +
      " · " +
      rec.rowCount +
      " rows"
    );
  }
  const delta = (rec.rowCount ?? 0) - (prev.rowCount ?? 0);
  const txt =
    delta >= 0
      ? "Added " + delta + " row" + (delta === 1 ? "" : "s")
      : "Removed " + -delta + " row" + (delta === -1 ? "" : "s");
  return txt + " · " + rec.rowCount + " rows";
}

function deltaTxt(rec: VersionMeta, prev: VersionMeta): string {
  const delta = (rec.rowCount ?? 0) - (prev.rowCount ?? 0);
  return delta > 0 ? "+" + delta : String(delta);
}

interface ItemProps {
  rec: VersionMeta;
  prev: VersionMeta | null;
  fileId: string;
  fileName: string;
  typeName: string;
  summary: string;
  previewV: number | null;
  renaming: { v: number; name: string } | null;
  onPreview: () => void;
  onRestore: () => void;
  onFork: () => void;
  onStartRename: () => void;
  onRenameChange: (name: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

function VersionItem(props: ItemProps) {
  const {
    rec,
    prev,
    fileId,
    fileName,
    typeName,
    summary,
    previewV,
    renaming,
  } = props;
  const isRenaming = renaming?.v === rec.v;
  const badgeClass =
    rec.action === "restore"
      ? " restore"
      : rec.action === "replace" || rec.action === "merge"
        ? " replace"
        : "";
  return (
    <div className={"version-item" + (previewV === rec.v ? " open" : "")}>
      <div className="version-head">
        <div className="version-meta">
          {rec.name && !isRenaming ? (
            <div className="version-name-row">
              <span className="version-name">{rec.name}</span>
              <button
                className="version-rename-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onStartRename();
                }}
              >
                Rename
              </button>
            </div>
          ) : null}
          {isRenaming ? (
            <div className="version-name-row">
              <input
                className="version-name-input"
                value={renaming.name}
                placeholder="Version name"
                aria-label="Version name"
                autoFocus
                onChange={(e) => props.onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    props.onRenameCommit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    props.onRenameCancel();
                  }
                }}
                onBlur={props.onRenameCommit}
              />
            </div>
          ) : null}
          <div className="version-time">{fmtVersionTime(rec.ts)}</div>
          <div className="version-summary">{summary}</div>
          <div className="version-detail">{detailText(rec, prev)}</div>
        </div>
        <span className={"version-badge" + badgeClass}>
          [{prev ? deltaTxt(rec, prev) : "New"}] {ACTION_LABELS[rec.action] ?? rec.action}
        </span>
      </div>
      <div className="version-footer-actions">
        <button
          className="version-fork-btn"
          onClick={(e) => {
            e.stopPropagation();
            props.onFork();
          }}
        >
          Copy version
        </button>
        <span className="spacer"></span>
        <button
          className="btn btn-ghost btn-sm version-preview-btn"
          onClick={(e) => {
            e.stopPropagation();
            props.onPreview();
          }}
        >
          Preview
        </button>
        <button
          className="btn btn-danger btn-sm version-restore-btn"
          onClick={(e) => {
            e.stopPropagation();
            props.onRestore();
          }}
        >
          Restore
        </button>
      </div>
      {previewV === rec.v ? (
        <DiffView
          fileId={fileId}
          rec={rec}
          prev={prev}
          fileName={fileName}
          typeName={typeName}
        />
      ) : null}
    </div>
  );
}

export default function VersionHistory({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const fileId = useSheetStore((s) => s.fileId);
  const fileName = useSheetStore((s) => s.file?.name ?? "file");
  const typeName = useSheetStore((s) => s.file?.type ?? "fb_cookie");
  const restoreVersion = useSheetStore((s) => s.restoreVersion);
  const confirm = useConfirm();
  const showToast = useToast();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<VersionMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({});
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [previewV, setPreviewV] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ v: number; name: string } | null>(null);
  const renamingDone = useRef(false);

  useEffect(() => {
    if (!open || !fileId) return;
    setMeta(null);
    setLoadError(false);
    setPage(1);
    setGroupsOpen({});
    setSummaries({});
    setPreviewV(null);
    setRenaming(null);
    renamingDone.current = false;
    api
      .getHistory(fileId)
      .then((m) => setMeta(m ?? []))
      .catch(() => {
        setLoadError(true);
        setMeta([]);
      });
  }, [open, fileId]);

  const pageItems = useMemo(() => {
    if (!meta || !meta.length) return [];
    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, meta.length);
    const items: { rec: VersionMeta; prev: VersionMeta | null }[] = [];
    for (let i = start; i < end; i++) {
      items.push({ rec: meta[i], prev: meta[i + 1] ?? null });
    }
    return items;
  }, [meta, page]);

  const groups = useMemo(() => {
    const out: {
      key: string;
      label: string;
      items: { rec: VersionMeta; prev: VersionMeta | null }[];
    }[] = [];
    pageItems.forEach((it) => {
      const key = dayKeyOf(it.rec.ts);
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: fmtDayHeader(it.rec.ts), items: [] };
        out.push(g);
      }
      g.items.push(it);
    });
    return out;
  }, [pageItems]);

  useEffect(() => {
    if (!fileId || !meta?.length) return;
    const upd: Record<string, string> = {};
    pageItems.forEach((it) => {
      upd["v" + it.rec.v] = computeSummary(it.rec, it.prev, fileId);
    });
    setSummaries(upd);
    pageItems.forEach((it) => {
      void getVersionRows(fileId, it.rec.v).then(() => {
        setSummaries((old) => ({
          ...old,
          ["v" + it.rec.v]: computeSummary(it.rec, it.prev, fileId),
        }));
      });
    });
  }, [fileId, meta, pageItems]);

  if (!open || !fileId) return null;

  const total = meta?.length ?? 0;
  const pages = total ? Math.ceil(total / PAGE_SIZE) : 1;
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  const startRename = (rec: VersionMeta) => {
    renamingDone.current = false;
    setRenaming({ v: rec.v, name: rec.name ?? "" });
  };
  const commitRename = () => {
    if (renamingDone.current) return;
    const r = renaming;
    if (!r) return;
    renamingDone.current = true;
    api
      .nameVersion(fileId, r.v, r.name)
      .then((res) => {
        showToast(r.name ? "Version renamed" : "Version name cleared");
        if (res?.meta) setMeta(res.meta);
        setRenaming(null);
      })
      .catch(() => {
        showToast("Rename failed");
        setRenaming(null);
      });
  };
  const cancelRename = () => {
    if (renamingDone.current) return;
    renamingDone.current = true;
    setRenaming(null);
  };

  const restore = async (rec: VersionMeta) => {
    const ok = await confirm(
      "Restore version from " +
        fmtVersionTime(rec.ts).split("  (")[0] +
        "? Current rows will be replaced.",
      "Restore",
    );
    if (!ok) return;
    if (await restoreVersion(rec.v)) onClose();
  };

  const fork = async (rec: VersionMeta) => {
    const ok = await confirm("Copy this version into a new file?", "Copy");
    if (!ok) return;
    try {
      const res = await api.forkVersion(fileId, rec.v);
      const newId =
        res?.file?.id ??
        (res as { fileId?: string } | null)?.fileId ??
        (res as { id?: string } | null)?.id;
      if (!newId) {
        showToast("Fork failed");
        return;
      }
      onClose();
      showToast("Forked to new file");
      navigate("/file/" + newId);
    } catch {
      showToast("Fork failed");
    }
  };

  return (
    <div
      className="modal-overlay open"
      id="versionOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <div className="modal-title">Version history</div>
        <div className="version-list">
          {meta === null ? (
            <div className="version-empty">Loading…</div>
          ) : loadError ? (
            <div className="version-empty">Could not load history</div>
          ) : total === 0 ? (
            <div className="version-empty">
              No versions yet - actions like replace, append, merge, check and sync
              are saved here.
            </div>
          ) : (
            <>
              <div className="version-pager">
                <span className="version-pager-info">
                  {"Page " +
                    page +
                    " of " +
                    pages +
                    " · " +
                    from +
                    "-" +
                    to +
                    " of " +
                    total}
                </span>
                <span className="version-pager-btns">
                  <button
                    className="version-page-btn"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    ← Prev
                  </button>
                  <button
                    className="version-page-btn"
                    disabled={page >= pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next →
                  </button>
                </span>
              </div>
              {groups.map((g) => (
                <div
                  key={g.key}
                  className={
                    "version-day-group" +
                    (groupsOpen[g.key] !== false ? " open" : "")
                  }
                >
                  <div
                    className="version-day"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setGroupsOpen((old) => ({
                        ...old,
                        [g.key]: old[g.key] !== false ? false : true,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setGroupsOpen((old) => ({
                          ...old,
                          [g.key]: old[g.key] !== false ? false : true,
                        }));
                      }
                    }}
                  >
                    <span className="version-day-label">{g.label}</span>
                    <span className="version-day-count">
                      {g.items.length === 1
                        ? "1 version"
                        : g.items.length + " versions"}
                    </span>
                  </div>
                  {g.items.map((it) => (
                    <VersionItem
                      key={it.rec.v}
                      rec={it.rec}
                      prev={it.prev}
                      fileId={fileId}
                      fileName={fileName}
                      typeName={typeName}
                      summary={summaries["v" + it.rec.v] ?? computeSummary(it.rec, it.prev, fileId)}
                      previewV={previewV}
                      renaming={renaming}
                      onPreview={() =>
                        setPreviewV((p) => (p === it.rec.v ? null : it.rec.v))
                      }
                      onRestore={() => void restore(it.rec)}
                      onFork={() => void fork(it.rec)}
                      onStartRename={() => startRename(it.rec)}
                      onRenameChange={(name) =>
                        setRenaming((r) => (r ? { v: r.v, name } : r))
                      }
                      onRenameCommit={commitRename}
                      onRenameCancel={cancelRename}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
