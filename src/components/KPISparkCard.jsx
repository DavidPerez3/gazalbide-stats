// src/components/KpiSparkCard.jsx
import React from "react";

const GOLD = "var(--color-gold, #d4af37)";
const WHITE = "#ffffff";
const GREEN = "#55ff99";
const RED   = "#ff6470";
const GREY  = "#9aa0a6";

// Dibuja sparkline interno (SVG) normalizando data al alto disponible
function SparkBG({ data = [], color = GOLD, opacity = 0.18 }) {
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
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
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
  positiveIsGood = true, // para colorear delta (FG% ↑ es bueno, TOV ↑ no lo sería)
}) {
  const sign = deltaVal > 0 ? "↑" : deltaVal < 0 ? "↓" : "•";
  const color =
    deltaVal === 0
      ? GREY
      : (positiveIsGood ? (deltaVal > 0 ? GREEN : RED) : (deltaVal > 0 ? RED : GREEN));

  return (
    <div className="card card--p" style={{ position: "relative", overflow: "hidden" }}>
      {/* Sparkline de fondo */}
      <SparkBG data={series} />

      {/* Encabezado */}
      <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>
        {title}
      </div>

      {/* Valor principal + delta */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: WHITE }}>{mainValue}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color }}>
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
