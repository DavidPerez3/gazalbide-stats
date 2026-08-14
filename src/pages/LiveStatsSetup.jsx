import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_ROSTER_SIZE, MAX_ON_COURT } from "../features/live-stats/rules.js";
import { saveLiveSetup } from "../features/live-stats/localSession.js";
import "../live-stats.css";

export default function LiveStatsSetup() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [starters, setStarters] = useState([]);
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [gazalSide, setGazalSide] = useState("home");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/players.json`)
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar la plantilla.");
        return response.json();
      })
      .then((data) => setPlayers(data || []))
      .catch((err) => setError(err.message));
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const starterSet = useMemo(() => new Set(starters), [starters]);

  function toggleRoster(number) {
    setError("");
    if (selectedSet.has(number)) {
      setSelected((prev) => prev.filter((value) => value !== number));
      setStarters((prev) => prev.filter((value) => value !== number));
      return;
    }
    if (selected.length >= MAX_ROSTER_SIZE) {
      setError(`Solo se pueden convocar ${MAX_ROSTER_SIZE} jugadores.`);
      return;
    }
    setSelected((prev) => [...prev, number]);
  }

  function toggleStarter(number) {
    setError("");
    if (!selectedSet.has(number)) return;
    if (starterSet.has(number)) {
      setStarters((prev) => prev.filter((value) => value !== number));
      return;
    }
    if (starters.length >= MAX_ON_COURT) {
      setError(`El quinteto inicial debe tener exactamente ${MAX_ON_COURT} jugadores.`);
      return;
    }
    setStarters((prev) => [...prev, number]);
  }

  function startGame() {
    setError("");
    if (selected.length < MAX_ON_COURT) {
      setError("Debes convocar al menos 5 jugadores.");
      return;
    }
    if (selected.length > MAX_ROSTER_SIZE) {
      setError(`No puedes convocar más de ${MAX_ROSTER_SIZE} jugadores.`);
      return;
    }
    if (starters.length !== MAX_ON_COURT) {
      setError("Debes seleccionar exactamente 5 titulares.");
      return;
    }

    const roster = players
      .filter((player) => selectedSet.has(String(player.number)))
      .map((player) => ({
        id: String(player.number),
        number: String(player.number),
        name: player.name,
      }));

    saveLiveSetup({
      opponent: opponent.trim() || "Rival",
      matchDate,
      gazalSide,
      roster,
      starterIds: starters,
      createdAt: new Date().toISOString(),
    });

    navigate("/admin/live");
  }

  return (
    <div className="live-setup">
      <header className="live-setup__header">
        <div>
          <p className="live-kicker">Live Stats · preparación</p>
          <h1>Convocatoria y quinteto inicial</h1>
          <p className="text-dim">Máximo 12 convocados · exactamente 5 titulares.</p>
        </div>
        <div className="live-setup__counters">
          <strong>{selected.length}/12</strong><span>convocados</span>
          <strong>{starters.length}/5</strong><span>titulares</span>
        </div>
      </header>

      <section className="live-setup__meta card card--p">
        <label>Rival<input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Nombre del rival" /></label>
        <label>Fecha<input className="input" type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} /></label>
        <label>Gazalbide<select className="input" value={gazalSide} onChange={(e) => setGazalSide(e.target.value)}><option value="home">Local</option><option value="away">Visitante</option></select></label>
      </section>

      {error && <div className="live-alert live-alert--error">{error}</div>}

      <section className="live-roster-picker">
        {players.map((player) => {
          const number = String(player.number);
          const isSelected = selectedSet.has(number);
          const isStarter = starterSet.has(number);
          return (
            <article key={number} className={`live-roster-card${isSelected ? " live-roster-card--selected" : ""}${isStarter ? " live-roster-card--starter" : ""}`}>
              <button type="button" className="live-roster-card__main" onClick={() => toggleRoster(number)}>
                <span className="live-roster-card__number">#{number}</span>
                <span className="live-roster-card__name">{player.name}</span>
                <span className="live-roster-card__state">{isSelected ? "Convocado" : "Fuera"}</span>
              </button>
              <button type="button" className="live-roster-card__starter" disabled={!isSelected} onClick={() => toggleStarter(number)}>
                {isStarter ? "★ Titular" : "☆ Titular"}
              </button>
            </article>
          );
        })}
      </section>

      <div className="live-setup__footer">
        <button type="button" className="live-primary-action" onClick={startGame}>Entrar a Live Stats →</button>
      </div>
    </div>
  );
}
