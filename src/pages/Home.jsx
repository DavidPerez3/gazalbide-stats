import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMatches } from "../lib/data";

export default function Home() {
  const [matches, setMatches] = useState([]);
  useEffect(() => { getMatches().then(setMatches); }, []);

  return (
    <section>
      <h2 className="mb-4" style={{fontSize: '22px', fontWeight: 700, color: 'var(--color-gold)'}}>Partidos</h2>
      <div className="grid grid--2">
        {matches.map(m => (
          <Link key={m.id} to={`/partido/${m.id}`} className="card card--p">
            <div className="flex justify-between items-center">
              <div>
                <div style={{fontSize:'18px', fontWeight:600}}>{m.date || "Fecha"}</div>
                <div className="text-dim">vs {m.opponent || "—"}</div>
              </div>
              <span className="badge">Ver</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
