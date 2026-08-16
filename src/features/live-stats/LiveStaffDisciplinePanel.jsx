import { useEffect, useMemo, useState } from "react";
import { CURRENT_SEASON_ID } from "../../lib/seasons.js";
import { supabase } from "../../lib/supabaseClient.js";
import { LIVE_EVENT } from "./domain.js";
import {
  FOUL_KIND,
  RULE_PROFILE,
  getRuleProfileForDate,
} from "./rules.js";
import {
  loadLiveEvents,
  loadLiveRuntime,
  loadLiveSetup,
  saveLiveEvents,
  saveLiveRuntime,
} from "./localSession.js";
import { createInitialGameState, deriveGameState } from "./stateEngine.js";
import "./liveStaffDiscipline.css";

function getStaffActions(matchDate) {
  const profile = getRuleProfileForDate(matchDate);
  const technicalKind = profile === RULE_PROFILE.FIBA_2026
    ? FOUL_KIND.TECHNICAL_CAT_1
    : FOUL_KIND.TECHNICAL;

  return [
    { kind: technicalKind, label: "Técnica" },
    { kind: FOUL_KIND.DISQUALIFYING, label: "Descalificante" },
  ];
}

function staffLabel(staff) {
  if (!staff) return "Staff";
  return staff.role ? `${staff.name} · ${staff.role}` : staff.name;
}

function deriveCurrentState(setup, events) {
  if (!setup) return null;
  try {
    const initial = createInitialGameState({
      roster: setup.roster,
      starterIds: setup.starterIds,
      matchDate: setup.matchDate,
    });
    return deriveGameState(initial, events);
  } catch (error) {
    console.error("No se pudo derivar el estado para disciplina de staff:", error);
    return null;
  }
}

export default function LiveStaffDisciplinePanel() {
  const setup = useMemo(() => loadLiveSetup(), []);
  const staffActions = useMemo(() => getStaffActions(setup?.matchDate), [setup?.matchDate]);
  const [staff, setStaff] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const events = useMemo(() => loadLiveEvents(), [open]);
  const lastStaffEvent = useMemo(
    () => [...events].reverse().find((event) => !event.is_void && event.staff_id),
    [events]
  );
  const selectedStaff = staff.find((member) => member.id === selectedStaffId) || null;
  const lastStaff = staff.find((member) => member.id === lastStaffEvent?.staff_id) || null;

  useEffect(() => {
    let cancelled = false;

    async function loadStaff() {
      try {
        const { data: seasonRows, error: seasonError } = await supabase
          .from("season_staff")
          .select("staff_id, role, sort_order")
          .eq("season_id", CURRENT_SEASON_ID)
          .eq("active", true)
          .order("sort_order", { ascending: true });
        if (seasonError) throw seasonError;

        const ids = (seasonRows || []).map((row) => row.staff_id);
        if (ids.length === 0) {
          if (!cancelled) setStaff([]);
          return;
        }

        const { data: members, error: memberError } = await supabase
          .from("staff_members")
          .select("id, code, name")
          .in("id", ids);
        if (memberError) throw memberError;

        const byId = new Map((members || []).map((member) => [member.id, member]));
        const ordered = (seasonRows || [])
          .map((row) => ({ ...byId.get(row.staff_id), role: row.role }))
          .filter((member) => member.id);

        if (!cancelled) {
          setStaff(ordered);
          setSelectedStaffId((current) => current || ordered[0]?.id || null);
        }
      } catch (loadError) {
        console.error("Error cargando staff para Live Stats:", loadError);
        if (!cancelled) setError("No se ha podido cargar el staff.");
      }
    }

    loadStaff();
    return () => {
      cancelled = true;
    };
  }, []);

  function addStaffFoul(kind) {
    if (!setup || !selectedStaff || busy) return;
    setBusy(true);
    setError(null);

    try {
      const currentEvents = loadLiveEvents();
      const gameState = deriveCurrentState(setup, currentEvents);
      if (!gameState) throw new Error("No se puede reconstruir el partido actual.");

      const runtime = loadLiveRuntime();
      const clockMs = Number.isFinite(runtime?.clockMs)
        ? runtime.clockMs
        : gameState.clockMs;
      const createdAt = new Date().toISOString();

      const event = {
        id: crypto.randomUUID(),
        client_sequence: currentEvents.length + 1,
        client_created_at: createdAt,
        period: gameState.period,
        clock_ms: clockMs,
        subject: "gazalbide",
        event_type: LIVE_EVENT.PF,
        player_id: null,
        related_player_id: null,
        staff_id: selectedStaff.id,
        foul_kind: kind,
        metadata: {
          staffId: selectedStaff.id,
          staffCode: selectedStaff.code,
          staffName: selectedStaff.name,
          staffRole: selectedStaff.role,
          foulKind: kind,
        },
        is_void: false,
      };

      // Validate through the same state engine before persisting locally. Staff
      // fouls intentionally mutate no player statistics and do not add a team foul.
      deriveGameState(
        createInitialGameState({
          roster: setup.roster,
          starterIds: setup.starterIds,
          matchDate: setup.matchDate,
        }),
        [...currentEvents, event]
      );

      saveLiveEvents([...currentEvents, event]);
      saveLiveRuntime({
        ...(runtime || {}),
        clockMs,
        clockRunning: false,
        updatedAt: createdAt,
      });

      // LiveStatsPage owns its React event state. Reloading is safe because the
      // scorer restores setup/events/runtime from the local-first session.
      window.location.reload();
    } catch (saveError) {
      console.error("Error registrando disciplina de staff:", saveError);
      setError(saveError.message || "No se ha podido registrar la falta de staff.");
      setBusy(false);
    }
  }

  if (!setup) return null;

  return (
    <aside className="live-staff-discipline" aria-label="Disciplina del staff">
      <button
        type="button"
        className="live-staff-discipline__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        STAFF
      </button>

      {open ? (
        <div className="live-staff-discipline__panel">
          <div className="live-staff-discipline__header">
            <strong>Disciplina staff</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
          </div>

          {staff.length > 0 ? (
            <>
              <label className="live-staff-discipline__field">
                Miembro
                <select
                  value={selectedStaffId || ""}
                  onChange={(event) => setSelectedStaffId(event.target.value)}
                  disabled={busy}
                >
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {staffLabel(member)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="live-staff-discipline__actions">
                {staffActions.map((action) => (
                  <button
                    key={action.kind}
                    type="button"
                    onClick={() => addStaffFoul(action.kind)}
                    disabled={busy || !selectedStaffId}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>No hay staff activo en {CURRENT_SEASON_ID}.</p>
          )}

          {lastStaffEvent ? (
            <p className="live-staff-discipline__last">
              Última: <strong>{lastStaff?.name || lastStaffEvent.metadata?.staffName || "Staff"}</strong>
              {" · "}
              {lastStaffEvent.foul_kind === FOUL_KIND.DISQUALIFYING ? "Descalificante" : "Técnica"}
            </p>
          ) : null}

          {error ? <p className="live-staff-discipline__error">{error}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
