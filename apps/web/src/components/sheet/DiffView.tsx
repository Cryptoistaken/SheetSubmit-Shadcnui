import { useEffect, useState } from "react";
import { useSheetStore } from "@/stores/sheetStore";
import { dedupKeyForRow } from "@/stores/sheetStore";
import { getVersionRows } from "@/stores/versionCache";
import type { Row, VersionMeta } from "@/lib/types";

interface DiffLine {
  type: "ctx" | "add" | "del";
  text: string;
}

interface DiffResult {
  lines: DiffLine[];
  add: number;
  del: number;
  oldLen: number;
  newLen: number;
}

function vRowLine(r: Row | null | undefined, cols: { key: string }[]): string {
  const vals: string[] = [];
  cols.forEach((c) => {
    const v = r ? r[c.key] : null;
    vals.push(v === null || v === undefined ? "" : String(v));
  });
  return vals.join(" | ");
}

function vComputeDiff(
  parentRows: Row[],
  childRows: Row[],
  cols: { key: string }[],
): { lines: DiffLine[]; add: number; del: number } {
  const vRowMap = (rows: Row[]) => {
    const m = new Map<string, Row>();
    rows.forEach((r) => {
      const k = dedupKeyForRow(r);
      if (k) m.set(String(k), r);
    });
    return m;
  };
  const om = vRowMap(parentRows);
  const cm = vRowMap(childRows);
  const keys = new Set<string>([...om.keys(), ...cm.keys()]);
  const lines: DiffLine[] = [];
  let add = 0;
  let del = 0;
  keys.forEach((k) => {
    const o = om.get(k);
    const n = cm.get(k);
    if (o && n) {
      if (vRowLine(o, cols) === vRowLine(n, cols)) {
        lines.push({ type: "ctx", text: vRowLine(n, cols) });
      } else {
        lines.push({ type: "del", text: vRowLine(o, cols) });
        lines.push({ type: "add", text: vRowLine(n, cols) });
        del++;
        add++;
      }
    } else if (n) {
      lines.push({ type: "add", text: vRowLine(n, cols) });
      add++;
    } else {
      lines.push({ type: "del", text: vRowLine(o, cols) });
      del++;
    }
  });
  return { lines, add, del };
}

export default function DiffView({
  fileId,
  rec,
  prev,
  fileName,
  typeName,
}: {
  fileId: string;
  rec: VersionMeta;
  prev: VersionMeta | null;
  fileName: string;
  typeName: string;
}) {
  const columns = useSheetStore((s) => s.columns);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [diff, setDiff] = useState<DiffResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cur = await getVersionRows(fileId, rec.v);
        if (cancelled) return;
        if (!cur.ok) {
          setStatus("error");
          return;
        }
        if (prev) {
          const old = await getVersionRows(fileId, prev.v);
          if (cancelled) return;
          const d = vComputeDiff(old.ok ? old.rows : [], cur.rows, columns);
          setDiff({
            ...d,
            oldLen: old.ok ? old.rows.length : 0,
            newLen: cur.rows.length,
          });
        } else {
          const d = vComputeDiff([], cur.rows, columns);
          setDiff({ ...d, oldLen: 0, newLen: cur.rows.length });
        }
        setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, rec.v, prev?.v]);

  if (status === "loading") {
    return <div className="version-preview">Loading preview.</div>;
  }
  if (status === "error" || !diff) {
    return <div className="version-preview">Error loading preview</div>;
  }

  let o = 1;
  let n = 1;
  const addBars = Array.from({ length: diff.add }, (_, i) => (
    <span key={"a" + i} className="vbar-add" />
  ));
  const delBars = Array.from({ length: diff.del }, (_, i) => (
    <span key={"d" + i} className="vbar-del" />
  ));

  return (
    <div className="vdiff">
      <div className="vdiff-file">
        <span className="vdiff-chevron">▼</span>
        <span className="vdiff-path">
          {fileName}.xlsx
        </span>
        <span className="vdiff-tag">{typeName}</span>
        <span className="vdiff-file-stats">
          <span className="vstat-add">+{diff.add}</span>
          <span className="vstat-del">−{diff.del}</span>
        </span>
        <span className="vdiff-bar">
          {addBars}
          {delBars}
        </span>
      </div>
      <div className="vdiff-hunk">
        <span className="vdiff-hunk-menu">⋯</span>
        <span className="vdiff-hunk-text">
          @@ -1,{Math.max(1, diff.oldLen)} +1,{Math.max(1, diff.newLen)} @@
        </span>
      </div>
      <div className="vdiff-lines">
        {diff.lines.map((ln, i) => {
          const og = ln.type === "del" || ln.type === "ctx" ? String(o++) : "";
          const ng = ln.type === "add" || ln.type === "ctx" ? String(n++) : "";
          const pfx = ln.type === "add" ? "+" : ln.type === "del" ? "−" : " ";
          return (
            <div key={i} className={"vline " + ln.type}>
              <span className="vnum old">{og}</span>
              <span className="vnum new">{ng}</span>
              <span className="vpfx">{pfx}</span>
              <span className="vcode">{ln.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
