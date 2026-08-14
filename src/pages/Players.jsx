import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getPlayers } from "../lib/data";
import { useSeason } from "../context/SeasonContext.jsx";

export default function Players() {
  const { activeSeason } = useSeason();
  const [q, setQ] = useState("");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlayers().then((data) => {
      setPlayers(data || []);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const f = players.filter((p) =>
      (p.name || "").toLowerCase().includes(q.toLowerCase()) ||
      String(p.number).includes(q)
    );
    return f.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  }, [players, q]);

  return (
    <section>
      <div className="mb-4">
        <h2 style={{fontSize:22,fontWeight:700,color:"var(--color-gold)"}}>Jugadores</h2>
        <div className="text-dim" style={{fontSize:12}}>Plantilla · {activeSeason.label}</div>
      </div>

      {loading ? (
        <div className="text-dim">Cargando…</div>
      ) : players.length === 0 ? (
        <div className="card season-empty">
          <strong>Plantilla {activeSeason.label} pendiente</strong>
          <span>{activeSeason.current ? "Todavía no se ha configurado la plantilla de la nueva temporada. Los jugadores antiguos siguen en 2025-2026 · Histórico." : "No hay jugadores registrados para esta temporada."}</span>
        </div>
      ) : (
        <>
          <input className="input mb-4" placeholder="Buscar por nombre o dorsal..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid grid--3">
            {filtered.map((p) => (
              <div key={`${p.number}-${p.name}`} className="card card--p flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="badge">#{p.number}</span>
                  <div style={{fontWeight:600}}>{p.name}</div>
                </div>
                <Link to={`/jugador/${encodeURIComponent(p.name)}`}>Ver detalle</Link>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
