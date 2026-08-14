import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { api } from "@/lib/api";
import type { SheetFile } from "@/lib/types";

export default function SheetPage() {
  const { id } = useParams();
  const [file, setFile] = useState<SheetFile | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getFile(id)
      .then(setFile)
      .catch(() => setFile(null));
  }, [id]);

  if (!file) return null;

  return (
    <div className="home-pane">
      <div className="empty-state">
        <div className="empty-state-title">{file.name}</div>
        <div className="empty-state-sub">Sheet editing arrives in Phase 3</div>
      </div>
    </div>
  );
}
