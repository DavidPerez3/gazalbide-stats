const AUTH_PARAMETERS = ["access_token", "refresh_token", "provider_token", "provider_refresh_token", "token_type", "expires_in", "expires_at", "type", "code", "state", "error", "error_code", "error_description", "sb"];

// Supabase consumes the callback before React Router interprets the same hash.
// getSession is used only to await SDK initialization, never for authorization.
export async function prepareAuthCallback(auth, location = window.location, history = window.history) {
  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.startsWith("#/") ? "" : url.hash.slice(1));
  const callback = hash.has("access_token") || hash.has("error") || url.searchParams.has("code") || url.searchParams.has("error");
  if (!callback) return;
  const recovery = hash.get("type") === "recovery";
  let failed = hash.has("error") || url.searchParams.has("error");
  try {
    const result = await auth.getSession();
    failed = failed || Boolean(result.error) || !result.data?.session;
  } catch {
    failed = true;
  }
  for (const key of AUTH_PARAMETERS) url.searchParams.delete(key);
  url.hash = failed ? "/login" : recovery ? "/reset-password" : "/";
  if (failed) url.searchParams.set("auth_callback_error", "1");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
