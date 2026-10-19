export default function MatchTypeFilter({ value, onChange }) {
  return <nav className="home-filters" aria-label="Competición" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
    {[["league", "Liga"], ["friendly", "Amistosos"]].map(([type, label]) =>
      <button key={type} type="button" className="btn" aria-pressed={value === type}
        style={{ borderColor: value === type ? "#dbb748" : "#444", color: value === type ? "#dbb748" : "inherit" }}
        onClick={() => onChange(type)}>{label}</button>)}
  </nav>;
}
