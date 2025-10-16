import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getMatches, getMatchStats } from "../lib/data";

// helper % por fila
const pct = (m, a) => (Number(a) > 0 ? ((Number(m) / Number(a)) * 100).toFixed(1) : "0.0");

export default function Match() {
  const { id } = useParams();
  const [meta, setMeta] = useState(null);   // { id, date, opponent, ... }
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const matches = await getMatches();
        const found = matches.find((m) => m.id === id) || null;
        if (!cancelled) setMeta(found);

        const stats = await getMatchStats(id);
        if (!cancelled) setRows(stats || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const cols = [
    "number","name","min_str","pts","reb","ast","stl","blk","tov","pf","pfd","plus_minus","pir","eff"
  ];
  const head = {
    number:"Nº", name:"Jugador", min_str:"MIN", pts:"PTS", reb:"REB", ast:"AST",
    stl:"ROB", blk:"BLK", tov:"TOV", pf:"PF", pfd:"PFD", plus_minus:"+/-", pir:"PIR", eff:"EFF"
  };

  if (loading) {
    return <section><div className="text-dim">Cargando partido…</div></section>;
  }

  if (!meta) {
    return (
      <section>
        <h2 style={{fontSize:'22px', fontWeight:700}}>
          Partido no encontrado
        </h2>
        <div className="text-dim">ID: {id}</div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {/* Título: fecha + vs Oponente */}
      <h2 style={{fontSize:'22px', fontWeight:700}}>
        <span style={{color:'var(--color-gold)'}}>{meta.date || "Fecha"}</span> · vs {meta.opponent || "—"}
      </h2>

      {/* Tabla principal */}
      <div className="card" style={{ padding: "8px", overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>FG%</th>
              <th>2P%</th>
              <th>3P%</th>
              <th>FT%</th>
              <th>PIR</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name || "—"}</td>
                <td>{r.min_str ?? ""}</td>
                <td>{r.pts}</td>
                <td>{r.reb}</td>
                <td>{r.ast}</td>
                <td>{pct(r.fgm, r.fga)}%</td>
                <td>{pct(r.two_pm, r.two_pa)}%</td>
                <td>{pct(r.three_pm, r.three_pa)}%</td>
                <td>{pct(r.ftm, r.fta)}%</td>
                <td>{r.pir}</td>
                <td>{r.plus_minus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
