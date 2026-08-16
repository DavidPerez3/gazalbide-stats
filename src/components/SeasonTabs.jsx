import { useSeason } from "../context/SeasonContext.jsx";
import "../seasons.css";

export default function SeasonTabs() {
  const { seasons, activeSeasonId, setActiveSeasonId } = useSeason();

  if (seasons.length > 2) {
    return (
      <div className="season-tabs-wrap">
        <div className="container">
          <label className="season-select">
            <span>Temporada</span>
            <select
              className="input"
              value={activeSeasonId}
              onChange={(event) => setActiveSeasonId(event.target.value)}
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.label}{season.current ? " · Actual" : " · Histórico"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="season-tabs-wrap">
      <div className="container">
        <div className="season-tabs" role="tablist" aria-label="Temporada">
          {seasons.map((season) => {
            const selected = season.id === activeSeasonId;
            return (
              <button
                key={season.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`season-tab${selected ? " season-tab--active" : ""}`}
                onClick={() => setActiveSeasonId(season.id)}
              >
                <span>{season.label}</span>
                <small>{season.current ? "Actual" : "Histórico"}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
