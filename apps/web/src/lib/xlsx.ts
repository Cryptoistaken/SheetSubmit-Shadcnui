import * as XLSX from "xlsx";
import { FILE_TYPE_DEFS } from "./types";
import type { ColumnDef, FileType, Row } from "./types";

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export interface ImportXlsxResult {
  id: string;
  name: string;
  type: FileType;
  rows: Row[];
  dataCount: number;
}

export async function importXlsx(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  existingFiles: { name: string }[],
): Promise<ImportXlsxResult> {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (json.length < 1) throw new Error("File is empty");
  const headers = (json[0] || []).map((h) => String(h).toLowerCase().trim());

  let typeKey: FileType = "fb_cookie";
  let bestMatch = 0;
  for (const tk of Object.keys(FILE_TYPE_DEFS) as FileType[]) {
    const tdef = FILE_TYPE_DEFS[tk];
    const matches = tdef.columns.filter(
      (c) =>
        headers.indexOf(c.key.toLowerCase()) !== -1 ||
        headers.indexOf(c.label.toLowerCase()) !== -1,
    );
    if (matches.length > bestMatch) {
      bestMatch = matches.length;
      typeKey = tk;
    }
  }

  const td = FILE_TYPE_DEFS[typeKey];
  let colMap: { key: string; idx: number }[];
  let dataStart: number;
  if (bestMatch > 0) {
    colMap = td.columns
      .map((c) => {
        let idx = headers.indexOf(c.key.toLowerCase());
        if (idx === -1) idx = headers.indexOf(c.label.toLowerCase());
        return { key: c.key, idx };
      })
      .filter((cm) => cm.idx !== -1);
    dataStart = 1;
  } else {
    let isFb = false;
    for (let si = 0; si < Math.min(3, json.length); si++) {
      const rowVals = json[si] || [];
      for (let sj = 0; sj < rowVals.length; sj++) {
        const val = String(rowVals[sj]).toLowerCase();
        if (val.indexOf("c_user=") !== -1 || val.indexOf("ds_user_id=") !== -1) {
          isFb = true;
          break;
        }
      }
      if (isFb) break;
    }
    if (isFb) typeKey = "fb_cookie";
    colMap = td.columns.map((c, i) => ({ key: c.key, idx: i }));
    dataStart = 0;
  }

  const rows: Row[] = [];
  for (let i = dataStart; i < json.length; i++) {
    const row: Row = {};
    let hasData = false;
    const source = json[i] || [];
    for (const cm of colMap) {
      const val = source[cm.idx] || "";
      row[cm.key] = String(val);
      if (val) hasData = true;
    }
    if (hasData) rows.push(row);
  }

  if (typeKey === "fb_cookie") {
    for (const r of rows) {
      if (!r.uid && r.cookies) {
        const m = r.cookies.match(/c_user=(\d+)/);
        if (m) r.uid = m[1];
      }
    }
  }

  if (rows.length === 0) throw new Error("No data rows found");

  let name = fileName.replace(/\.xlsx?$/i, "") || "Import " + todayStr();
  if (existingFiles.some((f) => f.name === name)) {
    name = name + " (" + genId().slice(0, 4) + ")";
  }
  const id = genId();

  return { id, name, type: typeKey, rows, dataCount: rows.length };
}

export function buildXlsx(rows: Row[], columns: ColumnDef[]): ArrayBuffer {
  const data: string[][] = [];
  rows.forEach((row) => {
    const isEmpty = columns.every((c) => !row[c.key]);
    if (!isEmpty) data.push(columns.map((c) => row[c.key] || ""));
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function downloadXlsx(rows: Row[], columns: ColumnDef[], fileName: string): void {
  const buf = buildXlsx(rows, columns);
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (fileName || "export") + ".xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
