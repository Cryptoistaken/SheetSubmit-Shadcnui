import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { FILE_TYPE_DEFS } from "@/lib/types";
import { genId, todayStr } from "@/lib/xlsx";
import type { SheetFile } from "@/lib/types";

function getAndroid(): { enableBubble?: (id: string) => void } | null {
  try {
    return (window as unknown as { Android?: { enableBubble?: (id: string) => void } }).Android ?? null;
  } catch {
    return null;
  }
}

export default function BubblePicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<SheetFile[] | null>(null);
  const [err, setErr] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!open) return;
    setFiles(null);
    setErr(false);
    api
      .getFiles()
      .then((fs) => setFiles((fs ?? []).filter((f) => f.type === "fb_cookie")))
      .catch(() => setErr(true));
  }, [open]);

  if (!open) return null;

  const enable = (id: string, name: string) => {
    try {
      getAndroid()?.enableBubble?.(id);
    } catch {
      // bridge may be gone — still show success
    }
    showToast("Floating bubble on - " + name);
    onClose();
  };

  const createNew = async () => {
    const name = FILE_TYPE_DEFS.fb_cookie.label + " " + todayStr();
    const id = genId();
    try {
      await api.createFile({ id, name, type: "fb_cookie" });
      const fs = await api.getFiles().catch(() => null);
      const newest = (fs ?? [])[0];
      if (newest) enable(newest.id, newest.name);
    } catch {
      showToast("Could not create file");
      onClose();
    }
  };

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <div className="modal-title" style={{ marginBottom: 6 }}>
          Floating bubble
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text2)",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          Choose a Facebook file to show in the mini window
        </div>
        <div className="bubble-picker">
          {err ? (
            <div className="bubble-picker-empty">Could not load files</div>
          ) : files === null ? (
            <div className="bubble-picker-empty">Loading…</div>
          ) : files.length === 0 ? (
            <div className="bubble-picker-empty">
              No Facebook files yet - create one below
            </div>
          ) : (
            files.map((f) => (
              <button
                key={f.id}
                className="home-fab-item"
                onClick={() => enable(f.id, f.name)}
              >
                <span className="home-fab-ic t-fb">FB</span>
                <span>
                  <span className="home-fab-name">{f.name}</span>
                  <span className="home-fab-desc">
                    {new Date(f.updatedAt || Date.now()).toLocaleString()}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="home-fab-sep"></div>
        <button className="home-fab-item" onClick={() => void createNew()}>
          <span className="home-fab-ic t-fb">+</span>
          <span>
            <span className="home-fab-name">Create new Facebook file</span>
            <span className="home-fab-desc">
              Make a fresh file for the bubble
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
