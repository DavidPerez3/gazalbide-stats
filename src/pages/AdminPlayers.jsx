import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlayerPhoto from "../components/PlayerPhoto.jsx";
import AdminStaffSection from "../components/AdminStaffSection.jsx";
import { getPlayers } from "../lib/data.js";
import { CURRENT_SEASON_ID, LEGACY_SEASON_ID } from "../lib/seasons.js";
import {
  addSeasonPlayer,
  getAdminSeasonRoster,
  getReusablePlayers,
  isStatsSchemaMissing,
  setSeasonPlayerActive,
  updateSeasonPlayer,
} from "../lib/adminPlayersRepository.js";
import {
  addLocalRosterDraftPlayer,
  clearLocalRosterDraft,
  getLocalRosterDraft,
  localDraftPhotoToFile,
  setLocalRosterDraftPlayerActive,
  updateLocalRosterDraftPlayer,
} from "../lib/localRosterDraft.js";
import "../admin-players.css";

function errorText(error) {
  if (error?.code === "23505") {
    return "Ese dorsal ya está asignado a otro jugador en esta temporada.";
  }
  return error?.message || "Se ha producido un error inesperado.";
}

function legacyReusablePlayers(players) {
  return (players || []).map((player) => ({
    ...player,
    id: `legacy:${String(player.number)}:${String(player.name || "")}`,
    source: "legacy-json",
  }));
}

function PhotoInput({ file, onChange, player = null }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewPlayer = previewUrl
    ? { ...(player || {}), photo_url: previewUrl }
    : player || { name: "Jugador" };

  return (
    <div className="admin-players__photo-field">
      <PlayerPhoto player={previewPlayer} size="card" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <label>
          Foto de perfil · opcional
          <input
            type="file"
            accept="image/*"
            onChange={(event) => onChange(event.target.files?.[0] || null)}
          />
        </label>
        <div className="admin-players__hint">
          Puedes usar cámara o galería. La app recorta al centro y guarda siempre una versión 512×512 WebP.
        </div>
      </div>
    </div>
  );
}

