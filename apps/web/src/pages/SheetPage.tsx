import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Skeleton } from "boneyard-js/react";

import QuickEditBar from "@/components/sheet/QuickEditBar";
import SelectionBar from "@/components/sheet/SelectionBar";
import SheetGrid from "@/components/sheet/SheetGrid";
import { usePersist } from "@/hooks/usePersist";
import { useSheetStore } from "@/stores/sheetStore";

function GridFixture() {
  return (
    <div className="sheet-wrap">
      <table className="grid" cellSpacing={0} cellPadding={0}>
        <thead>
          <tr>
            <th className="corner" />
            <th className="ch">cookies</th>
            <th className="ch">2fa key</th>
            <th className="ch">uid</th>
            <th className="ch-dot" />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 24 }, (_, i) => (
            <tr key={i}>
              <th className="rh">{i + 1}</th>
              <td className="dc">
                <div className="cell-inner">
                  <span className="cell-text">sample cookie value</span>
                </div>
              </td>
              <td className="dc">
                <div className="cell-inner">
                  <span className="cell-text">2FAKEY</span>
                </div>
              </td>
              <td className="dc">
                <div className="cell-inner">
                  <span className="cell-text">12345</span>
                </div>
              </td>
              <td className="dot-cell">
                <span className="row-dot" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const status = useSheetStore((s) => s.status);

  usePersist();

  useEffect(() => {
    if (id) void useSheetStore.getState().openFile(id);
    return () => useSheetStore.getState().closeFile();
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSheetStore.getState().exitSelectionMode();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (status === "error") {
    return (
      <div className="home-pane">
        <div className="empty-state">
          <div className="empty-state-title">Could not open file</div>
          <button className="btn btn-ghost" onClick={() => navigate("/")}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <Skeleton
        name="sheet-grid"
        loading
        color="#ececec"
        darkColor="#262626"
        fallback={
          <div className="home-pane">
            <div className="empty-state">
              <div className="empty-state-title">Loading…</div>
            </div>
          </div>
        }
        fixture={<GridFixture />}
      >
        <div />
      </Skeleton>
    );
  }

  if (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__BONEYARD_BUILD === true
  ) {
    return (
      <Skeleton
        name="sheet-grid"
        loading
        color="#ececec"
        darkColor="#262626"
        fixture={<GridFixture />}
      >
        <div />
      </Skeleton>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <SheetGrid />
      <QuickEditBar />
      <SelectionBar />
    </div>
  );
}
