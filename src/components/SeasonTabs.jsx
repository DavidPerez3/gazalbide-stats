import { useSeason } from "../context/SeasonContext.jsx";
import "../seasons.css";

export default function SeasonTabs() {
  const { seasons, activeSeasonId, setActiveSeasonId } = useSeason();

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
