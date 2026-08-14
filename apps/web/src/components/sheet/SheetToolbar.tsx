import { useEffect, useRef, useState } from "react";

import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useToast } from "@/lib/toast";
import { useSheetStore } from "@/stores/sheetStore";

interface MenuPos {
  top: number;
  right: number;
}

export default function SheetToolbar() {
  const { canUndo, canRedo, undo, redo } = useUndoRedo();
  const showToast = useToast();
  const columns = useSheetStore((s) => s.columns);
  const visibleCols = useSheetStore((s) => s.visibleCols);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  const toggle = () => {
    const next = !open;
    if (next && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  const copyAll = () => {
    close();
    const s = useSheetStore.getState();
    if (!s.rows.length) {
      showToast("No data");
      return;
    }
    const cols = s.columns;
    const lines = [cols.map((c) => c.label).join("\t")];
    let hasData = false;
    for (const row of s.rows) {
      const isEmpty = cols.every((c) => !row[c.key]);
      if (!isEmpty) {
        hasData = true;
        lines.push(cols.map((c) => row[c.key] ?? "").join("\t"));
      }
    }
    if (!hasData) {
      showToast("No data");
      return;
    }
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => showToast(`Copied ${lines.length - 1} rows`))
      .catch(() => showToast("Cannot copy"));
  };

  return (
    <>
      <button
        className="undo-redo-btn"
        title="Undo"
        disabled={!canUndo}
        onClick={undo}
      >
        ↺
      </button>
      <button
        className="undo-redo-btn"
        title="Redo"
        disabled={!canRedo}
        onClick={redo}
      >
        ↻
      </button>
      <button
        ref={btnRef}
        className="sheet-more-btn"
        title="More actions"
        onClick={toggle}
      >
        ⋮
      </button>
      <div
        ref={menuRef}
        className={"sheet-more-menu" + (open ? " open" : "")}
        style={{ top: pos.top, right: pos.right }}
      >
        <button className="sheet-more-item" onClick={copyAll}>
          Copy all
        </button>
        <div className="sheet-more-sep"></div>
        {columns.map((col) => (
          <div
            key={col.key}
            className="sheet-more-col-item"
            onClick={() => {
              close();
              useSheetStore.getState().toggleVisibleCol(col.key);
            }}
          >
            <span
              className={"col-toggle" + (visibleCols.has(col.key) ? " on" : "")}
            ></span>
            {col.label}
          </div>
        ))}
      </div>
    </>
  );
}
