// src/components/Sparkline.jsx
export default function Sparkline({
  data = [],          // array de números
  width = 220,
  height = 48,
  stroke = "#d4af37", // dorado del club
  fill = "none",
  strokeWidth = 2,
  showLast = true,    // etiqueta del último valor
  suffix = "",        // p.ej. "%" para FG%
}) {
  if (!data || data.length === 0) {
    return <div className="text-dim" style={{ fontSize: 12 }}>Sin datos</div>;
  }

  const w = width;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = 4;
  const dx = (w - pad * 2) / Math.max(1, data.length - 1);

  const normY = (v) => {
    if (max === min) return h / 2;
    const t = (v - min) / (max - min);
    return h - pad - t * (h - pad * 2);
  };

  const points = data.map((v, i) => `${pad + i * dx},${normY(v)}`).join(" ");
  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : last;
  const delta = last - prev;
  const colorDelta = delta > 0 ? "#55ff99" : delta < 0 ? "#ff6470" : "#cccccc";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {fill !== "none" && (
          <polyline
            points={`${points} ${w - pad},${h - pad} ${pad},${h - pad}`}
            fill={fill}
            stroke="none"
          />
        )}
        <polyline points={points} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {showLast && (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>{Number.isFinite(last) ? (last % 1 ? last.toFixed(1) : last) : "-" }{suffix}</div>
          <div className="text-dim" style={{ fontSize: 12, color: colorDelta }}>
            {delta > 0 ? "↑" : delta < 0 ? "↓" : "•"} {Number.isFinite(delta) ? (Math.abs(delta) % 1 ? Math.abs(delta).toFixed(1) : Math.abs(delta)) : 0}{suffix}
          </div>
        </div>
      )}
    </div>
  );
}
