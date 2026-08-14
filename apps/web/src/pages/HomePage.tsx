import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";

import AdminView from "@/components/home/AdminView";
import ArchiveView from "@/components/home/ArchiveView";
import Fab from "@/components/home/Fab";
import FileGrid from "@/components/home/FileGrid";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
import { FILE_TYPE_DEFS } from "@/lib/types";
import type { FileType, SheetFile } from "@/lib/types";
import { downloadXlsx, genId, hydrateWaCache, importXlsx, todayStr } from "@/lib/xlsx";

type Tab = "files" | "archive" | "admin";

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const showToast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>("files");
  const [files, setFiles] = useState<SheetFile[] | null>(null);
  const [dupCounts, setDupCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const selectionMode = selected.size > 0;

  const loadFiles = useCallback(async () => {
    const [fs, cd] = await Promise.all([api.getFiles(), api.getCrossDups()]);
    setFiles(fs);
    setDupCounts(cd.counts ?? {});
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const openFile = (id: string) => navigate("/file/" + id);

  const downloadFile = async (f: SheetFile) => {
    const rows = await api.getRows(f.id);
    if (!rows || !rows.length) {
      showToast("No data");
      return;
    }
    downloadXlsx(rows, FILE_TYPE_DEFS[f.type].columns, f.name);
    showToast("Downloaded");
  };

  const deleteFile = async (f: SheetFile) => {
    const ok = await confirm("Move this file to archive?", "Archive");
    if (!ok) return;
    await api.deleteFile(f.id);
    loadFiles();
    showToast("File archived");
  };

  const openRename = (f: SheetFile) => {
    setRenameFileId(f.id);
    setRenameName(f.name);
  };

  const closeRename = () => {
    setRenameFileId(null);
    setRenameName("");
  };

  const commitRename = async () => {
    const name = renameName.trim();
    if (!name) {
      showToast("Name cannot be empty");
      return;
    }
    if (!renameFileId) return;
    await api.updateFile(renameFileId, { name });
    closeRename();
    loadFiles();
    showToast("Renamed");
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const holdSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.size === 0) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (files) setSelected(new Set(files.map((f) => f.id)));
  };

  const unselectAll = () => setSelected(new Set());

  const deleteSelected = async () => {
    if (!selectionMode) return;
    const ids = Array.from(selected);
    const ok = await confirm(
      "Move " + ids.length + " file" + (ids.length > 1 ? "s" : "") + " to archive?",
      "Archive",
    );
    if (!ok) return;
    await Promise.all(ids.map((id) => api.deleteFile(id)));
    setSelected(new Set());
    loadFiles();
    showToast(ids.length + " file" + (ids.length > 1 ? "s" : "") + " archived");
  };

  const createFile = async (type: FileType) => {
    const name = FILE_TYPE_DEFS[type].label + " " + todayStr();
    const current = files ?? (await api.getFiles());
    let finalName = name;
    if (current.some((f) => f.name === name)) {
      let suffix = 2;
      while (current.some((f) => f.name === name + " (" + suffix + ")")) suffix++;
      finalName = name + " (" + suffix + ")";
    }
    const id = genId();
    await api.createFile({ id, name: finalName, type });
    showToast(FILE_TYPE_DEFS[type].label + " file created");
    navigate("/file/" + id);
  };

  const uploadFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const current = files ?? (await api.getFiles());
    const result = await importXlsx(buf, file.name, current);
    await hydrateWaCache(result.rows);
    await api.createFile({ id: result.id, name: result.name, type: result.type });
    await api.persist(result.id, {
      rows: result.rows,
      dataCount: result.dataCount,
      action: "import",
    });
    showToast("Imported " + result.dataCount + " rows");
    navigate("/file/" + result.id);
  };

  return (
    <>
      <div className="home-tabs">
        <button
          className={`home-tab${tab === "files" ? " active" : ""}`}
          onClick={() => setTab("files")}
        >
          My Files
        </button>
        <button
          className={`home-tab${tab === "archive" ? " active" : ""}`}
          onClick={() => setTab("archive")}
        >
          Archive
        </button>
        {user?.isAdmin ? (
          <button
            className={`home-tab${tab === "admin" ? " active" : ""}`}
            onClick={() => setTab("admin")}
          >
            Admin
          </button>
        ) : null}
      </div>

      {tab === "files" ? (
        <div className="home-pane" id="homePaneFiles">
          {files !== null ? (
            <FileGrid
              files={files}
              crossDupCounts={dupCounts}
              selectedIds={selected}
              selectionMode={selectionMode}
              onOpen={openFile}
              onDownload={downloadFile}
              onRename={openRename}
              onDelete={deleteFile}
              onToggleSelect={toggleSelect}
              onHoldSelect={holdSelect}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "archive" ? (
        <div className="home-pane" id="homePaneArchive">
          <ArchiveView />
        </div>
      ) : null}

      {tab === "admin" && user?.isAdmin ? (
        <div className="home-pane" id="homePaneAdmin">
          <AdminView />
        </div>
      ) : null}

      <Fab onCreate={createFile} onUpload={uploadFile} />

      <div className={`sel-bar${selectionMode ? " open" : ""}`}>
        <span className="sel-bar-count">{selected.size} selected</span>
        <div className="sel-bar-actions">
          <button className="sel-btn" onClick={selectAll}>
            Select All
          </button>
          <button className="sel-btn" onClick={unselectAll}>
            Unselect All
          </button>
          <button className="sel-btn danger" onClick={deleteSelected}>
            Delete
          </button>
        </div>
      </div>

      <div
        className={`modal-overlay${renameFileId ? " open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeRename();
        }}
      >
        <div className="modal-box">
          <div className="modal-title">Rename file</div>
          <input
            className="modal-input"
            type="text"
            aria-label="File name"
            value={renameName}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                closeRename();
              }
            }}
          />
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={closeRename}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={commitRename}>
              Rename
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
