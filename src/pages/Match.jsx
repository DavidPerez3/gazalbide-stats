import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getMatches, getMatchStats } from "../lib/data";

// Helpers % y minutos
const pctNum = (m, a) => (Number(a) > 0 ? (Number(m) / Number(a)) * 100 : 0);
const pctTxt = (m, a) => pctNum(m, a).toFixed(1) + "%";

const mmssToSecs = (v) => {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return Number(s) || 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
const secsToMMSS = (secs) => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};
const getMinSecs = (row) => {
  if (row.min != null) return mmssToSecs(row.min);
  if (row.min_str != null) return mmssToSecs(row.min_str);
  return 0;
};
const getMinTxt = (row) => {
  if (row.min_str) return row.min_str;
  return secsToMMSS(getMinSecs(row));
};

export default function Match() {
  const { id } = useParams();
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Orden
  const [sortKey, setSortKey] = useState("number");
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

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
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Definición columnas
  const columns = [
    { key: "number", title: "#", getSort: (r) => Number(r.number) || 0, render: (r) => r.number ?? "" },
    { key: "name", title: "Jugador", getSort: (r) => String(r.name || "").toLowerCase(), render: (r) => r.name ?? "" },
    { key: "min", title: "MIN", getSort: (r) => getMinSecs(r), render: (r) => getMinTxt(r) },
    { key: "pts", title: "PTS", getSort: (r) => Number(r.pts) || 0, render: (r) => r.pts ?? 0 },
    { key: "reb", title: "REB", getSort: (r) => Number(r.reb) || 0, render: (r) => r.reb ?? 0 },
    { key: "ast", title: "AST", getSort: (r) => Number(r.ast) || 0, render: (r) => r.ast ?? 0 },
    { key: "fg_pct", title: "FG%", getSort: (r) => pctNum(r.fgm, r.fga), render: (r) => pctTxt(r.fgm, r.fga) },
    { key: "two_pct", title: "2P%", getSort: (r) => pctNum(r.two_pm, r.two_pa), render: (r) => pctTxt(r.two_pm, r.two_pa) },
    { key: "three_pct", title: "3P%", getSort: (r) => pctNum(r.three_pm, r.three_pa), render: (r) => pctTxt(r.three_pm, r.three_pa) },
    { key: "ft_pct", title: "FT%", getSort: (r) => pctNum(r.ftm, r.fta), render: (r) => pctTxt(r.ftm, r.fta) },
    { key: "stl", title: "ROB", getSort: (r) => Number(r.stl) || 0, render: (r) => r.stl ?? 0 },
    { key: "blk", title: "BLK", getSort: (r) => Number(r.blk) || 0, render: (r) => r.blk ?? 0 },
    { key: "tov", title: "TOV", getSort: (r) => Number(r.tov) || 0, render: (r) => r.tov ?? 0 },
    { key: "pf", title: "PF", getSort: (r) => Number(r.pf) || 0, render: (r) => r.pf ?? 0 },
    { key: "pfd", title: "PFD", getSort: (r) => Number(r.pfd) || 0, render: (r) => r.pfd ?? 0 },
    { key: "plus_minus", title: "+/-", getSort: (r) => Number(r.plus_minus) || 0, render: (r) => r.plus_minus ?? 0 },
    { key: "pir", title: "PIR", getSort: (r) => Number(r.pir) || 0, render: (r) => r.pir ?? 0 },
    { key: "eff", title: "EFF", getSort: (r) => Number(r.eff) || 0, render: (r) => r.eff ?? 0 },
  ];

  const activeCol = columns.find((c) => c.key === sortKey) || columns[0];

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const getter = activeCol.getSort;
    arr.sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (typeof va === "string" || typeof vb === "string") {
        const cmp = String(va).localeCompare(String(vb), "es", { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      }
      const na = Number.isFinite(va) ? va : -Infinity;
      const nb = Number.isFinite(vb) ? vb : -Infinity;
      const cmp = na - nb;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, activeCol, sortDir]);

  const onClickHeader = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const Indicator = ({ colKey }) =>
    colKey === sortKey ? <span className="sort-ind">{sortDir === "asc" ? "▲" : "▼"}</span> : null;

  if (loading) return <section><div className="text-dim">Cargando partido…</div></section>;
  if (!meta) {
    return (
      <section>
        <h2 style={{ fontSize: "22px", fontWeight: 700 }}>Partido no encontrado</h2>
        <div className="text-dim">ID: {id}</div>
      </section>
    );
  }

  const hasScore = typeof meta.gazal_pts === "number" && typeof meta.opp_pts === "number";
  const q_pf = Array.isArray(meta.q_pf) ? meta.q_pf : [];
  const q_pa = Array.isArray(meta.q_pa) ? meta.q_pa : [];

  return (
    <section className="space-y-4">
      {/* Título */}
      <h2 style={{ fontSize: "22px", fontWeight: 700 }}>
        <span style={{ color: "var(--color-gold)" }}>{meta.date || "Fecha"}</span> · vs {meta.opponent || "—"}
      </h2>

      {/* Marcador y parciales */}
      <div className="card card--p" style={{ marginBottom: 16 }}>
        <div className="flex justify-between items-center">
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-gold)" }}>Marcador</div>
          {hasScore && (
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              Gazalbide {meta.gazal_pts} — {meta.opp_pts} {meta.result ? `(${meta.result})` : ""}
            </div>
          )}
        </div>

        {(q_pf.length === 4 || q_pa.length === 4) && (
          <div className="quarters-grid" style={{ marginTop: 12 }}>
            {["Q1", "Q2", "Q3", "Q4"].map((q, i) => (
              <div key={q} className="card quarter" style={{ padding: 10 }}>
                <div className="text-dim" style={{ fontSize: 12, marginBottom: 4 }}>{q}</div>
                <div style={{ fontWeight: 700 }}>
                  {(q_pf[i] ?? "—")} — {(q_pa[i] ?? "—")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabla con ordenación y columnas sticky */}
      <div
        className="card table-wrap relative overflow-x-auto"
        style={{
          padding: 8,
          "--table-bg": "#0b0b0b", // color de fondo de las celdas (ajústalo a tu tema)
        }}
      >
        {/* MÁSCARA IZQUIERDA: tapa líneas/bordes al hacer scroll */}
        <div className="pointer-events-none sticky left-0 top-0 h-full w-3 bg-[var(--table-bg)] z-[60]" />

        <table className="table sticky-first-two border-separate w-full">
          <thead>
            <tr>
              {columns.map((c) => {
                const isNum = c.key === "number";
                const isName = c.key === "name";
                return (
                  <th
                    key={c.key}
                    className={[
                      // 👇 header sticky arriba
                      "sticky top-0 z-40 bg-[var(--table-bg)]",
                      // 👇 primera columna: sticky a la izq + z por encima
                      isNum ? "col-num left-0 z-60" : "",
                      // 👇 segunda columna: sticky a la izq calculada + z intermedia
                      isName ? "col-name [left:var(--col-num-w)] z-50" : "",
                      "px-3 py-2 text-left whitespace-nowrap"
                    ].join(" ")}
                    role="columnheader"
                    aria-sort={
                      c.key === sortKey
                        ? (sortDir === "asc" ? "ascending" : "descending")
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => onClickHeader(c.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onClickHeader(c.key);
                      }}
                      title={`Ordenar por ${c.title}`}
                    >
                      {c.title}
                      <Indicator colKey={c.key} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => (
              <tr key={i} className="hover:bg-neutral-900">
                {columns.map((c) => {
                  const isNum = c.key === "number";
                  const isName = c.key === "name";
                  return (
                    <td
                      key={c.key}
                      className={`${isNum ? "col-num sticky left-0 z-30 bg-[var(--table-bg)]" : ""} ${
                        isName
                          ? "col-name sticky z-20 [left:var(--col-num-w)] bg-[var(--table-bg)]"
                          : ""
                      } px-3 py-2 whitespace-nowrap`}
                    >
                      {isName ? (
                        <span className="cell-name">{c.render(r)}</span>
                      ) : (
                        c.render(r)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
