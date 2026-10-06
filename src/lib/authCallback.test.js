import { describe, it, expect, vi } from "vitest";
import { prepareAuthCallback } from "./authCallback";
function environment(path) {
  return { location: { href: `https://example.test/gazalbide-stats/${path}` }, history: { state: null, replaceState: vi.fn() } };
}
describe("auth callback routing", () => {
  it("waits until the SDK consumes a callback before changing the hash", async () => {
    let finish;
    const auth = { getSession: vi.fn(() => new Promise((resolve) => { finish = resolve; })) };
    const env = environment("#access_token=test-placeholder&refresh_token=test-placeholder&provider_token=test-placeholder");
    const task = prepareAuthCallback(auth, env.location, env.history);
    expect(env.history.replaceState).not.toHaveBeenCalled();
    finish({ data: { session: {} }, error: null });
    await task;
    expect(env.history.replaceState).toHaveBeenCalledWith(null, "", "/gazalbide-stats/#/");
  });
  it("preserves password recovery and removes callback parameters", async () => {
    const env = environment("?utm_source=test#access_token=test-placeholder&type=recovery");
    await prepareAuthCallback({ getSession: vi.fn().mockResolvedValue({ data: { session: {} } }) }, env.location, env.history);
    expect(env.history.replaceState).toHaveBeenCalledWith(null, "", "/gazalbide-stats/?utm_source=test#/reset-password");
  });
  it("routes expired callbacks to login with a safe notice", async () => {
    const env = environment("?error=invalid_request&error_code=bad_oauth_state&error_description=expired");
    await prepareAuthCallback({ getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: {} }) }, env.location, env.history);
    expect(env.history.replaceState).toHaveBeenCalledWith(null, "", "/gazalbide-stats/?auth_callback_error=1#/login");
  });
  it("handles code callbacks and failure to initialize without exposing their values", async () => {
    const env = environment("?code=test-placeholder&state=test-placeholder");
    await prepareAuthCallback({ getSession: vi.fn().mockRejectedValue(new Error("failure")) }, env.location, env.history);
    expect(env.history.replaceState).toHaveBeenCalledWith(null, "", "/gazalbide-stats/?auth_callback_error=1#/login");
  });
  it("leaves normal application routes and query strings untouched", async () => {
    const env = environment("#/porra?view=live"); const auth = { getSession: vi.fn() };
    await prepareAuthCallback(auth, env.location, env.history);
    expect(auth.getSession).not.toHaveBeenCalled(); expect(env.history.replaceState).not.toHaveBeenCalled();
  });
});
