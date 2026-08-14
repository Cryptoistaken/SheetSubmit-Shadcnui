import { create } from "zustand";
import { api } from "@/lib/api";
import {
  FILE_TYPE_DEFS,
  type ColumnDef,
  type Row,
  type SheetFile,
} from "@/lib/types";
import { getFileBehavior } from "@/features/filetypes";
import { toast } from "@/lib/toast";
import { vibrate } from "@/lib/utils";

export interface CellDelta {
  rowIdx: number;
  colKey: string;
  prevVal: string;
}

export interface RowsDelta {
  type: "rows";
  prevRows: Row[];
}

export type UndoEntry = CellDelta | RowsDelta;

export interface SelectedCell {
  rowIdx: number;
  colIdx: string;
  originalVal: string;
}

export type SheetStatus = "idle" | "loading" | "ready" | "error";

export function makeEmptyRow(columns: ColumnDef[]): Row {
  const nr: Row = {};
  columns.forEach((c) => {
    nr[c.key] = "";
  });
  nr.status = "";
  return nr;
}

interface MarkResult {
  dupCells: Set<string>;
  dupRows: Set<number>;
  crossDupRows: Set<number>;
  hasDuplicates: boolean;
}

function recomputeMarks(
  rows: Row[],
  crossDups: Record<string, unknown[]>,
  columns: ColumnDef[],
): MarkResult {
  const dupCells = new Set<string>();
  const dupRows = new Set<number>();
  const crossDupRows = new Set<number>();

  for (const col of columns) {
    const valMap = new Map<string, number[]>();
    rows.forEach((row, rowIdx) => {
      const val = (row[col.key] ?? "").trim();
      if (!val) return;
      const list = valMap.get(val);
      if (list) list.push(rowIdx);
      else valMap.set(val, [rowIdx]);
    });
    valMap.forEach((idxs) => {
      if (idxs.length > 1) {
        for (const rowIdx of idxs) {
          dupCells.add(`${rowIdx}:${col.key}`);
          dupRows.add(rowIdx);
        }
      }
    });
  }

  rows.forEach((row, rowIdx) => {
    let uid = row.uid ?? row.username;
    if (!uid && row.cookies) {
      const m = row.cookies.match(/c_user=(\d+)/);
      if (m) uid = m[1];
    }
    if (uid && crossDups[uid]) {
      crossDupRows.add(rowIdx);
    }
  });

  return { dupCells, dupRows, crossDupRows, hasDuplicates: dupCells.size > 0 };
}

function pushUndoCell(
  undoStack: UndoEntry[],
  rowIdx: number,
  colKey: string,
  prevVal: string,
): { undoStack: UndoEntry[]; redoStack: UndoEntry[] } {
  const undo: UndoEntry[] = [...undoStack, { rowIdx, colKey, prevVal }];
  if (undo.length > 100) undo.shift();
  return { undoStack: undo, redoStack: [] };
}

function updateSelFlags(
  items: Set<string>,
  numCols: number,
  numRows: number,
): { selRows: Set<number>; selCols: Set<string> } {
  const rowCounts = new Map<string, number>();
  const colCounts = new Map<string, number>();
  for (const key of items) {
    const parts = key.split(":");
    const r = parts[0];
    const c = parts[1];
    rowCounts.set(r, (rowCounts.get(r) ?? 0) + 1);
    colCounts.set(c, (colCounts.get(c) ?? 0) + 1);
  }
  const selRows = new Set<number>();
  rowCounts.forEach((n, r) => {
    if (n === numCols) selRows.add(Number(r));
  });
  const selCols = new Set<string>();
  colCounts.forEach((n, c) => {
    if (n === numRows) selCols.add(c);
  });
  return { selRows, selCols };
}

export interface SheetState {
  status: SheetStatus;
  fileId: string | null;
  file: SheetFile | null;
  rows: Row[];
  columns: ColumnDef[];
  visibleCols: Set<string>;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  apiLogs: unknown[];
  isDirty: boolean;
  selectedCell: SelectedCell | null;
  draft: string;
  qebOpen: boolean;
  selectionMode: boolean;
  selectedItems: Set<string>;
  selRows: Set<number>;
  selCols: Set<string>;
  dupCells: Set<string>;
  dupRows: Set<number>;
  invalidCells: Set<string>;
  crossDupRows: Set<number>;
  hasDuplicates: boolean;
  crossDups: Record<string, unknown[]>;

