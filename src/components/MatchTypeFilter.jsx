import "./matchTypeFilter.css";

export default function MatchTypeFilter({ value, onChange }) {
  return <nav className="match-type-filter" aria-label="Competición">
    {[["league", "Liga"], ["friendly", "Amistosos"]].map(([type, label]) =>
      <button key={type} type="button" className="match-type-filter__option" aria-pressed={value === type}
        onClick={() => onChange(type)}>{label}</button>)}
  </nav>;
}
