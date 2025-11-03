// src/components/KpiSparkCard.jsx
import React from "react";

const GOLD = "var(--color-gold, #d4af37)";
const WHITE = "#ffffff";
// Estos colores ya los usábamos para el delta
const GREEN = "#55ff99";
const RED   = "#ff6470";
const GREY  = "#9aa0a6";

// Dibuja sparkline interno (SVG) normalizando data al alto disponible
function SparkBG({ data = [], color = GOLD }) {
  if (!data || data.length === 0) return null;
  const w = 300; // el SVG se escala por CSS
  const h = 72;
  const pad = 6;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const dx = (w - pad * 2) / Math.max(1, data.length - 1);
  const normY = (v) => {
    if (max === min) return h / 2;
    const t = (v - min) / (max - min);
    return h - pad - t * (h - pad * 2);
  };
  const points = data.map((v, i) => `${pad + i * dx},${normY(v)}`).join(" ");

  return (
    <svg
      className="kpi-sparkline-bg"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function KpiSparkCard({
  title,            // string (ej: "PTS" / "FG% — Total")
  mainValue,        // string ya formateada (ej: "17.3", "41.7%")
  subLabel,         // string extra (ej: "⌀ por partido", "50/120")
  series = [],      // números por partido para sparkline
  deltaVal = 0,     // diferencia último - anterior (número)
  deltaText,        // string delta formateada (si lo pasas, se usa tal cual)
  positiveIsGood = true, // FG% ↑ es bueno; TOV ↑ no lo es, etc.
}) {
  // Flecha basada en el signo REAL de la diferencia
  const sign = deltaVal > 0 ? "↑" : deltaVal < 0 ? "↓" : "•";

  // Tendencia (mejora/empeora) teniendo en cuenta positiveIsGood
  let trend = "neutral"; // "up" (mejor), "down" (peor), "neutral"
  if (deltaVal !== 0) {
    const improvement =
      (deltaVal > 0 && positiveIsGood) || (deltaVal < 0 && !positiveIsGood);
    trend = improvement ? "up" : "down";
  }

  // Color para mantener compatibilidad visual con lo que ya tenías
  const color =
    trend === "neutral" ? GREY : trend === "up" ? GREEN : RED;

  const deltaClass = `kpi-delta ${
    trend === "up"
      ? "kpi-delta--up"
      : trend === "down"
      ? "kpi-delta--down"
      : "kpi-delta--neutral"
  }`;

  return (
    <div className="card card--p kpi-card">
      {/* Sparkline de fondo */}
      <SparkBG data={series} />

      {/* Encabezado */}
      <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>
        {title}
      </div>

      {/* Valor principal + delta */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className="kpi-value" style={{ color: WHITE }}>
          {mainValue}
        </div>
        <div className={deltaClass} style={{ color }}>
          {deltaText ?? `${sign} ${Math.abs(deltaVal).toString()}`}
        </div>
      </div>

      {/* Subtítulo (m/a, etc.) */}
      {subLabel && (
        <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>
          {subLabel}
        </div>
      )}
    </div>
  );
}