  openFile: (id: string) => Promise<void>;
  closeFile: () => void;
  refreshSheet: () => Promise<void>;
  commitCell: (rowIdx: number, colKey: string, value: string) => void;
  persist: (action?: string) => void;
  flushPersist: (action?: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  openQuickEdit: (rowIdx: number, colKey: string) => void;
  setDraft: (value: string) => void;
  commitQuickEdit: () => void;
  cancelQuickEdit: () => void;
  moveEdit: (dRow: number, dCol: number) => void;
  quickEditPaste: () => Promise<void>;
  quickEditClear: () => void;
  enterSelectionMode: (
    type: "cell" | "col" | "row",
    row: number,
    col: string | null,
  ) => void;
  toggleSelection: (
    type: "cell" | "col" | "row",
    row: number,
    col: string | null,
  ) => void;
  exitSelectionMode: () => void;
  selectAllCells: () => void;
  unselectAll: () => void;
  deleteSelected: () => void;
  copySelected: () => Promise<void>;
  addRow: () => void;
  doubleTap: (rowIdx: number, colKey: string) => Promise<void>;
  tripleTapRow: (rowIdx: number) => Promise<void>;
  tripleTapCol: (colKey: string) => Promise<void>;
  onDotDoubleTap: (rowIdx: number) => Promise<void>;
  onDotHold: (rowIdx: number) => { logs: unknown[]; label: string } | null;
  toggleVisibleCol: (colKey: string) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let openSeq = 0;

export const useSheetStore = create<SheetState>()((set, get) => ({
  status: "idle",
  fileId: null,
  file: null,
  rows: [],
  columns: [],
  visibleCols: new Set(),
  undoStack: [],
  redoStack: [],
  apiLogs: [],
  isDirty: false,
  selectedCell: null,
  draft: "",
  qebOpen: false,
  selectionMode: false,
  selectedItems: new Set(),
  selRows: new Set(),
  selCols: new Set(),
  dupCells: new Set(),
  dupRows: new Set(),
  invalidCells: new Set(),
  crossDupRows: new Set(),
  hasDuplicates: false,
  crossDups: {},

  openFile: async (id) => {
    const seq = ++openSeq;
    set({ status: "loading" });
    try {
      const [f, rowsRes, logsRes, undoData] = await Promise.all([
        api.getFile(id),
        api.getRows(id),
        api.getLogs(id),
        api.getUndo(id),
      ]);
      if (!f?.id) throw new Error("File not found");
      const crossDups = await api
        .getCrossDups(id)
        .then((d) => d?.dups ?? {})
        .catch(() => ({}));
      if (seq !== openSeq) return;
      const columns = FILE_TYPE_DEFS[f.type].columns;
      let visibleCols = new Set<string>(columns.map((c) => c.key));
      try {
        const saved = localStorage.getItem(`ss_cols_${id}`);
        if (saved) visibleCols = new Set<string>(JSON.parse(saved) as string[]);
      } catch {
        // ignore malformed saved columns
      }
      const rows: Row[] = [...(rowsRes ?? [])];
      while (rows.length < 100) rows.push(makeEmptyRow(columns));
      const undoStack = (undoData?.undo ?? []) as UndoEntry[];
      const redoStack = (undoData?.redo ?? []) as UndoEntry[];
      const apiLogs = logsRes ?? [];
      set({
        status: "ready",
        fileId: id,
        file: f,
        rows,
        columns,
        visibleCols,
        undoStack,
        redoStack,
        apiLogs,
        isDirty: false,
        selectedCell: null,
        draft: "",
        qebOpen: false,
        selectionMode: false,
        selectedItems: new Set(),
        selRows: new Set(),
        selCols: new Set(),
        invalidCells: new Set(),
        crossDups,
        ...recomputeMarks(rows, crossDups, columns),
      });
    } catch {
      set({ status: "error" });
    }
  },

  closeFile: () => {
    openSeq++;
    const s = get();
    if (s.isDirty) void get().flushPersist();
    set({
      status: "idle",
      fileId: null,
      file: null,
      rows: [],
      columns: [],
      visibleCols: new Set(),
      undoStack: [],
      redoStack: [],
      apiLogs: [],
      isDirty: false,
      selectedCell: null,
      draft: "",
      qebOpen: false,
      selectionMode: false,
      selectedItems: new Set(),
      selRows: new Set(),
      selCols: new Set(),
      dupCells: new Set(),
      dupRows: new Set(),
      invalidCells: new Set(),
      crossDupRows: new Set(),
      hasDuplicates: false,
      crossDups: {},
    });
  },

  refreshSheet: async () => {
    const fileId = get().fileId;
    if (!fileId) return;
    try {
      const rowsRes = await api.getRows(fileId);
      if (fileId !== get().fileId) return;
      const columns = get().columns;
      const rows: Row[] = [...(rowsRes ?? [])];
      while (rows.length < 100) rows.push(makeEmptyRow(columns));
      set({ rows, ...recomputeMarks(rows, get().crossDups, columns) });
    } catch {
      // swallow
    }
  },

  commitCell: (rowIdx, colKey, value) => {
    const s = get();
    const row = s.rows[rowIdx];
    if (!row) return;
    const prevVal = row[colKey] ?? "";
    if (value === prevVal) return;
    const newRows = s.rows.slice();
    newRows[rowIdx] = { ...row, [colKey]: value };
    const behavior = getFileBehavior(s.file?.type ?? "fb_cookie");
    const newInvalid = new Set(s.invalidCells);
    if (behavior?.onCellChange) {
      behavior.onCellChange({
        rows: newRows,
        rowIdx,
        colKey,
        value,
        invalidCells: newInvalid,
        showToast: toast,
      });
    }
    const { undoStack, redoStack } = pushUndoCell(
      s.undoStack,
      rowIdx,
      colKey,
      prevVal,
    );
    set({
      rows: newRows,
      undoStack,
      redoStack,
      isDirty: true,
      invalidCells: newInvalid,
      ...recomputeMarks(newRows, s.crossDups, s.columns),
    });
    get().persist();
  },

  persist: (action) => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void get().flushPersist(action);
    }, 300);
  },

  flushPersist: async (action) => {
    const s = get();
    if (!s.fileId || !s.file) return;
    const columns = FILE_TYPE_DEFS[s.file.type].columns;
    let dataCount = 0;
    let lastData = -1;
    s.rows.forEach((row, idx) => {
      const hasData = columns.some((c) => row[c.key]);
      if (hasData) {
        dataCount++;
        lastData = idx;
      }
    });
    const keepCount = Math.min(s.rows.length, Math.max(lastData + 51, 100));
    const trimmed = s.rows.slice(0, keepCount);
    const payload: {
      rows: Row[];
      logs: unknown[];
      undo: UndoEntry[];
      redo: UndoEntry[];
      dataCount: number;
      action?: string;
    } = {
      rows: trimmed,
      logs: s.apiLogs,
      undo: s.undoStack,
      redo: s.redoStack,
      dataCount,
    };
    if (action) payload.action = action;
    try {
      await api.persist(s.fileId, payload);
      set({ isDirty: false });
    } catch {
      // swallow — old app is fire-and-forget
    }
  },

  undo: () => {
    const s = get();
    if (!s.undoStack.length) return;
    const undoStack = s.undoStack.slice();
    const delta = undoStack.pop();
    if (!delta) return;
    const redoStack = s.redoStack.slice();
    let rows = s.rows;
    if ("type" in delta) {
      redoStack.push({ type: "rows", prevRows: rows.map((r) => ({ ...r })) });
      rows = delta.prevRows.map((r) => ({ ...r }));
    } else {
      const row = rows[delta.rowIdx];
      const currentVal = row ? (row[delta.colKey] ?? "") : "";
      redoStack.push({
        rowIdx: delta.rowIdx,
        colKey: delta.colKey,
        prevVal: currentVal,
      });
      if (row) {
        const newRows = rows.slice();
        newRows[delta.rowIdx] = { ...row, [delta.colKey]: delta.prevVal };
        rows = newRows;
      }
    }
    set({
      rows,
      undoStack,
      redoStack,
      isDirty: true,
      ...recomputeMarks(rows, s.crossDups, s.columns),
    });
    get().persist();
    toast("Undo");
  },

  redo: () => {
    const s = get();
    if (!s.redoStack.length) return;
    const redoStack = s.redoStack.slice();
    const delta = redoStack.pop();
    if (!delta) return;
    const undoStack = s.undoStack.slice();
    let rows = s.rows;
    if ("type" in delta) {
      undoStack.push({ type: "rows", prevRows: rows.map((r) => ({ ...r })) });
      rows = delta.prevRows.map((r) => ({ ...r }));
    } else {
      const row = rows[delta.rowIdx];
      const currentVal = row ? (row[delta.colKey] ?? "") : "";
      undoStack.push({
        rowIdx: delta.rowIdx,
        colKey: delta.colKey,
        prevVal: currentVal,
      });
      if (row) {
        const newRows = rows.slice();
        newRows[delta.rowIdx] = { ...row, [delta.colKey]: delta.prevVal };
        rows = newRows;
      }
    }
    set({
      rows,
      undoStack,
      redoStack,
      isDirty: true,
      ...recomputeMarks(rows, s.crossDups, s.columns),
    });
    get().persist();
    toast("Redo");
  },

  openQuickEdit: (rowIdx, colKey) => {
    const row = get().rows[rowIdx];
    if (!row) return;
    set({
      selectedCell: { rowIdx, colIdx: colKey, originalVal: row[colKey] ?? "" },
      draft: row[colKey] ?? "",
      qebOpen: true,
    });
  },

  setDraft: (value) => {
    set({ draft: value });
  },

  commitQuickEdit: () => {
    const sc = get().selectedCell;
    if (!sc) return;
    get().commitCell(sc.rowIdx, sc.colIdx, get().draft);
    set({ qebOpen: false, selectedCell: null });
  },

  cancelQuickEdit: () => {
    set({ qebOpen: false, selectedCell: null });
  },

  moveEdit: (dRow, dCol) => {
    const sc = get().selectedCell;
    if (!sc) return;
    const rowIdx = sc.rowIdx;
    const colIdx = sc.colIdx;
    get().commitQuickEdit();
    const visible = get().columns.filter((c) => get().visibleCols.has(c.key));
    if (!visible.length) return;
    let colKey = colIdx;
    if (dCol !== 0) {
      const idx = visible.findIndex((c) => c.key === colIdx);
      if (idx !== -1) {
        const next = Math.min(Math.max(idx + dCol, 0), visible.length - 1);
        colKey = visible[next].key;
      }
    }
    const newRow = Math.min(
      Math.max(rowIdx + dRow, 0),
      get().rows.length - 1,
    );
    get().openQuickEdit(newRow, colKey);
  },

  quickEditPaste: async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast("Cannot read clipboard");
      return;
    }
    if (!text) return;
    const sc = get().selectedCell;
    if (!sc) return;
    set({ draft: text });
    get().commitCell(sc.rowIdx, sc.colIdx, text);
  },

  quickEditClear: () => {
    const sc = get().selectedCell;
    if (!sc) return;
    set({ draft: "" });
    get().commitCell(sc.rowIdx, sc.colIdx, "");
  },

  enterSelectionMode: (type, row, col) => {
    vibrate(15);
    const s = get();
    const selectedItems = new Set<string>();
    if (type === "cell") {
      if (col !== null) selectedItems.add(`${row}:${col}`);
    } else if (type === "col") {
      if (col !== null) {
        for (let i = 0; i < s.rows.length; i++) selectedItems.add(`${i}:${col}`);
      }
    } else if (type === "row") {
      for (const c of s.columns) selectedItems.add(`${row}:${c.key}`);
    }
    const { selRows, selCols } = updateSelFlags(
      selectedItems,
      s.columns.length,
      s.rows.length,
    );
    set({
      qebOpen: false,
      selectedCell: null,
      selectionMode: true,
      selectedItems,
      selRows,
      selCols,
    });
  },

  toggleSelection: (type, row, col) => {
    const s = get();
    const selectedItems = new Set(s.selectedItems);
    if (type === "cell") {
      if (col !== null) {
        const key = `${row}:${col}`;
        if (selectedItems.has(key)) selectedItems.delete(key);
        else selectedItems.add(key);
      }
    } else if (type === "col") {
      if (col !== null) {
        const allInCol =
          s.rows.length > 0 &&
          s.rows.every((_, i) => selectedItems.has(`${i}:${col}`));
        if (allInCol) {
          for (let i = 0; i < s.rows.length; i++)
            selectedItems.delete(`${i}:${col}`);
        } else {
          for (let i = 0; i < s.rows.length; i++)
            selectedItems.add(`${i}:${col}`);
        }
      }
    } else if (type === "row") {
      const allInRow = s.columns.every((c) =>
        selectedItems.has(`${row}:${c.key}`),
      );
      if (allInRow) {
        for (const c of s.columns) selectedItems.delete(`${row}:${c.key}`);
      } else {
        for (const c of s.columns) selectedItems.add(`${row}:${c.key}`);
      }
    }
    const { selRows, selCols } = updateSelFlags(
      selectedItems,
      s.columns.length,
      s.rows.length,
    );
    set({ selectionMode: true, selectedItems, selRows, selCols });
  },

  exitSelectionMode: () => {
    set({
      selectionMode: false,
      selectedItems: new Set(),
      selRows: new Set(),
      selCols: new Set(),
    });
  },

  selectAllCells: () => {
    const s = get();
    const selectedItems = new Set<string>();
    for (let i = 0; i < s.rows.length; i++) {
      for (const col of s.columns) {
        selectedItems.add(`${i}:${col.key}`);
      }
    }
    const { selRows, selCols } = updateSelFlags(
      selectedItems,
      s.columns.length,
      s.rows.length,
    );
    set({
      qebOpen: false,
      selectedCell: null,
      selectionMode: true,
      selectedItems,
      selRows,
      selCols,
    });
  },

  unselectAll: () => {
    get().exitSelectionMode();
  },

  deleteSelected: () => {
    const s = get();
    if (!s.selectionMode) return;
    const behavior = getFileBehavior(s.file?.type ?? "fb_cookie");
    const rows = s.rows.slice();
    const newInvalid = new Set(s.invalidCells);
    const undoEntries: UndoEntry[] = [];
    s.selectedItems.forEach((key) => {
      const parts = key.split(":");
      const rowIdx = Number(parts[0]);
      const colKey = parts[1];
      const row = rows[rowIdx];
      if (!row) return;
      const prevVal = row[colKey] ?? "";
      if (prevVal !== "") undoEntries.push({ rowIdx, colKey, prevVal });
      rows[rowIdx] = { ...row, [colKey]: "" };
      if (behavior?.onCellChange) {
        behavior.onCellChange({
          rows,
          rowIdx,
          colKey,
          value: "",
          invalidCells: newInvalid,
          showToast: toast,
        });
      }
    });
    const undo = [...s.undoStack, ...undoEntries];
    if (undo.length > 100) undo.splice(0, undo.length - 100);
    set({
      rows,
      undoStack: undo,
      redoStack: [],
      isDirty: true,
      invalidCells: newInvalid,
      ...recomputeMarks(rows, s.crossDups, s.columns),
    });
    get().exitSelectionMode();
    get().persist();
    toast("Deleted");
  },

  copySelected: async () => {
    const s = get();
    if (!s.selectionMode) return;
    const byRow = new Map<number, Array<{ col: string; val: string }>>();
    s.selectedItems.forEach((key) => {
      const parts = key.split(":");
      const rowIdx = Number(parts[0]);
      const colKey = parts[1];
      const entry = {
        col: colKey,
        val: s.rows[rowIdx] ? (s.rows[rowIdx][colKey] ?? "") : "",
      };
      const list = byRow.get(rowIdx);
      if (list) list.push(entry);
      else byRow.set(rowIdx, [entry]);
    });
    const colOrder = s.columns.map((c) => c.key);
    const colOrderMap = new Map<string, number>();
    colOrder.forEach((k, i) => colOrderMap.set(k, i));
    const sortedRows = [...byRow.keys()].sort((a, b) => a - b);
    const lines: string[] = [];
    sortedRows.forEach((ri) => {
      const cells = byRow.get(ri);
      if (!cells) return;
      cells.sort(
        (a, b) => (colOrderMap.get(a.col) ?? 0) - (colOrderMap.get(b.col) ?? 0),
      );
      lines.push(cells.map((c) => c.val).join("\t"));
    });
    const text = lines.join("\n");
    if (!text) {
      toast("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${s.selectedItems.size} cells`);
      get().exitSelectionMode();
    } catch {
      toast("Cannot copy");
    }
  },

  addRow: () => {
    const s = get();
    const rows = s.rows.concat(
      Array.from({ length: 100 }, () => makeEmptyRow(s.columns)),
    );
    set({ rows, isDirty: true });
    get().persist();
    toast("100 rows added");
  },

  doubleTap: async (rowIdx, colKey) => {
    const row = get().rows[rowIdx];
    if (!row) return;
    const val = row[colKey] ?? "";
    if (!val) {
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      if (!text) return;
      vibrate();
      get().commitCell(rowIdx, colKey, text);
      toast("Pasted");
    } else {
      navigator.clipboard
        .writeText(val)
        .then(() => {
          vibrate();
          toast("Copied");
        })
        .catch(() => {});
    }
  },

  tripleTapRow: async (rowIdx) => {
    const row = get().rows[rowIdx];
    if (!row) return;
    const vals = get().columns.map((c) => ({ key: c.key, val: row[c.key] ?? "" }));
    const hasData = vals.some((v) => v.val);
    if (hasData) {
      const text = vals.map((v) => v.val).join("\t");
      navigator.clipboard
        .writeText(text)
        .then(() => {
          vibrate();
          toast("Row copied");
        })
        .catch(() => {
          toast("Cannot copy");
        });
    } else {
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      if (!text) return;
      const parts = text.split("\t");
      const cells: Array<{ rowIdx: number; colKey: string; value: string }> = [];
      vals.forEach((v, i) => {
        if (parts[i] !== undefined) {
          cells.push({ rowIdx, colKey: v.key, value: parts[i] });
        }
      });
      applyCells(cells, "Row pasted");
    }
  },

  tripleTapCol: async (colKey) => {
    const s = get();
    const vals: Array<{ idx: number; val: string }> = [];
    s.rows.forEach((row, i) => {
      const v = row[colKey] ?? "";
      if (v) vals.push({ idx: i, val: v });
    });
    if (vals.length) {
      const text = vals.map((v) => v.val).join("\n");
      navigator.clipboard
        .writeText(text)
        .then(() => {
          vibrate();
          toast(`Copied ${vals.length} cells`);
        })
        .catch(() => {
          toast("Cannot copy");
        });
    } else {
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      if (!text) return;
      const parts = text.split("\n").filter((p) => p);
      const cells: Array<{ rowIdx: number; colKey: string; value: string }> = [];
      parts.forEach((val, i) => {
        if (s.rows[i]) cells.push({ rowIdx: i, colKey, value: val });
      });
      applyCells(cells, `Pasted ${parts.length} cells`);
    }
  },

  onDotDoubleTap: async (rowIdx) => {
    const row = get().rows[rowIdx];
    if (!row) return;
    const behavior = getFileBehavior(get().file?.type ?? "fb_cookie");
    if (behavior?.onDotDoubleTap) {
      const result = await behavior.onDotDoubleTap(row);
      if (result?.action === "totp_copied") {
        await navigator.clipboard.writeText(result.code).catch(() => {});
        toast(`TOTP ${result.code} copied`);
      }
    }
  },

  onDotHold: (rowIdx) => {
    const s = get();
    const row = s.rows[rowIdx];
    if (!row) return null;
    const behavior = getFileBehavior(s.file?.type ?? "fb_cookie");
    if (!behavior?.onDotHold) return null;
    const result = behavior.onDotHold(row, s.apiLogs);
    return result?.action === "show_logs"
      ? { logs: result.logs, label: result.label }
      : null;
  },

  toggleVisibleCol: (colKey) => {
    const s = get();
    const visibleCols = new Set(s.visibleCols);
    if (visibleCols.has(colKey)) visibleCols.delete(colKey);
    else visibleCols.add(colKey);
    set({ visibleCols });
    if (s.fileId) {
      localStorage.setItem(`ss_cols_${s.fileId}`, JSON.stringify([...visibleCols]));
    }
  },
}));

