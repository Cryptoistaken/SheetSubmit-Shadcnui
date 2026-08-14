import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import SheetToolbar from "@/components/sheet/SheetToolbar";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useSheetStore } from "@/stores/sheetStore";

interface ConnState {
  cls: "ok" | "err" | "";
  text: string;
}

export default function Topbar() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const file = useSheetStore((s) => s.file);

  const [conn, setConn] = useState<ConnState>({ cls: "", text: "Connecting..." });
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Health polling — port of app.js checkConn (15s interval, 1.5x backoff to 2min).
  useEffect(() => {
    let cancelled = false;
    let interval = 15000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      api
        .health()
        .then((h) => {
          interval = 15000;
          if (cancelled) return;
          const ok = h.status === "ok" || h.status === "ready";
          setConn(ok ? { cls: "ok", text: "Connected" } : { cls: "", text: "Reconnecting..." });
        })
        .catch(() => {
          if (cancelled) return;
          setConn({ cls: "err", text: "Disconnected" });
          interval = Math.min(interval * 1.5, 120000);
        });
    };
    const schedule = () => {
      timer = setTimeout(() => {
        check();
        schedule();
      }, interval);
    };
    check();
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Close gear panel on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(t) &&
        btnRef.current &&
        !btnRef.current.contains(t)
      ) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  if (!user) return null;

  const isFilePage = location.pathname.startsWith("/file/");
  const displayName = ((user.firstName ?? "") + " " + (user.lastName ?? "")).trim();
  const fileName = file
    ? file.name.length > 10
      ? file.name.substring(0, 10) + "…"
      : file.name
    : "";

  const logout = () => {
    api.logout().then(() => window.location.reload());
  };

  return (
    <div className="topbar">
      <div className="topbar-l">
        <img
          src={theme === "dark" ? "/logo-dark.svg" : "/logo-light.svg"}
          className="topbar-logo"
          alt="Logo"
        />
        <span className="home-top-title">Sheet Submit</span>
        <button
          className={`back-btn${isFilePage ? " visible" : ""}`}
          onClick={() => navigate("/")}
        >
          <span className="back-btn-chevron">{"\u2039"}</span>
        </button>
        <button
          className={"sheet-title-btn" + (isFilePage ? " visible" : "")}
          title={file ? file.name : "Rename file"}
        >
          {fileName}
        </button>
      </div>
      <div className="topbar-r">
        {isFilePage && <SheetToolbar />}
        <span className={`conn-status${conn.cls ? " " + conn.cls : ""}`}>
          <span className="conn-status-dot"></span>
          <span>{conn.text}</span>
        </span>
        <button
          ref={btnRef}
          className={`profile-btn${user.photoUrl ? " loaded" : ""}`}
          title="User menu"
          onClick={(e) => {
            e.stopPropagation();
            setPanelOpen((o) => !o);
          }}
        >
          <img className="user-btn-avatar" src={user.photoUrl ?? ""} alt="" />
        </button>
        <div ref={panelRef} className={`gear-settings-panel${panelOpen ? " open" : ""}`}>
          <div className="gear-user-card">
            <img className="gear-user-avatar" src={user.photoUrl ?? ""} alt="" />
            <div className="gear-user-info">
              <div className="gear-user-name">{displayName}</div>
              <div className="gear-user-username">
                {user.username ? "@" + user.username : ""}
              </div>
            </div>
          </div>
          <div className="gear-divider"></div>
          <div className="gear-settings-title">Settings</div>
          <div className="gear-toggle-row">
            <div>
              <div className="gear-toggle-label">Night mode</div>
              <div className="gear-toggle-sub">Dark background theme</div>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={theme === "dark"} onChange={toggle} />
              <span className="toggle-track"></span>
            </label>
          </div>
          <div className="gear-divider"></div>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
