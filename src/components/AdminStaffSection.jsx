import { useEffect, useMemo, useState } from "react";
import {
  addSeasonStaff,
  getAdminSeasonStaff,
  getReusableStaff,
  updateSeasonStaff,
} from "../lib/adminStaffRepository.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";
import { resolveStaffPhotoSrc } from "../lib/staffPhotos.js";

function errorText(error) {
  if (error?.code === "23505") return "Ese miembro del staff ya está en la temporada actual.";
  return error?.message || "Se ha producido un error inesperado.";
}

function StaffAvatar({ staff, previewUrl = null }) {
  const src = previewUrl || resolveStaffPhotoSrc(staff);
  const name = staff?.name || "Staff";
  return (
    <div
      aria-label={name}
      style={{
        width: 76,
        height: 76,
        borderRadius: "50%",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)",
        flexShrink: 0,
        fontSize: "1.5rem",
        fontWeight: 800,
      }}
    >
      {src ? (
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function StaffPhotoInput({ file, onChange, staff }) {
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

  return (
    <div className="admin-players__photo-field">
      <StaffAvatar staff={staff} previewUrl={previewUrl} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <label>
          Foto · opcional
          <input
            type="file"
            accept="image/*"
            onChange={(event) => onChange(event.target.files?.[0] || null)}
          />
        </label>
        <div className="admin-players__hint">
          Cámara o galería. Se recorta al centro y se guarda como WebP 512×512.
        </div>
      </div>
    </div>
  );
}

export default function AdminStaffSection() {
  const [staff, setStaff] = useState([]);
  const [reusable, setReusable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [mode, setMode] = useState("new");
  const [name, setName] = useState("");
  const [reuseId, setReuseId] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [fantasyEnabled, setFantasyEnabled] = useState(true);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [editFantasyEnabled, setEditFantasyEnabled] = useState(true);

  const reusableStaff = useMemo(
    () => reusable.find((member) => String(member.id) === String(reuseId)) || null,
    [reusable, reuseId]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [current, reusableRows] = await Promise.all([
        getAdminSeasonStaff(CURRENT_SEASON_ID),
        getReusableStaff(CURRENT_SEASON_ID),
      ]);
      setStaff(current);
      setReusable(reusableRows);
    } catch (err) {
      console.error("Error cargando staff:", err);
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setName("");
    setReuseId("");
    setPhotoFile(null);
    setFantasyEnabled(true);
  }

  async function handleAdd(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const chosenName = mode === "reuse" ? reusableStaff?.name : name;
      await addSeasonStaff({
        seasonId: CURRENT_SEASON_ID,
        name: chosenName,
        reuseStaffId: mode === "reuse" ? reusableStaff?.id : null,
        photoFile,
        fantasyEnabled,
      });
      setMessage(`${String(chosenName || "Entrenador").trim()} añadido al staff ${CURRENT_SEASON_ID}.`);
      resetForm();
      await load();
    } catch (err) {
      console.error("Error añadiendo staff:", err);
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(member) {
    setEditingId(member.id);
    setEditName(member.name);
    setEditPhotoFile(null);
    setRemovePhoto(false);
    setEditActive(member.active !== false);
    setEditFantasyEnabled(member.fantasy_enabled !== false);
    setMessage("");
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPhotoFile(null);
    setRemovePhoto(false);
  }

  async function saveEdit(member) {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await updateSeasonStaff({
        seasonId: CURRENT_SEASON_ID,
        staffId: member.id,
        name: editName,
        active: editActive,
        fantasyEnabled: editFantasyEnabled,
        photoFile: editPhotoFile,
        removePhoto,
        previousPhotoPath: member.photo_path,
      });
      setMessage(`${editName.trim()} actualizado.`);
      cancelEdit();
      await load();
    } catch (err) {
      console.error("Error actualizando staff:", err);
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    !saving &&
    (mode === "new" ? Boolean(name.trim()) : Boolean(reuseId));

  return (
    <section className="card admin-players__form-card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 className="admin-players__section-title">Staff {CURRENT_SEASON_ID}</h2>
          <p className="text-dim" style={{ marginTop: 4 }}>
            Entrenadores por temporada, foto y disponibilidad en Fantasy. El histórico anterior no se modifica.
          </p>
        </div>
        <span className="admin-players__hint">
          {staff.filter((member) => member.active).length} activo{staff.filter((member) => member.active).length === 1 ? "" : "s"}
        </span>
      </div>

      {error && <div className="admin-players__notice admin-players__notice--error">{error}</div>}
      {message && <div className="admin-players__notice">{message}</div>}

      <div className="admin-players__mode" role="tablist" aria-label="Tipo de alta de staff">
        <button
          type="button"
          className={mode === "new" ? "is-active" : ""}
          onClick={() => {
            setMode("new");
            setReuseId("");
          }}
        >
          Entrenador nuevo
        </button>
        <button
          type="button"
          className={mode === "reuse" ? "is-active" : ""}
          onClick={() => {
            setMode("reuse");
            setName("");
          }}
        >
          Reutilizar histórico
        </button>
      </div>

      <form onSubmit={handleAdd}>
        <div className="admin-players__fields">
          {mode === "new" ? (
            <label>
              Nombre
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del entrenador" required />
            </label>
          ) : (
            <label>
              Staff histórico
              <select className="input" value={reuseId} onChange={(event) => setReuseId(event.target.value)} required>
                <option value="">— Selecciona —</option>
                {reusable.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "end", minHeight: 44 }}>
            <input type="checkbox" checked={fantasyEnabled} onChange={(event) => setFantasyEnabled(event.target.checked)} />
            Disponible en Fantasy
          </label>

          <StaffPhotoInput
            file={photoFile}
            onChange={setPhotoFile}
            staff={mode === "reuse" ? reusableStaff : { name: name || "Staff" }}
          />
        </div>

        <div className="admin-players__actions">
          <button type="submit" className="admin-players__primary" disabled={!canSubmit}>
            {saving ? "Guardando…" : "Añadir al staff"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: "1.15rem" }}>
        <h3 style={{ marginBottom: "0.65rem" }}>Staff actual</h3>
        {loading ? (
          <p className="text-dim">Cargando staff…</p>
        ) : staff.length === 0 ? (
          <p className="text-dim">No hay staff configurado para esta temporada.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.7rem" }}>
            {staff.map((member) => {
              const editing = editingId === member.id;
              return (
                <article key={member.id} className="admin-players__player-card" style={{ padding: "0.8rem" }}>
                  {!editing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
                      <StaffAvatar staff={member} />
                      <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                        <strong style={{ fontSize: "1.05rem" }}>{member.name}</strong>
                        <div className="admin-players__hint" style={{ marginTop: 3 }}>
                          {member.active ? "Activo" : "Inactivo"} · {member.fantasy_enabled ? "Fantasy" : "Fuera de Fantasy"}
                        </div>
                      </div>
                      <button type="button" className="admin-players__secondary" onClick={() => beginEdit(member)} disabled={saving}>
                        Editar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                      <label>
                        Nombre
                        <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} />
                      </label>

                      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} />
                          Activo esta temporada
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <input type="checkbox" checked={editFantasyEnabled} onChange={(event) => setEditFantasyEnabled(event.target.checked)} />
                          Disponible en Fantasy
                        </label>
                      </div>

                      <StaffPhotoInput
                        file={editPhotoFile}
                        onChange={(file) => {
                          setEditPhotoFile(file);
                          if (file) setRemovePhoto(false);
                        }}
                        staff={member}
                      />

                      {member.photo_path && (
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

                      <div className="admin-players__actions" style={{ marginTop: 0 }}>
                        <button type="button" className="admin-players__primary" onClick={() => saveEdit(member)} disabled={saving || !editName.trim()}>
                          {saving ? "Guardando…" : "Guardar cambios"}
                        </button>
                        <button type="button" className="admin-players__secondary" onClick={cancelEdit} disabled={saving}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
