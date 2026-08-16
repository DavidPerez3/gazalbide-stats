import { supabase } from "../../lib/supabaseClient.js";
import { ensureRemoteLiveSession } from "./supabaseSync.js";

const SETUP_KEY = "gazalbide.live.setup.v1";
const DEVICE_KEY = "gazalbide.live.physical-device.v1";

function readSetup() {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSetup(setup) {
  if (!setup) return;
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
}

export function getLivePhysicalDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

export function getLiveDeviceLabel() {
  if (typeof navigator === "undefined") return "Dispositivo";
  const platform = navigator.userAgentData?.platform || navigator.platform || "Dispositivo";
  const ua = navigator.userAgent || "";
  let browser = "Navegador";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  return `${platform} · ${browser}`;
}

export function setLocalLiveControl(matchId, control) {
  const setup = readSetup();
  if (!setup || setup.matchId !== matchId) return null;
  const next = {
    ...setup,
    controlToken: control?.control_token || null,
    controlDeviceId: control?.device_id || getLivePhysicalDeviceId(),
    controlLeaseExpiresAt: control?.lease_expires_at || null,
  };
  writeSetup(next);
  return next;
}

export function clearLocalLiveControl(matchId) {
  const setup = readSetup();
  if (!setup || setup.matchId !== matchId) return;
  const next = { ...setup };
  delete next.controlToken;
  delete next.controlDeviceId;
  delete next.controlLeaseExpiresAt;
  writeSetup(next);
}

export async function getLiveControlStatus(matchId) {
  if (!matchId) return { active: false };
  const { data, error } = await supabase.rpc("get_live_match_control", {
    p_match_id: matchId,
  });
  if (error) throw error;
  return data || { active: false };
}

async function requestClaim(setup, deviceId, force) {
  const { data, error } = await supabase.rpc("claim_live_match_control", {
    p_match_id: setup.matchId,
    p_device_id: deviceId,
    p_device_label: getLiveDeviceLabel(),
    p_force: force,
  });
  if (error) throw error;
  if (data?.granted) setLocalLiveControl(setup.matchId, data);
  return data;
}

export async function claimLiveControl(setup, { force = false } = {}) {
  if (!setup?.matchId) throw new Error("No hay partido Live preparado.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Necesitas conexión para obtener el control del anotador.");
  }

  const deviceId = getLivePhysicalDeviceId();
  const current = await getLiveControlStatus(setup.matchId).catch(() => ({ active: false }));

  // If a lease row already exists, even expired, the match already exists remotely.
  // Claim first so protected roster/state writes never run with a stale/null token.
  if (current?.device_id) {
    if (current.active && String(current.device_id) !== String(deviceId) && !force) {
      return { granted: false, ...current, reason: "held_by_other_device" };
    }
    return requestClaim(setup, deviceId, force);
  }

  // Brand-new local sessions need their match+roster created before the FK-backed lease.
  const prepared = await ensureRemoteLiveSession(setup);
  if (!prepared?.ok) throw new Error("No se pudo preparar el Live remoto.");
  return requestClaim(setup, deviceId, force);
}

export async function heartbeatLiveControl(setup) {
  const current = readSetup();
  const token = current?.matchId === setup?.matchId ? current?.controlToken : null;
  const deviceId = getLivePhysicalDeviceId();
  if (!setup?.matchId || !token) return { granted: false, reason: "missing_local_control" };

  const { data, error } = await supabase.rpc("heartbeat_live_match_control", {
    p_match_id: setup.matchId,
    p_device_id: deviceId,
    p_control_token: token,
  });
  if (error) throw error;
  if (data?.granted) setLocalLiveControl(setup.matchId, { ...data, device_id: deviceId, control_token: token });
  return data;
}

export async function releaseLiveControl(setup) {
  const current = readSetup();
  const token = current?.matchId === setup?.matchId ? current?.controlToken : null;
  if (!setup?.matchId || !token) return false;

  const { data, error } = await supabase.rpc("release_live_match_control", {
    p_match_id: setup.matchId,
    p_device_id: getLivePhysicalDeviceId(),
    p_control_token: token,
  });
  if (error) throw error;
  clearLocalLiveControl(setup.matchId);
  return Boolean(data);
}
