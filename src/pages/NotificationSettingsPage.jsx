import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import {
  disableBrowserPush,
  enableBrowserPush,
  getBrowserPushSubscription,
  pushSupport,
  showLocalPushTest,
  syncBrowserPushRegistration,
} from "../lib/pushNotifications.js";
import "../notifications.css";

const PREFS = [
  ["new_gameweek", "Nueva jornada", "Cuando se abre una nueva jornada Fantasy."],
  ["deadline_24h", "Deadline · 24 h", "Recordatorio general 24 horas antes del cierre."],
  ["deadline_1h", "Deadline · 1 h", "Solo si tu alineación todavía no es válida."],
  ["player_status", "Lesiones y disponibilidad", "Si un jugador de tu alineación pasa a dudoso o no disponible."],
  ["match_live", "Partido en directo", "Cuando arranca el Live Center y Fantasy Live."],
  ["result_published", "Resultado oficial", "Cuando el partido ya ha sido revisado y publicado."],
  ["prices_updated", "Nuevos precios", "Cuando se aplican los precios Fantasy tras un partido."],
  ["economy_ready", "Ahorro / Le Gazal", "Cuando tus cervezas sobrantes ya están disponibles."],
];

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const support = useMemo(() => pushSupport(), []);
  const [prefs, setPrefs] = useState(null);
  const [permission, setPermission] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [subscribed, setSubscribed] = useState(false);
  const [devices, setDevices] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(null);

  async function refresh() {
    if (!user) return;
    const [prefsResult, devicesResult, historyResult] = await Promise.all([
      supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("active", true),
      supabase
        .from("notification_outbox")
        .select("id,title,body,notification_type,status,sent_at,created_at")
        .eq("user_id", user.id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(8),
    ]);

    if (prefsResult.error) throw prefsResult.error;
    if (devicesResult.error) throw devicesResult.error;
    if (historyResult.error) throw historyResult.error;

    let nextPrefs = prefsResult.data;
    if (!nextPrefs) {
      const { data, error } = await supabase
        .from("notification_preferences")
        .insert({ user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      nextPrefs = data;
    }
    setPrefs(nextPrefs);
    setDevices(devicesResult.count || 0);
    setHistory(historyResult.data || []);

    if (support.supported) {
      const browserSub = await getBrowserPushSubscription();
      setSubscribed(Boolean(browserSub));
      setPermission(Notification.permission);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (support.supported && Notification.permission === "granted") {
          await syncBrowserPushRegistration();
        }
        if (!cancelled) await refresh();
      } catch (error) {
        console.error("Error cargando notificaciones:", error);
        if (!cancelled) setMessage({ type: "error", text: "No se ha podido cargar la configuración de avisos." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [user]);

  async function enableDevice() {
    setWorking(true);
    setMessage(null);
    try {
      await enableBrowserPush();
      setPermission(Notification.permission);
      setSubscribed(true);
      await refresh();
      setMessage({ type: "success", text: "Notificaciones activadas en este dispositivo." });
    } catch (error) {
      console.error(error);
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      setMessage({ type: "error", text: error.message || "No se pudieron activar las notificaciones." });
    } finally {
      setWorking(false);
    }
  }

  async function disableDevice() {
    setWorking(true);
    setMessage(null);
    try {
      await disableBrowserPush();
      setSubscribed(false);
      await refresh();
      setMessage({ type: "success", text: "Este dispositivo ya no recibirá avisos." });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "No se pudo desactivar este dispositivo." });
    } finally {
      setWorking(false);
    }
  }

  async function updatePreference(field, value) {
    if (!prefs) return;
    const previous = prefs;
    const next = { ...prefs, [field]: value, updated_at: new Date().toISOString() };
    setPrefs(next);
    const { error } = await supabase
      .from("notification_preferences")
      .update({ [field]: value, updated_at: next.updated_at })
      .eq("user_id", user.id);
    if (error) {
      console.error(error);
      setPrefs(previous);
      setMessage({ type: "error", text: "No se pudo guardar ese cambio." });
    }
  }

  async function testNotification() {
    setWorking(true);
    setMessage(null);
    try {
      await showLocalPushTest();
      setMessage({ type: "success", text: "Aviso de prueba enviado a este dispositivo." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo mostrar el aviso de prueba." });
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div className="card card--p">Cargando notificaciones…</div>;

  const blocked = permission === "denied";
  const iosNeedsInstall = support.isiOS && !support.standalone && !support.supported;

  return (
    <section className="notifications-page">
      <div className="card card--p notifications-page__hero">
        <div>
          <span className="notifications-page__eyebrow">PWA</span>
          <h1>Notificaciones</h1>
          <p>Elige qué avisos quieres recibir. No enviaremos notificaciones por cada canasta ni por cada cambio del ranking Live.</p>
        </div>
        <div className={`notifications-page__state ${subscribed ? "is-on" : ""}`}>
          <strong>{subscribed ? "ACTIVAS" : "INACTIVAS"}</strong>
          <span>{devices} dispositivo{devices === 1 ? "" : "s"} registrado{devices === 1 ? "" : "s"}</span>
        </div>
      </div>

      {message && <div className={`notifications-page__message is-${message.type}`}>{message.text}</div>}

      <div className="card card--p notifications-page__device">
        <div>
          <h2>Este dispositivo</h2>
          <p>
            {!support.supported
              ? "Este navegador no expone Web Push para esta PWA."
              : blocked
                ? "El navegador ha bloqueado el permiso. Tendrás que habilitarlo desde los ajustes del sitio/dispositivo."
                : subscribed
                  ? "Este dispositivo está suscrito a los avisos de Gazalbide Stats."
                  : "Actívalas para recibir avisos incluso cuando la PWA no esté abierta."}
          </p>
          {iosNeedsInstall && (
            <small>En iPhone/iPad, instala primero Gazalbide Stats en la pantalla de inicio y abre la PWA desde su icono.</small>
          )}
        </div>
        <div className="notifications-page__actions">
          {!subscribed ? (
            <button className="btn btn--primary" type="button" disabled={!support.supported || blocked || working} onClick={enableDevice}>
              {working ? "Activando…" : "Activar avisos"}
            </button>
          ) : (
            <>
              <button className="btn" type="button" disabled={working} onClick={testNotification}>Probar aviso</button>
              <button className="btn btn--danger" type="button" disabled={working} onClick={disableDevice}>Desactivar dispositivo</button>
            </>
          )}
        </div>
      </div>

      {prefs && (
        <div className="card card--p notifications-page__prefs">
          <div className="notifications-page__master">
            <div>
              <h2>Avisos de tu cuenta</h2>
              <p>Este interruptor pausa todos los envíos sin borrar tus dispositivos.</p>
            </div>
            <label className="notification-switch">
              <input type="checkbox" checked={prefs.enabled} onChange={(e) => updatePreference("enabled", e.target.checked)} />
              <span />
            </label>
          </div>

          <div className={!prefs.enabled ? "notifications-page__pref-list is-disabled" : "notifications-page__pref-list"}>
            {PREFS.map(([field, title, description]) => (
              <label className="notifications-page__pref" key={field}>
                <div><strong>{title}</strong><span>{description}</span></div>
                <span className="notification-switch">
                  <input type="checkbox" disabled={!prefs.enabled} checked={Boolean(prefs[field])} onChange={(e) => updatePreference(field, e.target.checked)} />
                  <span />
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card card--p notifications-page__history">
        <h2>Últimos avisos enviados</h2>
        {!history.length ? (
          <p className="text-dim">Todavía no se ha enviado ningún aviso a tu cuenta.</p>
        ) : (
          <div className="notifications-page__history-list">
            {history.map((item) => (
              <div key={item.id}>
                <div><strong>{item.title}</strong><span>{item.body}</span></div>
                <time>{formatDate(item.sent_at || item.created_at)}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
