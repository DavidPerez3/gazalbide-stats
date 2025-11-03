import { useState, useRef, useEffect } from "react";

const ITEMS = [
  { k: "MIN", desc: "Minutos jugados (mostramos mm:ss). En cálculos usamos segundos." },
  { k: "PTS", desc: "Puntos totales anotados." },
  { k: "2PM / 2PA", desc: "Tiros de 2 anotados / intentados. 2P% = 2PM / 2PA." },
  { k: "3PM / 3PA", desc: "Tiros de 3 anotados / intentados. 3P% = 3PM / 3PA." },
  { k: "FGM / FGA", desc: "Tiros de campo totales (2+3) anotados / intentados. FG% = FGM / FGA." },
  { k: "FTM / FTA", desc: "Tiros libres anotados / intentados. FT% = FTM / FTA." },
  { k: "OREB / DREB / REB", desc: "Rebotes ofensivos / defensivos / totales (REB = OREB + DREB)." },
  { k: "AST", desc: "Asistencias." },
  { k: "TOV", desc: "Pérdidas de balón." },
  { k: "STL (ROB)", desc: "Robos." },
  { k: "BLK", desc: "Tapones." },
  { k: "PF / PFD", desc: "Faltas personales cometidas / faltas recibidas." },
  { k: "+/-", desc: "Diferencial de puntos del equipo mientras el jugador estuvo en pista." },
  { k: "PIR", desc: "Player Index Rating (índice global; depende de la planilla usada)." },
  { k: "EFF", desc: "Eficiencia (fórmula del proveedor de estadísticas)." },
];

export default function StatLegend({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = useRef(null);

  // Actualiza la altura máxima para permitir transición suave
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.style.maxHeight = open
        ? bodyRef.current.scrollHeight + "px"
        : "0px";
    }
  }, [open]);

  return (
    <div className="legend">
      <button className="legend__toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "Ocultar leyenda" : "Mostrar leyenda"}
        <span style={{ opacity: 0.7, marginLeft: 8 }}>
          ¿Qué significa cada estadística?
        </span>
      </button>

      <div
        ref={bodyRef}
        className={`legend__body ${open ? "" : "collapsed"}`}
        style={{
          opacity: open ? 1 : 0,
          transition: "max-height 0.3s ease, opacity 0.3s ease",
        }}
      >
        <div className="legend__grid">
          {ITEMS.map(({ k, desc }) => (
            <div key={k} className="legend__item">
              <div className="legend__key">{k}</div>
              <div className="legend__desc">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
