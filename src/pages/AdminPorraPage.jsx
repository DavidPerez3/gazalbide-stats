import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  PORRA_CURRENT_SEASON,
  fetchPorraQuestions,
  fetchPorraRounds,
  formatPorraDeadline,
  isPorraDeadlinePassed,
} from "../lib/porra.js";
import "../porra.css";

const initialQuestions = () => [
  {
    prompt: "¿Quién gana el partido del femenino?",
    kind: "choice",
    optionsText: "Gazalbide Fem\nRival",
    pointsExact: 3,
    pointsNear1: 0,
    pointsNear3: 0,
  },
  {
    prompt: "¿Quién gana el partido del masculino?",
    kind: "choice",
    optionsText: "Gazalbide\nRival",
    pointsExact: 3,
    pointsNear1: 0,
    pointsNear3: 0,
  },
  {
    prompt: "Diferencia de puntos del masculino (+ gana Gazalbide / - pierde Gazalbide)",
    kind: "number",
    optionsText: "",
    pointsExact: 10,
    pointsNear1: 7,
    pointsNear3: 5,
  },
];

function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminPorraPage() {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [questionsByRound, setQuestionsByRound] = useState({});
  const [resultsDraft, setResultsDraft] = useState({});
  const [roundNumber, setRoundNumber] = useState(1);
  const [title, setTitle] = useState("La Porra del Gazal");
  const [deadline, setDeadline] = useState(localDateTimeValue(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)));
  const [prizeText, setPrizeText] = useState("");
  const [questions, setQuestions] = useState(initialQuestions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const rows = await fetchPorraRounds(PORRA_CURRENT_SEASON);
      setRounds(rows);
      setRoundNumber(Math.max(0, ...rows.map((row) => Number(row.round_number || 0))) + 1);
      const pairs = await Promise.all(rows.map(async (round) => [round.id, await fetchPorraQuestions(round.id)]));
      setQuestionsByRound(Object.fromEntries(pairs));
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cargar la administración de la Porra.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateQuestion(index, patch) {
    setQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch } : question));
  }

  function addQuestion() {
    setQuestions((current) => [...current, {
      prompt: "",
      kind: "choice",
      optionsText: "Opción A\nOpción B",
      pointsExact: 3,
      pointsNear1: 0,
      pointsNear3: 0,
    }]);
  }

  function removeQuestion(index) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }

  const canCreate = useMemo(() => {
    if (!title.trim() || !deadline || questions.length === 0) return false;
    return questions.every((question) => {
      if (!question.prompt.trim()) return false;
      if (question.kind === "choice") {
        return question.optionsText.split("\n").map((value) => value.trim()).filter(Boolean).length >= 2;
      }
      return true;
    });
  }, [title, deadline, questions]);

  async function createDraft() {
    if (!canCreate) return;
    setBusy(true);
    setError("");
    setMessage("");
    let createdRound = null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { data: roundRow, error: roundError } = await supabase
        .from("porra_rounds")
        .insert({
          season: PORRA_CURRENT_SEASON,
          round_number: Number(roundNumber),
          title: title.trim(),
          deadline_at: new Date(deadline).toISOString(),
          prize_text: prizeText.trim() || null,
          status: "draft",
          created_by: authData?.user?.id || null,
        })
        .select("*")
        .single();
      if (roundError) throw roundError;
      createdRound = roundRow;

      const payload = questions.map((question, index) => ({
        round_id: roundRow.id,
        position: index + 1,
        prompt: question.prompt.trim(),
        kind: question.kind,
        options: question.kind === "choice"
          ? question.optionsText.split("\n").map((value) => value.trim()).filter(Boolean)
          : [],
        points_exact: Number(question.pointsExact || 0),
        points_near_1: question.kind === "number" ? Number(question.pointsNear1 || 0) : 0,
        points_near_3: question.kind === "number" ? Number(question.pointsNear3 || 0) : 0,
      }));
      const { error: questionsError } = await supabase.from("porra_questions").insert(payload);
      if (questionsError) throw questionsError;

      setMessage(`Jornada ${roundNumber} creada como borrador.`);
      setQuestions(initialQuestions());
      setPrizeText("");
      await load();
    } catch (err) {
      console.error(err);
      if (createdRound?.id) await supabase.from("porra_rounds").delete().eq("id", createdRound.id);
      setError(err.message || "No se pudo crear la jornada.");
    } finally {
      setBusy(false);
    }
  }

  async function publishRound(round) {
    if (!window.confirm(`¿Publicar la Jornada ${round.round_number}? Desde ese momento los usuarios podrán enviar su porra.`)) return;
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.from("porra_rounds").update({ status: "open" }).eq("id", round.id);
      if (updateError) throw updateError;
      setMessage(`Jornada ${round.round_number} publicada.`);
      await load();
    } catch (err) {
      setError(err.message || "No se pudo publicar la jornada.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft(round) {
    if (!window.confirm(`¿Eliminar el borrador de la Jornada ${round.round_number}?`)) return;
    setBusy(true);
    try {
      const { error: deleteError } = await supabase.from("porra_rounds").delete().eq("id", round.id).eq("status", "draft");
      if (deleteError) throw deleteError;
      setMessage("Borrador eliminado.");
      await load();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el borrador.");
    } finally {
      setBusy(false);
    }
  }

  function setResultValue(questionId, value) {
    setResultsDraft((current) => ({ ...current, [questionId]: value }));
  }

  async function scoreRound(round) {
    const roundQuestions = questionsByRound[round.id] || [];
    const missing = roundQuestions.filter((question) => String(resultsDraft[question.id] ?? "").trim() === "");
    if (missing.length) {
      setError("Introduce la respuesta correcta de todas las preguntas antes de puntuar.");
      return;
    }
    if (!window.confirm(`¿Puntuar y cerrar definitivamente la Jornada ${round.round_number}?`)) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      const resultRows = roundQuestions.map((question) => ({
        question_id: question.id,
        correct_answer: String(resultsDraft[question.id]).trim(),
        set_by: authData?.user?.id || null,
        set_at: new Date().toISOString(),
      }));
      const { error: resultError } = await supabase
        .from("porra_question_results")
        .upsert(resultRows, { onConflict: "question_id" });
      if (resultError) throw resultError;

      const { data, error: scoreError } = await supabase.rpc("score_porra_round", { p_round_id: round.id });
      if (scoreError) throw scoreError;
      setMessage(`Jornada ${round.round_number} puntuada · ${data?.predictions_scored ?? 0} porras procesadas.`);
      await load();
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo puntuar la jornada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="porra-page porra-admin">
      <div className="container">
        <button type="button" className="porra-back" onClick={() => navigate("/admin")}>← Volver a Admin</button>
        <header className="porra-hero porra-hero--admin">
          <div>
            <p className="porra-eyebrow">🎯 ADMIN · PORRA</p>
            <h1>La Porra del Gazal</h1>
            <p>Crea la jornada, publica las preguntas y puntúa automáticamente cuando termine el deadline.</p>
          </div>
        </header>

        {error && <div className="porra-alert porra-alert--error">{error}</div>}
        {message && <div className="porra-alert porra-alert--success">{message}</div>}

        <section className="porra-admin-card">
          <div className="porra-section-heading"><div><p className="porra-eyebrow">NUEVA JORNADA</p><h2>Crear borrador</h2></div></div>
          <div className="porra-admin-grid">
            <label>Nº jornada<input type="number" min="1" value={roundNumber} onChange={(event) => setRoundNumber(event.target.value)} /></label>
            <label>Temporada<input type="text" value={PORRA_CURRENT_SEASON} disabled /></label>
            <label className="porra-admin-grid__wide">Título<input type="text" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Deadline<input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
            <label>Premio opcional<input type="text" placeholder="Ej. Camiseta de calentamiento" value={prizeText} onChange={(event) => setPrizeText(event.target.value)} /></label>
          </div>

          <div className="porra-admin-questions">
            {questions.map((question, index) => (
              <article className="porra-admin-question" key={index}>
                <div className="porra-admin-question__head"><strong>Pregunta {index + 1}</strong>{questions.length > 1 && <button type="button" onClick={() => removeQuestion(index)}>Eliminar</button>}</div>
                <label>Pregunta<input type="text" value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} /></label>
                <label>Tipo
                  <select value={question.kind} onChange={(event) => updateQuestion(index, { kind: event.target.value })}>
                    <option value="choice">Elección</option>
                    <option value="number">Número / diferencia</option>
                  </select>
                </label>
                {question.kind === "choice" && (
                  <label>Opciones · una por línea<textarea rows="3" value={question.optionsText} onChange={(event) => updateQuestion(index, { optionsText: event.target.value })} /></label>
                )}
                <div className="porra-points-grid">
                  <label>Acierto exacto<input type="number" min="0" value={question.pointsExact} onChange={(event) => updateQuestion(index, { pointsExact: event.target.value })} /></label>
                  {question.kind === "number" && <>
                    <label>±1<input type="number" min="0" value={question.pointsNear1} onChange={(event) => updateQuestion(index, { pointsNear1: event.target.value })} /></label>
                    <label>±3<input type="number" min="0" value={question.pointsNear3} onChange={(event) => updateQuestion(index, { pointsNear3: event.target.value })} /></label>
                  </>}
                </div>
              </article>
            ))}
          </div>

          <div className="porra-admin-actions">
            <button type="button" className="porra-secondary" onClick={addQuestion}>+ Añadir pregunta</button>
            <button type="button" className="porra-save" disabled={!canCreate || busy} onClick={createDraft}>{busy ? "Guardando…" : "Crear borrador"}</button>
          </div>
        </section>

        <section className="porra-admin-card">
          <div className="porra-section-heading"><div><p className="porra-eyebrow">JORNADAS</p><h2>Gestión</h2></div></div>
          {!rounds.length ? <div className="porra-empty"><p>No hay jornadas de Porra todavía.</p></div> : (
            <div className="porra-admin-rounds">
              {rounds.map((round) => {
                const qs = questionsByRound[round.id] || [];
                const deadlinePassed = isPorraDeadlinePassed(round);
                return (
                  <article className="porra-admin-round" key={round.id}>
                    <div className="porra-admin-round__head">
                      <div><span>Jornada {round.round_number} · {round.status.toUpperCase()}</span><h3>{round.title}</h3><small>⏰ {formatPorraDeadline(round.deadline_at)} · {qs.length} preguntas</small></div>
                    </div>

                    {round.status === "draft" && (
                      <div className="porra-admin-actions">
                        <button type="button" className="porra-secondary porra-secondary--danger" disabled={busy} onClick={() => deleteDraft(round)}>Eliminar</button>
                        <button type="button" className="porra-save" disabled={busy} onClick={() => publishRound(round)}>Publicar jornada</button>
                      </div>
                    )}

                    {round.status === "open" && !deadlinePassed && <p className="porra-help">Abierta. Los usuarios pueden modificar su porra hasta el deadline.</p>}

                    {round.status === "open" && deadlinePassed && (
                      <div className="porra-results-editor">
                        <p className="porra-help">Deadline superado. Introduce las respuestas correctas para puntuar.</p>
                        {qs.map((question) => (
                          <label key={question.id}>
                            <span>{question.position}. {question.prompt}</span>
                            {question.kind === "choice" ? (
                              <select value={resultsDraft[question.id] ?? ""} onChange={(event) => setResultValue(question.id, event.target.value)}>
                                <option value="">Selecciona…</option>
                                {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            ) : (
                              <input type="number" value={resultsDraft[question.id] ?? ""} placeholder="Ej. +7" onChange={(event) => setResultValue(question.id, event.target.value)} />
                            )}
                          </label>
                        ))}
                        <button type="button" className="porra-save" disabled={busy} onClick={() => scoreRound(round)}>Puntuar y publicar resultados</button>
                      </div>
                    )}

                    {round.status === "scored" && <p className="porra-help porra-help--done">✅ Jornada puntuada y visible en la clasificación.</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