function applyCells(
  cells: Array<{ rowIdx: number; colKey: string; value: string }>,
  toastMsg: string,
): void {
  if (!cells.length) return;
  const s = useSheetStore.getState();
  const behavior = getFileBehavior(s.file?.type ?? "fb_cookie");
  const rows = s.rows.slice();
  const newInvalid = new Set(s.invalidCells);
  const undoEntries: UndoEntry[] = [];
  let changed = false;
  for (const cell of cells) {
    const row = rows[cell.rowIdx];
    if (!row) continue;
    const prevVal = row[cell.colKey] ?? "";
    if (prevVal === cell.value) continue;
    rows[cell.rowIdx] = { ...row, [cell.colKey]: cell.value };
    undoEntries.push({
      rowIdx: cell.rowIdx,
      colKey: cell.colKey,
      prevVal,
    });
    changed = true;
    if (behavior?.onCellChange) {
      behavior.onCellChange({
        rows,
        rowIdx: cell.rowIdx,
        colKey: cell.colKey,
        value: cell.value,
        invalidCells: newInvalid,
        showToast: toast,
      });
    }
  }
  if (!changed) return;
  const undo = [...s.undoStack, ...undoEntries];
  if (undo.length > 100) undo.splice(0, undo.length - 100);
  useSheetStore.setState({
    rows,
    undoStack: undo,
    redoStack: [],
    isDirty: true,
    invalidCells: newInvalid,
    ...recomputeMarks(rows, s.crossDups, s.columns),
  });
  useSheetStore.getState().persist();
  toast(toastMsg);
}
