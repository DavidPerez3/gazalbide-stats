import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLiveSetup, retryPendingLiveSync } from "./localSession.js";
import {
  getLiveSyncStatus,
  subscribeLiveSyncStatus,
} from "./supabaseSync.js";
import {
  claimLiveControl,
  clearLocalLiveControl,
  heartbeatLiveControl,
} from "./liveControlClient.js";
import "./liveReliability.css";

const SYNC_PENDING_KEY = "gazalbide.live.sync-pending.v1";
const SETUP_KEY = "gazalbide.live.setup.v1";

function browserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function hasPendingLocalSync() {
  try {
    return localStorage.getItem(SYNC_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function localSessionExists(matchId) {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return false;
    const setup = JSON.parse(raw);
    return setup?.matchId === matchId;
  } catch {
    return false;
  }
}

function relativeTime(iso, now) {
  if (!iso) return "todavía no sincronizado";
  const ms = Math.max(0, now - new Date(iso).getTime());
  if (ms < 5000) return "ahora";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `hace ${seconds}s`;
  return `hace ${Math.floor(seconds / 60)} min`;
}

function syncCopy(status, pending, online) {
  if (!online || status.phase === "offline") {
    return { tone: "offline", icon: "●", title: "Sin conexión", detail: "Guardado local · se reenviará al volver Internet" };
  }
  if (status.phase === "saving") {
    return { tone: "saving", icon: "●", title: "Guardando", detail: "Sincronizando con Supabase…" };
  }
  if (pending || status.phase === "pending") {
    return { tone: "pending", icon: "●", title: "Pendiente", detail: "Hay cambios locales por sincronizar" };
  }
  return { tone: "synced", icon: "●", title: "Sincronizado", detail: "Supabase al día" };
}

export default function LiveReliabilityGuard({ children }) {
  const setup = useMemo(() => loadLiveSetup(), []);
  const [online, setOnline] = useState(browserOnline);
  const [syncStatus, setSyncStatus] = useState(() => getLiveSyncStatus());
  const [pending, setPending] = useState(() => hasPendingLocalSync());
  const [control, setControl] = useState(() =>
    browserOnline()
      ? { state: "loading", holder: null, error: null }
      : { state: "owned-offline", holder: null, error: null }
  );
  const [takingControl, setTakingControl] = useState(false);
  const [now, setNow] = useState(Date.now());
  const wakeLockRef = useRef(null);
  const hadControlRef = useRef(!browserOnline());

  const hasControl = control.state === "owned" || control.state === "owned-offline";
  const hasRemoteControl = control.state === "owned";

  const claim = useCallback(async (force = false) => {
    if (!setup?.matchId || !localSessionExists(setup.matchId)) return;
    if (!browserOnline()) {
      setControl({ state: "owned-offline", holder: null, error: null });
      hadControlRef.current = true;
      return;
    }

    setTakingControl(true);
    setControl((current) => ({ ...current, state: force ? "taking" : "loading", error: null }));
    try {
      const result = await claimLiveControl(setup, { force });
      if (result?.granted) {
        setControl({ state: "owned", holder: result, error: null });
        hadControlRef.current = true;
        // A failed pre-lease/temporary offline sync can now be resent with the
        // fresh server control token stored in the local setup.
        void retryPendingLiveSync();
      } else {
        setControl({ state: "locked", holder: result || null, error: null });
      }
    } catch (error) {
      if (!browserOnline()) {
        setControl({ state: "owned-offline", holder: null, error: null });
        hadControlRef.current = true;
      } else {
        setControl({
          state: "error",
          holder: null,
          error: error?.message || "No se pudo obtener el control del Live.",
        });
      }
    } finally {
      setTakingControl(false);
    }
  }, [setup]);

  useEffect(() => {
    if (!setup?.matchId) return undefined;
    void claim(false);
  }, [claim, setup?.matchId]);

  useEffect(() => subscribeLiveSyncStatus(setSyncStatus), []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPending(hasPendingLocalSync());
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      if (localSessionExists(setup?.matchId)) void claim(false);
    };
    const handleOffline = () => {
      setOnline(false);
      if (localSessionExists(setup?.matchId) && hasControl) {
        setControl((current) => ({ ...current, state: "owned-offline", error: null }));
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [claim, hasControl, setup?.matchId]);

  useEffect(() => {
    if (!setup?.matchId || !hasRemoteControl) return undefined;

    let cancelled = false;
    const beat = async () => {
      if (!localSessionExists(setup.matchId)) return;
      try {
        const result = await heartbeatLiveControl(setup);
        if (cancelled) return;
        if (!result?.granted) {
          clearLocalLiveControl(setup.matchId);
          setControl({ state: "locked", holder: result || null, error: null });
          if (hadControlRef.current && localSessionExists(setup.matchId)) window.location.reload();
        } else {
          setControl((current) => ({ ...current, state: "owned", holder: { ...current.holder, ...result } }));
        }
      } catch (error) {
        if (cancelled) return;
        if (!browserOnline()) {
          setOnline(false);
          setControl((current) => ({ ...current, state: "owned-offline", error: null }));
        } else {
          setControl((current) => ({ ...current, error: error?.message || "No se pudo renovar el control." }));
        }
      }
    };

    const id = window.setInterval(beat, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [hasRemoteControl, setup]);

  useEffect(() => {
    if (!hasControl || !navigator.wakeLock?.request) return undefined;
    let cancelled = false;

    const requestWakeLock = async () => {
      if (cancelled || document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener?.("release", () => {
          wakeLockRef.current = null;
        });
      } catch {
        wakeLockRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (wakeLockRef.current) void wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [hasControl]);

  useEffect(() => {
    if (!setup?.matchId) return undefined;
    const warnOnLeave = (event) => {
      if (!localSessionExists(setup.matchId)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnOnLeave);
    return () => window.removeEventListener("beforeunload", warnOnLeave);
  }, [setup?.matchId]);

  if (!setup) return children;

  const sync = syncCopy(syncStatus, pending, online);
  const otherLabel = control.holder?.device_label || "otro dispositivo";

  return (
    <div className="live-reliability-shell">
      <div className="live-reliability-bar" role="status" aria-live="polite">
        <div className={`live-sync-state live-sync-state--${sync.tone}`}>
          <span className="live-sync-state__dot" aria-hidden="true">{sync.icon}</span>
          <div>
            <strong>{sync.title}</strong>
            <span>{sync.detail} · {relativeTime(syncStatus.lastSyncedAt, now)}</span>
          </div>
        </div>

        <div className={`live-control-state live-control-state--${hasControl ? "owned" : "locked"}`}>
          {control.state === "owned-offline" ? (
            <>
              <strong>Control local: ESTE DISPOSITIVO</strong>
              <span>Modo offline · las acciones quedan pendientes hasta recuperar Internet</span>
            </>
          ) : hasRemoteControl ? (
            <>
              <strong>Control del anotador: ESTE DISPOSITIVO</strong>
              <span>Pantalla activa · Wake Lock {navigator.wakeLock?.request ? "disponible" : "no compatible"}</span>
            </>
          ) : control.state === "loading" || control.state === "taking" ? (
            <>
              <strong>Comprobando control…</strong>
              <span>No se habilitarán acciones hasta confirmar el lease.</span>
            </>
          ) : (
            <>
              <div>
                <strong>Modo solo lectura</strong>
                <span>
                  {control.state === "locked"
                    ? `El Live está controlado por ${otherLabel}.`
                    : control.error || "No tienes el control de escritura."}
                </span>
              </div>
              {online ? (
                <button
                  type="button"
                  className="live-control-takeover"
                  disabled={takingControl}
                  onClick={() => claim(true)}
                >
                  {takingControl ? "Tomando control…" : "Tomar control"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="live-reliability-content" inert={hasControl ? undefined : ""}>
        {children}
      </div>
    </div>
  );
}
