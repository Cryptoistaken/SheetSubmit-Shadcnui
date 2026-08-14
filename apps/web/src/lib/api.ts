import type { Row, SheetFile } from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // ── Files ──
  getFiles: () => request<SheetFile[]>("/files"),
  getFile: (id: string) => request<SheetFile>(`/files/${id}`),
  createFile: (data: { id: string; name: string; type: string }) =>
    request<SheetFile>("/files", { method: "POST", body: JSON.stringify(data) }),
  updateFile: (id: string, data: Partial<SheetFile>) =>
    request<SheetFile>(`/files/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFile: (id: string) => request<{ ok: boolean }>(`/files/${id}`, { method: "DELETE" }),
  getRows: (id: string) => request<Row[]>(`/files/${id}/rows`),
  persist: (id: string, data: unknown) =>
    request<{ ok: boolean }>(`/files/${id}/persist`, { method: "PUT", body: JSON.stringify(data) }),

  // ── Auth ──
  me: () => request<unknown>("/auth/me"),
};
