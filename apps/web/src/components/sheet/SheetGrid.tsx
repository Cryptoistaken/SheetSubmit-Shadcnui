import { memo, useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useSheetStore } from "@/stores/sheetStore";
import { vibrate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

interface ApiCall {
  type?: string;
  request?: string;
  response?: unknown;
}

interface ApiLog {
  status?: string;
  calls?: ApiCall[];
}

interface LogPopupState {
  logs: unknown[];
  label: string;
  x: number;
  y: number;
}

export default function SheetGrid() {
  const rows = useSheetStore((s) => s.rows);
  const columns = useSheetStore((s) => s.columns);
  const visibleCols = useSheetStore((s) => s.visibleCols);
  const selectionMode = useSheetStore((s) => s.selectionMode);
  const selCols = useSheetStore((s) => s.selCols);

  const displayCols = columns.filter((c) => visibleCols.has(c.key));

  const [logPopup, setLogPopup] = useState<LogPopupState | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActive = useRef(false);
  const clickCount = useRef(0);
  const clickTarget = useRef<Element | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ row: number; col: string; t: number } | null>(null);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!logPopup) return;
    const onDoc = (ev: MouseEvent) => {
      const node = popupRef.current;
      if (node && !node.contains(ev.target as Node)) setLogPopup(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [logPopup]);

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function handleClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (holdActive.current) {
      holdActive.current = false;
      return;
    }
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const td = t.closest("td.dc") as HTMLElement | null;
    const dot = t.closest(".dot-cell") as HTMLElement | null;
    const rh = t.closest("th.rh") as HTMLElement | null;
    const ch = t.closest("th.ch:not(.corner):not(.ch-dot)") as HTMLElement | null;
    const corner = t.closest("th.corner") as HTMLElement | null;

    if (corner) {
      useSheetStore.getState().selectAllCells();
      return;
    }

    const el = rh || ch || dot || td;
    if (!el) return;
    if (el !== clickTarget.current) {
      clickCount.current = 0;
      clickTarget.current = el;
    }
    clickCount.current++;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    if (clickCount.current === 3) {
      clickCount.current = 0;
      clickTarget.current = null;
      if (rh) {
        void useSheetStore.getState().tripleTapRow(Number(rh.dataset.row));
        return;
      }
      if (ch) {
        void useSheetStore.getState().tripleTapCol(ch.dataset.col ?? "");
        return;
      }
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickCount.current = 0;
      clickTarget.current = null;
    }, 400);

    const store = useSheetStore.getState();
    if (rh) {
      store.toggleSelection("row", Number(rh.dataset.row), null);
      return;
    }
    if (dot) {
      void store.onDotDoubleTap(Number(dot.dataset.row));
      return;
    }
    if (ch) {
      store.toggleSelection("col", 0, ch.dataset.col ?? "");
      return;
    }
    if (td) {
      const rowIdx = Number(td.dataset.row);
      const colKey = td.dataset.col ?? "";
      if (store.selectionMode) {
        store.toggleSelection("cell", rowIdx, colKey);
        return;
      }
      const now = Date.now();
      const last = lastTap.current;
      if (
        last &&
        last.row === rowIdx &&
        last.col === colKey &&
        now - last.t < 400
      ) {
        lastTap.current = null;
        useSheetStore.getState().cancelQuickEdit();
        void useSheetStore.getState().doubleTap(rowIdx, colKey);
        return;
      }
      lastTap.current = { row: rowIdx, col: colKey, t: now };
      if (
        store.qebOpen &&
        store.selectedCell &&
        (store.selectedCell.rowIdx !== rowIdx ||
          store.selectedCell.colIdx !== colKey)
      ) {
        store.commitQuickEdit();
      }
      store.openQuickEdit(rowIdx, colKey);
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    holdActive.current = false;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const store = useSheetStore.getState();

    const td = t.closest("td.dc") as HTMLElement | null;
    if (td && !store.selectionMode) {
      const rowIdx = Number(td.dataset.row);
      const colKey = td.dataset.col ?? "";
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        holdActive.current = true;
        vibrate(15);
        useSheetStore.getState().enterSelectionMode("cell", rowIdx, colKey);
      }, 500);
      return;
    }

    const dot = t.closest(".dot-cell") as HTMLElement | null;
    if (dot) {
      const rowIdx = Number(dot.dataset.row);
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        holdActive.current = true;
        vibrate(15);
        const result = useSheetStore.getState().onDotHold(rowIdx);
        if (result) {
          const rect = dot.getBoundingClientRect();
          setLogPopup({
            logs: result.logs,
            label: result.label,
            x: Math.max(4, rect.right - 340),
            y: rect.bottom + 4,
          });
        }
      }, 500);
      return;
    }

    const ch = t.closest("th.ch:not(.corner):not(.ch-dot)") as HTMLElement | null;
    if (ch && !store.selectionMode) {
      const colKey = ch.dataset.col ?? "";
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        holdActive.current = true;
        vibrate(15);
        useSheetStore.getState().enterSelectionMode("col", 0, colKey);
      }, 500);
      return;
    }

    const rh = t.closest("th.rh") as HTMLElement | null;
    if (rh && !store.selectionMode) {
      const rowIdx = Number(rh.dataset.row);
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        holdActive.current = true;
        vibrate(15);
        useSheetStore.getState().enterSelectionMode("row", rowIdx, null);
      }, 500);
    }
  }

  return (
    <div
      className="sheet-wrap"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onScroll={() => setLogPopup(null)}
    >
      <table className="grid" cellSpacing={0} cellPadding={0}>
        <thead>
          <tr>
            <th className="corner"></th>
            {displayCols.map((col) => (
              <th
                key={col.key}
                className={"ch" + (selectionMode && selCols.has(col.key) ? " col-sel" : "")}
                data-col={col.key}
              >
                {col.label}
              </th>
            ))}
            <th className="ch-dot"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((_, i) => (
            <GridRow key={i} rowIdx={i} displayCols={displayCols} />
          ))}
          <tr className="add-row">
            <td
              className="rh-add"
              colSpan={displayCols.length + 2}
              onClick={() => useSheetStore.getState().addRow()}
            >
              + Add row
            </td>
          </tr>
        </tbody>
      </table>

      {logPopup && (
        <div
          ref={popupRef}
          className="file-ctx-popup open"
          style={{
            left: logPopup.x,
            top: logPopup.y,
            width: 340,
            maxHeight: "50vh",
            overflowY: "auto",
            padding: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {logPopup.label} — {logPopup.logs.length} API call
            {logPopup.logs.length > 1 ? "s" : ""}
          </div>
          {logPopup.logs.length === 0 ? (
            <div style={{ padding: "6px 0", color: "var(--text3)", fontSize: 12 }}>
              No logs for this row
            </div>
          ) : (
            logPopup.logs.map((log, idx) => {
              const l = log as ApiLog;
              const statusIcon = l.status === "done" ? "✓" : "✗";
              const statusColor = l.status === "done" ? "var(--green)" : "var(--red)";
              return (
                <div
                  key={idx}
                  style={{
                    padding: "6px 0",
                    borderTop: idx ? "1px solid var(--border)" : "none",
                    fontSize: 12,
                  }}
                >
                  {(l.calls ?? []).map((call, ci) => {
                    if (call.type === "error") {
                      return (
                        <div
                          key={ci}
                          style={{ color: "var(--red)", padding: "2px 0", fontSize: 12 }}
                        >
                          ⚠ {String(call.response)}
                        </div>
                      );
                    }
                    let pretty: string;
                    try {
                      pretty = JSON.stringify(JSON.parse(String(call.response)), null, 2);
                    } catch {
                      pretty = String(call.response);
                    }
                    return (
                      <div key={ci}>
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ color: statusColor, fontWeight: 600 }}>
                            {statusIcon} {call.type?.toUpperCase()}
                          </span>
                        </div>
                        <div
                          style={{ color: "var(--text3)", fontSize: 11, marginBottom: 1 }}
                        >
                          {call.request}
                        </div>
                        <pre
                          style={{
                            margin: "2px 0 0",
                            fontSize: 11,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            color: "var(--text)",
                            fontFamily: "var(--mono)",
                            background: "var(--bg3)",
                            padding: "4px 6px",
                            borderRadius: 4,
                            lineHeight: 1.4,
                          }}
                        >
                          {pretty}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const GridRow = memo(function GridRow({
  rowIdx,
  displayCols,
}: {
  rowIdx: number;
  displayCols: ColumnDef[];
}) {
  const row = useSheetStore((s) => s.rows[rowIdx]);
  const isRowSel = useSheetStore((s) => s.selRows.has(rowIdx));
  const isDupRow = useSheetStore(
    (s) => s.dupRows.has(rowIdx) || s.crossDupRows.has(rowIdx),
  );

  const status = row?.status ?? "";
  const dotClass = isDupRow
    ? "d-yellow"
    : row?.wa_status === "eligible"
      ? "d-green"
      : status === "good" || status === "done"
        ? "d-blue"
        : status === "bad"
          ? "d-red"
          : status === "pending"
            ? "d-spin d-yellow"
            : "";

  return (
    <tr className={isRowSel ? "row-selected" : ""}>
      <th
        className={"rh" + (isRowSel ? " row-sel" : "")}
        data-row={rowIdx}
      >
        {rowIdx + 1}
      </th>
      {displayCols.map((col) => (
        <GridCell key={col.key} rowIdx={rowIdx} colKey={col.key} />
      ))}
      <td className="dot-cell" data-row={rowIdx}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <span className={"row-dot" + (dotClass ? " " + dotClass : "")}></span>
        </div>
      </td>
    </tr>
  );
});

const GridCell = memo(function GridCell({
  rowIdx,
  colKey,
}: {
  rowIdx: number;
  colKey: string;
}) {
  const value = useSheetStore((s) => s.rows[rowIdx]?.[colKey] ?? "");
  const sel = useSheetStore((s) => s.selectedItems.has(rowIdx + ":" + colKey));
  const dup = useSheetStore((s) => s.dupCells.has(rowIdx + ":" + colKey));
  const invalid = useSheetStore((s) => s.invalidCells.has(rowIdx + ":" + colKey));
  const active = useSheetStore(
    (s) =>
      s.qebOpen &&
      s.selectedCell?.rowIdx === rowIdx &&
      s.selectedCell.colIdx === colKey,
  );
  const draft = useSheetStore((s) =>
    s.qebOpen &&
    s.selectedCell?.rowIdx === rowIdx &&
    s.selectedCell.colIdx === colKey
      ? s.draft
      : null,
  );

  return (
    <td
      className={
        "dc" +
        (sel ? " ms-sel" : "") +
        (dup ? " cell-dup" : "") +
        (invalid ? " cell-invalid" : "") +
        (active ? " cell-editing" : "")
      }
      data-row={rowIdx}
      data-col={colKey}
    >
      <div className="cell-inner">
        <span className="cell-text">{draft ?? value}</span>
      </div>
    </td>
  );
});
