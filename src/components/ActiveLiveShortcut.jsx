import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { loadLiveRuntime, loadLiveSetup } from "../features/live-stats/localSession.js";

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function storageKey(matchId) {
  return `gazalbide.liveShortcutMinimized:${matchId}`;
}

export default function ActiveLiveShortcut() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const setup = loadLiveSetup();
  const runtime = loadLiveRuntime();
  const matchId = setup?.matchId || null;

  const [minimized, setMinimized] = useState(() => {
    if (!matchId) return false;
    try {
      return window.sessionStorage.getItem(storageKey(matchId)) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!profile?.is_admin || !matchId) return undefined;

    document.documentElement.classList.add("gazal-has-live-shortcut");
    document.documentElement.classList.toggle("gazal-live-shortcut-minimized", minimized);

    try {
      window.sessionStorage.setItem(storageKey(matchId), minimized ? "1" : "0");
    } catch {
      // El acceso rápido sigue funcionando aunque sessionStorage esté bloqueado.
    }

    return () => {
      document.documentElement.classList.remove("gazal-has-live-shortcut");
      document.documentElement.classList.remove("gazal-live-shortcut-minimized");
    };
  }, [profile?.is_admin, matchId, minimized]);

  if (!profile?.is_admin || !matchId) return null;

  if (minimized) {
    return (
      <button
        type="button"
        className="active-live-shortcut active-live-shortcut--minimized"
        onClick={() => setMinimized(false)}
        aria-label="Mostrar acceso al partido Live activo"
        title="Mostrar Live activo"
      >
        <span className="active-live-shortcut__pulse" aria-hidden="true" />
        <span className="active-live-shortcut__mini-label">LIVE</span>
      </button>
    );
  }

  return (
    <aside className="active-live-shortcut" aria-label="Partido Live activo">
      <button
        type="button"
        className="active-live-shortcut__main"
        onClick={() => navigate("/admin/live")}
        aria-label="Volver al partido Live activo"
      >
        <span className="active-live-shortcut__pulse" aria-hidden="true" />
        <span className="active-live-shortcut__copy">
          <strong>LIVE ACTIVO · {setup.opponent || "Rival"}</strong>
          <small>
            {runtime ? `Q${runtime.period || 1} · ${formatClock(runtime.clockMs)}` : "Volver al anotador"}
          </small>
        </span>
        <b>VOLVER →</b>
      </button>
      <button
        type="button"
        className="active-live-shortcut__minimize"
        onClick={() => setMinimized(true)}
        aria-label="Minimizar acceso al Live activo"
        title="Minimizar"
      >
        ›
      </button>
    </aside>
  );
}
