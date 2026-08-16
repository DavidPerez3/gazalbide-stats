import { supabase } from "./supabaseClient.js";

export function pushSupport() {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  return { supported, isiOS, standalone };
}

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function serviceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker no disponible en este navegador.");
  }
  return navigator.serviceWorker.ready;
}

export async function getBrowserPushSubscription() {
  const registration = await serviceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

export async function registerSubscriptionInSupabase(subscription) {
  if (!subscription) return null;
  const json = subscription.toJSON();
  const { data, error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh || "",
    p_auth_secret: json.keys?.auth || "",
    p_expiration_time: subscription.expirationTime == null
      ? null
      : Math.round(subscription.expirationTime),
    p_user_agent: navigator.userAgent || null,
  });
  if (error) throw error;
  return data;
}

export async function enableBrowserPush() {
  const support = pushSupport();
  if (!support.supported) {
    throw new Error("Este navegador no admite notificaciones push para la PWA.");
  }

  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Las notificaciones están bloqueadas para Gazalbide Stats."
        : "No se ha concedido permiso para las notificaciones."
    );
  }

  const [{ data: config, error: configError }, registration] = await Promise.all([
    supabase.rpc("get_push_public_config"),
    serviceWorkerRegistration(),
  ]);
  if (configError) throw configError;
  if (!config?.vapidPublicKey) throw new Error("Falta la configuración Web Push.");

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
    });
  }

  await registerSubscriptionInSupabase(subscription);
  return subscription;
}

export async function syncBrowserPushRegistration() {
  if (!pushSupport().supported || Notification.permission !== "granted") return null;
  const subscription = await getBrowserPushSubscription();
  if (!subscription) return null;
  await registerSubscriptionInSupabase(subscription);
  return subscription;
}

export async function disableBrowserPush() {
  if (!pushSupport().supported) return;
  const subscription = await getBrowserPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  try {
    const { error } = await supabase.rpc("unregister_push_subscription", {
      p_endpoint: endpoint,
    });
    if (error) throw error;
  } finally {
    await subscription.unsubscribe();
  }
}

export async function showLocalPushTest() {
  if (Notification.permission !== "granted") {
    throw new Error("Activa primero las notificaciones en este dispositivo.");
  }
  const registration = await serviceWorkerRegistration();
  await registration.showNotification("Gazalbide Stats · prueba", {
    body: "Las notificaciones están listas en este dispositivo. 🏀",
    icon: `${import.meta.env.BASE_URL}logo.png`,
    tag: "gazalbide-push-test",
    data: { route: "/notificaciones" },
  });
}
