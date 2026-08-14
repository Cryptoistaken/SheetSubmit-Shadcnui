import { useSheetStore } from "@/stores/sheetStore";

import CellEditor from "./CellEditor";

export default function QuickEditBar() {
  const qebOpen = useSheetStore((s) => s.qebOpen);
  const selectedCell = useSheetStore((s) => s.selectedCell);
  const columns = useSheetStore((s) => s.columns);

  if (!qebOpen) return null;

  const colIdx = selectedCell?.colIdx;
  const label = columns.find((c) => c.key === colIdx)?.label ?? colIdx ?? "";

  return (
    <div className="qeb-bar open">
      <span className="qeb-chip">{label}</span>
      <CellEditor />
      <div className="qeb-right">
        <button
          className="qeb-paste-btn"
          onClick={() => void useSheetStore.getState().quickEditPaste()}
        >
          Paste
        </button>
        <button
          className="qeb-paste-btn"
          onClick={() => useSheetStore.getState().quickEditClear()}
        >
          Clear
        </button>
        <button
          className="qeb-icon-btn save"
          onClick={() => useSheetStore.getState().commitQuickEdit()}
        >
          OK
        </button>
      </div>
    </div>
  );
}
