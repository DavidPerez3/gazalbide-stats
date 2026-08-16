import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { loadLiveRuntime, loadLiveSetup } from "../features/live-stats/localSession.js";

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function ActiveLiveShortcut() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  if (!profile?.is_admin) return null;

  const setup = loadLiveSetup();
  if (!setup?.matchId) return null;
  const runtime = loadLiveRuntime();

  return (
    <button
      type="button"
      className="active-live-shortcut"
      onClick={() => navigate("/admin/live")}
      aria-label="Volver al partido Live activo"
    >
      <span className="active-live-shortcut__pulse" aria-hidden="true" />
      <span>
        <strong>LIVE ACTIVO · {setup.opponent || "Rival"}</strong>
        <small>
          {runtime ? `Q${runtime.period || 1} · ${formatClock(runtime.clockMs)}` : "Volver al anotador"}
        </small>
      </span>
      <b>VOLVER →</b>
    </button>
  );
}
