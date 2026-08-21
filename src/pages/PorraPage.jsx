import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  PORRA_CURRENT_SEASON,
  fetchMyPorraPrediction,
  fetchPorraHistoryForUser,
  fetchPorraQuestions,
  fetchPorraResults,
  fetchPorraRounds,
  fetchPorraStandings,
  formatPorraDeadline,
  isPorraDeadlinePassed,
  savePorraPrediction,
} from "../lib/porra.js";
import "../porra.css";

const TABS = [
  ["round", "Jornada"],
  ["ranking", "Clasificación"],
  ["history", "Mi historial"],
];

function roundState(round) {
  if (!round) return { label: "SIN JORNADA", tone: "muted" };
  if (round.status === "scored") return { label: "RESULTADOS", tone: "done" };
  if (isPorraDeadlinePassed(round)) return { label: "CERRADA", tone: "closed" };
  return { label: "ABIERTA", tone: "open" };
}

function medal(position) {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return position;
}

export default function PorraPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("round");
  const [rounds, setRounds] = useState([]);
  const [round, setRound] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState([]);
  const [standings, setStandings] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const visibleRounds = await fetchPorraRounds(PORRA_CURRENT_SEASON);
      setRounds(visibleRounds);
      const current = visibleRounds.find((item) => item.status === "open") || visibleRounds.find((item) => item.status === "scored") || null;
      setRound(current);

      if (current) {
        const qs = await fetchPorraQuestions(current.id);
        setQuestions(qs);
        const mine = await fetchMyPorraPrediction(current.id, user.id);
        setPrediction(mine);
        setAnswers(mine?.answers || {});
        if (current.status === "scored") {
          setResults(await fetchPorraResults(qs.map((question) => question.id)));
        } else {
          setResults([]);
        }
      } else {
        setQuestions([]);
        setPrediction(null);
        setAnswers({});
        setResults([]);
      }

      const [rankingRows, historyRows] = await Promise.all([
        fetchPorraStandings(PORRA_CURRENT_SEASON),
        fetchPorraHistoryForUser(user.id, PORRA_CURRENT_SEASON),
      ]);
      setStandings(rankingRows);
      setHistory(historyRows);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cargar la Porra.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const state = roundState(round);
  const deadlinePassed = round ? isPorraDeadlinePassed(round) : true;
  const editable = round?.status === "open" && !deadlinePassed;
  const resultByQuestion = useMemo(() => new Map(results.map((result) => [result.question_id, result])), [results]);
  const scoreByQuestion = prediction?.score_breakdown || {};
  const myStanding = standings.find((entry) => entry.userId === user?.id);

  const allAnswered = questions.length > 0 && questions.every((question) => {
    const value = answers[question.id];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });

  async function handleSave() {
    if (!editable || !user || !round) return;
    if (!allAnswered) {
      setError("Completa todas las preguntas antes de guardar la porra.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await savePorraPrediction({ roundId: round.id, userId: user.id, answers });
      setPrediction(saved);
      setMessage("Porra guardada. Puedes cambiarla hasta el deadline.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo guardar la porra.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="porra-page"><div className="container"><div className="porra-empty">Cargando La Porra del Gazal…</div></div></div>;
  }

  return (
    <div className="porra-page">
      <div className="container">
        <header className="porra-hero">
          <div>
            <p className="porra-eyebrow">🎯 LA PORRA DEL GAZAL</p>
            <h1>La clásica Porra vuelve</h1>
            <p>Masculino, femenino y preguntas especiales. Haz tu pronóstico antes del cierre y compite durante toda la temporada.</p>
          </div>
          <div className="porra-season">{PORRA_CURRENT_SEASON}</div>
        </header>

        <nav className="porra-tabs" aria-label="Secciones de la Porra">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" className={tab === value ? "porra-tab porra-tab--active" : "porra-tab"} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </nav>

        {error && <div className="porra-alert porra-alert--error">{error}</div>}
        {message && <div className="porra-alert porra-alert--success">{message}</div>}

        {tab === "round" && (
          <section className="porra-section">
            {!round ? (
              <div className="porra-empty">
                <span className="porra-empty__icon">🎯</span>
                <h2>La próxima Porra todavía no está publicada</h2>
                <p>Cuando el club abra una jornada aparecerán aquí las preguntas y el deadline.</p>
              </div>
            ) : (
              <>
                <article className="porra-round-card">
                  <div className="porra-round-card__top">
                    <div>
                      <span className={`porra-status porra-status--${state.tone}`}>{state.label}</span>
                      <p className="porra-round-card__number">Jornada {round.round_number}</p>
                      <h2>{round.title}</h2>
                    </div>
                    {prediction?.total_points !== null && prediction?.total_points !== undefined && (
                      <div className="porra-round-score"><strong>{prediction.total_points}</strong><span>pts</span></div>
                    )}
                  </div>
                  <div className="porra-round-meta">
                    <span>⏰ Cierre: {formatPorraDeadline(round.deadline_at)}</span>
                    {round.prize_text && <span>🎁 {round.prize_text}</span>}
                  </div>
                  {editable && prediction && <p className="porra-help">Tu porra está guardada. Puedes modificarla hasta el deadline.</p>}
                  {!editable && round.status !== "scored" && <p className="porra-help">La porra ya está congelada. Las respuestas se publicarán cuando el Admin cierre la jornada.</p>}
                </article>

                <div className="porra-questions">
                  {questions.map((question) => {
                    const correct = resultByQuestion.get(question.id)?.correct_answer;
                    const awarded = scoreByQuestion[question.id];
                    return (
                      <article className="porra-question" key={question.id}>
                        <div className="porra-question__heading">
                          <span>Pregunta {question.position}</span>
                          {awarded !== undefined && <strong>+{awarded} pts</strong>}
                        </div>
                        <h3>{question.prompt}</h3>

                        {question.kind === "choice" ? (
                          <div className="porra-choice-grid">
                            {(question.options || []).map((option) => {
                              const selected = answers[question.id] === option;
                              const isCorrect = round.status === "scored" && correct === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  disabled={!editable}
                                  className={`porra-choice${selected ? " porra-choice--selected" : ""}${isCorrect ? " porra-choice--correct" : ""}`}
                                  onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option }))}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="porra-number-wrap">
                            <label>
                              Diferencia de puntos
                              <input
                                type="number"
                                inputMode="numeric"
                                disabled={!editable}
                                value={answers[question.id] ?? ""}
                                placeholder="Ej. +7 o -4"
                                onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                              />
                            </label>
                            <p>Positivo = gana el equipo indicado en la pregunta · Negativo = pierde.</p>
                          </div>
                        )}

                        {round.status === "scored" && (
                          <div className="porra-answer-result">
                            <span>Tu respuesta: <strong>{answers[question.id] ?? "Sin respuesta"}</strong></span>
                            <span>Correcta: <strong>{correct ?? "—"}</strong></span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                {editable && (
                  <button type="button" className="porra-save" disabled={saving || !allAnswered} onClick={handleSave}>
                    {saving ? "Guardando…" : prediction ? "Actualizar mi porra" : "Guardar mi porra"}
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {tab === "ranking" && (
          <section className="porra-section">
            <div className="porra-section-heading">
              <div><p className="porra-eyebrow">TEMPORADA</p><h2>Clasificación general</h2></div>
              {myStanding && <div className="porra-my-rank"><span>Tu puesto</span><strong>#{myStanding.position}</strong></div>}
            </div>
            {!standings.length ? (
              <div className="porra-empty"><h3>Aún no hay clasificación</h3><p>La tabla aparecerá cuando se puntúe la primera jornada.</p></div>
            ) : (
              <div className="porra-ranking">
                {standings.map((entry) => (
                  <div key={entry.userId} className={`porra-ranking-row${entry.userId === user.id ? " porra-ranking-row--me" : ""}`}>
                    <span className="porra-ranking-row__pos">{medal(entry.position)}</span>
                    <div className="porra-ranking-row__name"><strong>{entry.username}</strong><small>{entry.rounds} jornada{entry.rounds === 1 ? "" : "s"} · {entry.wins} victoria{entry.wins === 1 ? "" : "s"}</small></div>
                    <strong className="porra-ranking-row__points">{entry.points} pts</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className="porra-section">
            <div className="porra-section-heading"><div><p className="porra-eyebrow">TU TEMPORADA</p><h2>Mi historial</h2></div></div>
            {!history.length ? (
              <div className="porra-empty"><h3>Todavía no tienes jornadas puntuadas</h3><p>Cuando se cierre la primera Porra podrás consultar aquí tus puntos.</p></div>
            ) : (
              <div className="porra-history-list">
                {history.map(({ round: item, prediction: itemPrediction }) => (
                  <article key={item.id} className="porra-history-card">
                    <div><span>Jornada {item.round_number}</span><h3>{item.title}</h3><small>{formatPorraDeadline(item.deadline_at)}</small></div>
                    <div className="porra-history-card__score"><strong>{itemPrediction?.total_points ?? 0}</strong><span>pts</span></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="porra-footer-note">
          <span>🍺 La Porra usa puntos propios.</span>
          <span>No afecta a Fantasy ni a Le Gazal.</span>
          {!user && <Link to="/login">Inicia sesión para participar</Link>}
        </footer>
      </div>
    </div>
  );
}
