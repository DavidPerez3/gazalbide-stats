import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CURRENT_SEASON_ID } from "../../lib/seasons.js";
import { restoreLiveSessionFromRemote } from "./localSession.js";
import { loadRemoteLiveSession } from "./supabaseSync.js";
import { discardRemoteLiveSession } from "./supabaseSync.js";
import {
  listPublishedLiveMatches,
  reopenPublishedLiveMatch,
} from "./livePublication.js";

export default function PublishedLiveMatchesPanel() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listPublishedLiveMatches(CURRENT_SEASON_ID)
      .then((rows) => {
        if (!cancelled) setMatches(rows || []);
      })
      .catch((loadError) => {
        console.warn("No se pudieron cargar publicaciones Live:", loadError);
        if (!cancelled) setError("No se pudieron consultar los partidos publicados.");
      });
    return () => { cancelled = true; };
  }, []);

  if (matches.length === 0 && !error) return null;

  async function reopen(match) {
    if (loadingId) return;
    if (!window.confirm(
      `¿Reabrir ${match.opponent} (${match.gazal_pts}–${match.opp_pts})? La versión ${match.publication_version} seguirá guardada en auditoría hasta que publiques la corrección.`
    )) return;

    setLoadingId(match.id);
    setError("");
    try {
      await reopenPublishedLiveMatch(match.id);
      const remote = await loadRemoteLiveSession(match.id);
      restoreLiveSessionFromRemote(remote);
      navigate("/admin/live");
    } catch (reopenError) {
      console.error("No se pudo reabrir el partido publicado:", reopenError);
      setError(reopenError?.message || "No se pudo reabrir el partido publicado.");
      setLoadingId(null);
    }
  }

  async function discardFriendly(match) {
    if (loadingId || !match.is_friendly) return;
    if (!window.confirm(`¿Borrar el amistoso publicado contra ${match.opponent} (${match.date})? Se quitará de las estadísticas, rankings e historial del club. Esta operación es irreversible.`)) return;
    setLoadingId(match.id);
    setError("");
    try {
      await discardRemoteLiveSession(match.id);
      setMatches((current) => current.filter((row) => row.id !== match.id));
    } catch (err) {
      setError(err.message || "No se pudo borrar el amistoso.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="card card--p">
      <p className="live-kicker">Correcciones posteriores</p>
      <h2>Publicaciones Live recientes</h2>
      <p className="text-dim">
        Reabrir conserva la última versión oficial y su auditoría. La corrección solo sustituye esos datos cuando se publica una nueva versión completa.
      </p>
      {error ? <div className="live-alert live-alert--error">{error}</div> : null}
      <div className="live-setup__footer">
        {matches.map((match) => (
          <div key={match.id} className="live-setup__session-actions">
            <button type="button" onClick={() => reopen(match)} disabled={Boolean(loadingId)}>
              {loadingId === match.id ? "Procesando…" : `Reabrir v${match.publication_version} · ${match.date} · ${match.opponent}${match.is_friendly ? " · Amistoso" : ""}`}
            </button>
            {match.is_friendly ? <button type="button" className="live-setup__discard" onClick={() => discardFriendly(match)} disabled={Boolean(loadingId)}>Borrar amistoso</button> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