export default function AdminPlayers() {
  const navigate = useNavigate();
  const [roster, setRoster] = useState([]);
  const [reusablePlayers, setReusablePlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaPending, setSchemaPending] = useState(false);
  const [localDraftCount, setLocalDraftCount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [mode, setMode] = useState("new");
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [reuseId, setReuseId] = useState("");
  const [photoFile, setPhotoFile] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editJersey, setEditJersey] = useState("");
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const reusablePlayer = useMemo(
    () => reusablePlayers.find((player) => String(player.id) === String(reuseId)) || null,
    [reusablePlayers, reuseId]
  );

  async function loadHistoricalFallback() {
    try {
      return legacyReusablePlayers(await getPlayers(LEGACY_SEASON_ID));
    } catch (err) {
      console.error("Error cargando jugadores históricos desde JSON:", err);
      return [];
    }
  }

  async function load() {
    setLoading(true);
    setError("");

    const fallbackHistorical = await loadHistoricalFallback();
    const localDraft = getLocalRosterDraft();
    setLocalDraftCount(localDraft.length);

    try {
      const seasonRoster = await getAdminSeasonRoster(CURRENT_SEASON_ID);
      let reusable = [];
      try {
        reusable = await getReusablePlayers(CURRENT_SEASON_ID);
      } catch (err) {
        if (!isStatsSchemaMissing(err)) throw err;
      }

      const seen = new Set(seasonRoster.map((player) => String(player.id)));
      const combined = [
        ...seasonRoster,
        ...localDraft.filter((player) => !seen.has(String(player.id))),
      ];
      setRoster(combined);
      setReusablePlayers(reusable.length ? reusable : fallbackHistorical);
      setSchemaPending(false);
    } catch (err) {
      console.error("Error cargando plantilla Admin:", err);
      if (isStatsSchemaMissing(err)) {
        setSchemaPending(true);
        setRoster(localDraft);
        setReusablePlayers(fallbackHistorical);
      } else {
        setError(errorText(err));
        setRoster(localDraft);
        setReusablePlayers(fallbackHistorical);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetCreateForm() {
    setName("");
    setJersey("");
    setReuseId("");
    setPhotoFile(null);
  }

  async function handleAdd(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const chosenName = mode === "reuse" ? reusablePlayer?.name : name;

      if (schemaPending) {
        await addLocalRosterDraftPlayer({
          name: chosenName,
          jerseyNumber: jersey,
          historicalPlayer: mode === "reuse" ? reusablePlayer : null,
          photoFile,
        });
        setMessage(
          `${String(chosenName || "Jugador").trim()} añadido al borrador local ${CURRENT_SEASON_ID}.`
        );
      } else {
        await addSeasonPlayer({
          seasonId: CURRENT_SEASON_ID,
          name: chosenName,
          jerseyNumber: jersey,
          reusePlayerId:
            mode === "reuse" && reusablePlayer?.source !== "legacy-json"
              ? reusablePlayer?.id
              : null,
          photoFile,
        });
        setMessage(`${String(chosenName || "Jugador").trim()} añadido a ${CURRENT_SEASON_ID}.`);
      }

      resetCreateForm();
      await load();
    } catch (err) {
      console.error("Error añadiendo jugador:", err);
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(player) {
    setEditingId(player.id);
    setEditName(player.name);
    setEditJersey(String(player.number));
    setEditPhotoFile(null);
    setRemovePhoto(false);
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPhotoFile(null);
    setRemovePhoto(false);
  }

  async function saveEdit(player) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (player.source === "local-draft") {
        await updateLocalRosterDraftPlayer({
          playerId: player.id,
          name: editName,
          jerseyNumber: editJersey,
          photoFile: editPhotoFile,
          removePhoto,
        });
      } else {
        await updateSeasonPlayer({
          seasonId: CURRENT_SEASON_ID,
          playerId: player.id,
          name: editName,
          jerseyNumber: editJersey,
          photoFile: editPhotoFile,
          removePhoto,
          previousPhotoPath: player.photo_path,
        });
      }
      setMessage(`${editName.trim()} actualizado.`);
      cancelEdit();
      await load();
    } catch (err) {
      console.error("Error actualizando jugador:", err);
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(player) {
    const next = !player.active;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (player.source === "local-draft") {
        setLocalRosterDraftPlayerActive(player.id, next);
      } else {
        await setSeasonPlayerActive(CURRENT_SEASON_ID, player.id, next);
      }
      setMessage(
        next
          ? `${player.name} vuelve a estar en la plantilla actual.`
          : `${player.name} retirado de la plantilla actual. Su histórico se conserva.`
      );
      await load();
    } catch (err) {
      console.error("Error cambiando estado de plantilla:", err);
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function syncLocalDraft() {
    if (schemaPending || !localDraftCount) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const draft = getLocalRosterDraft();
      const reusable = await getReusablePlayers(CURRENT_SEASON_ID);

      for (const player of draft) {
        const historicalMatch = reusable.find((candidate) => {
          const sameName = String(candidate.name || "").trim().toLowerCase() ===
            String(player.historical_name || player.name || "").trim().toLowerCase();
          const sameNumber = player.historical_number == null ||
            String(candidate.number) === String(player.historical_number);
          return sameName && sameNumber;
        });

        const photoFileToUpload = await localDraftPhotoToFile(player.photo_path);
        await addSeasonPlayer({
          seasonId: CURRENT_SEASON_ID,
          name: player.name,
          jerseyNumber: player.number,
          reusePlayerId: historicalMatch?.id || null,
          photoFile: photoFileToUpload,
        });
        if (player.active === false) {
          const latest = await getAdminSeasonRoster(CURRENT_SEASON_ID);
          const inserted = latest.find(
            (row) => row.name === player.name && String(row.number) === String(player.number)
          );
          if (inserted) await setSeasonPlayerActive(CURRENT_SEASON_ID, inserted.id, false);
        }
      }

      clearLocalRosterDraft();
      setMessage("Borrador local sincronizado con Supabase correctamente.");
      await load();
    } catch (err) {
      console.error("Error sincronizando borrador local:", err);
      setError(`No se ha podido sincronizar el borrador: ${errorText(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const activeCount = roster.filter((player) => player.active).length;
  const canSubmit =
    !saving &&
    String(jersey).trim() &&
    (mode === "new" ? String(name).trim() : Boolean(reuseId));

  return (
    <div className="admin-players">
      <header className="admin-players__header">
        <div>
          <p className="admin-players__eyebrow">Admin · Plantilla</p>
          <h1>Jugadores {CURRENT_SEASON_ID}</h1>
          <p className="text-dim">
            La plantilla de la temporada actual es independiente del histórico 2025-2026.
          </p>
        </div>
        <button type="button" className="admin-players__back" onClick={() => navigate("/admin")}>
          ← Volver a Admin
        </button>
      </header>

      {schemaPending && (
        <div className="admin-players__notice">
          <strong>Supabase pendiente · trabajando en modo local.</strong>
          <div className="admin-players__hint" style={{ marginTop: 5 }}>
            Puedes crear ya la plantilla 2026-2027. Se guardará en este dispositivo y Live Stats podrá utilizarla. Cuando ejecutemos las migraciones, la sincronizaremos con Supabase.
          </div>
        </div>
      )}

      {!schemaPending && localDraftCount > 0 && (
        <div className="admin-players__notice">
          <strong>{localDraftCount} jugador{localDraftCount === 1 ? "" : "es"} pendiente{localDraftCount === 1 ? "" : "s"} de sincronizar.</strong>
          <div className="admin-players__actions" style={{ marginTop: 10 }}>
            <button type="button" className="admin-players__primary" onClick={syncLocalDraft} disabled={saving}>
              {saving ? "Sincronizando…" : "Sincronizar con Supabase"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="admin-players__notice admin-players__notice--error">{error}</div>}
      {message && <div className="admin-players__notice">{message}</div>}

      <section className="card admin-players__form-card">
        <h2 className="admin-players__section-title">Añadir a la plantilla actual</h2>

        <div className="admin-players__mode" role="tablist" aria-label="Tipo de alta">
          <button
            type="button"
            className={mode === "new" ? "is-active" : ""}
            onClick={() => {
              setMode("new");
              setReuseId("");
            }}
          >
            Jugador nuevo
          </button>
          <button
            type="button"
            className={mode === "reuse" ? "is-active" : ""}
            onClick={() => {
              setMode("reuse");
              setName("");
            }}
          >
            Continúa de 25/26
          </button>
        </div>

        <form onSubmit={handleAdd}>
          <div className="admin-players__fields">
            {mode === "new" ? (
              <label>
                Nombre
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nombre del jugador"
                  required
                />
              </label>
            ) : (
              <label>
                Jugador histórico
                <select
                  className="input"
                  value={reuseId}
                  onChange={(event) => {
                    const selectedId = event.target.value;
                    setReuseId(selectedId);
                    const selected = reusablePlayers.find(
                      (player) => String(player.id) === String(selectedId)
                    );
                    if (selected?.number) setJersey(String(selected.number));
                  }}
                  required
                >
                  <option value="">— Selecciona —</option>
                  {reusablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}{player.number ? ` · dorsal anterior #${player.number}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Dorsal {CURRENT_SEASON_ID}
              <input
                className="input"
                value={jersey}
                onChange={(event) => setJersey(event.target.value)}
                placeholder="00, 4, 13…"
                inputMode="numeric"
                required
              />
            </label>

            <PhotoInput
              file={photoFile}
              onChange={setPhotoFile}
              player={mode === "reuse" ? reusablePlayer : { name: name || "Jugador" }}
            />
          </div>

          <div className="admin-players__actions">
            <button type="submit" className="admin-players__primary" disabled={!canSubmit}>
              {saving ? "Guardando…" : schemaPending ? "Añadir al borrador local" : "Añadir jugador"}
            </button>
          </div>
        </form>
      </section>

      <section className="card admin-players__roster-card">
        <h2 className="admin-players__section-title">
          Plantilla {CURRENT_SEASON_ID} · {activeCount} activos
        </h2>

        {loading ? (
          <div className="text-dim">Cargando plantilla…</div>
        ) : roster.length === 0 ? (
          <div className="text-dim">Todavía no hay jugadores en la plantilla actual.</div>
        ) : (
          <div className="admin-players__roster">
            {roster.map((player) => {
              const editing = editingId === player.id;
              return (
                <article
                  key={player.id}
                  className={`admin-player-row${player.active ? "" : " admin-player-row--inactive"}`}
                >
                  <PlayerPhoto player={player} size="card" />
                  <div>
                    <div className="admin-player-row__name">
                      #{player.number} · {player.name}
                    </div>
                    <div className="admin-player-row__meta">
                      {player.active ? "En plantilla" : "Fuera de la plantilla actual"}
                      {player.photo_path ? " · foto configurada" : " · sin foto"}
                      {player.source === "local-draft" ? " · pendiente de sincronizar" : ""}
                    </div>
                  </div>

                  <div className="admin-player-row__buttons">
                    <button
                      type="button"
                      className="admin-players__secondary"
                      onClick={() => (editing ? cancelEdit() : beginEdit(player))}
                      disabled={saving}
                    >
                      {editing ? "Cancelar" : "Editar"}
                    </button>
                    <button
                      type="button"
                      className={player.active ? "admin-players__danger" : "admin-players__secondary"}
                      onClick={() => toggleActive(player)}
                      disabled={saving}
                    >
                      {player.active ? "Retirar" : "Reactivar"}
                    </button>
                  </div>

                  {editing && (
                    <div className="admin-player-edit">
                      <label>
                        Nombre
                        <input
                          className="input"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      </label>
                      <label>
                        Dorsal
                        <input
                          className="input"
                          value={editJersey}
                          onChange={(event) => setEditJersey(event.target.value)}
                          inputMode="numeric"
                        />
                      </label>

                      <div className="admin-player-edit__photo">
                        <PhotoInput
                          file={editPhotoFile}
                          onChange={(file) => {
                            setEditPhotoFile(file);
                            if (file) setRemovePhoto(false);
                          }}
                          player={player}
                        />
                        {player.photo_path && (
                          <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <input
                              type="checkbox"
                              checked={removePhoto}
                              onChange={(event) => {
                                setRemovePhoto(event.target.checked);
                                if (event.target.checked) setEditPhotoFile(null);
                              }}
                            />
                            Quitar foto actual
                          </label>
                        )}
                      </div>

                      <div className="admin-players__actions" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
                        <button
                          type="button"
                          className="admin-players__primary"
                          onClick={() => saveEdit(player)}
                          disabled={saving}
                        >
                          {saving ? "Guardando…" : "Guardar cambios"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AdminStaffSection />
    </div>
  );
}
