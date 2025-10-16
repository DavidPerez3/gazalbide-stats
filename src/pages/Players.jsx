import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getPlayers } from "../lib/data";

export default function Players() {
  const [q, setQ] = useState("");
  const [players, setPlayers] = useState([]);

  useEffect(() => { getPlayers().then(setPlayers); }, []);

  // Filtra y ordena por dorsal (asc)
  const filtered = useMemo(() => {
    const f = players.filter(p =>
      (p.name || "").toLowerCase().includes(q.toLowerCase()) ||
      String(p.number).includes(q)
    );
    return f.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  }, [players, q]);

  return (
    <section>
      <h2 className="mb-4" style={{fontSize:'22px', fontWeight:700, color:'var(--color-gold)'}}>Jugadores</h2>
      <input className="input mb-4" placeholder="Buscar por nombre o dorsal..." value={q} onChange={e=>setQ(e.target.value)} />
      <div className="grid grid--3">
        {filtered.map((p,i)=>(
          <div key={i} className="card card--p flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="badge">#{p.number}</span>
              <div style={{fontWeight:600}}>{p.name}</div>
            </div>
            <Link to={`/jugador/${encodeURIComponent(p.name)}`}>Ver detalle</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
