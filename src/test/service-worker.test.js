// @vitest-environment node
import { expect, it, vi } from 'vitest';
import vm from 'node:vm';
import fs from 'node:fs';

function worker(scope = 'https://club.example/gazalbide-stats/') {
  const handlers = {};
  const entries = new Map();
  const cache = { match: vi.fn(async (key) => entries.get(typeof key === 'string' ? key : key.url)), put: vi.fn(async (key, value) => entries.set(typeof key === 'string' ? key : key.url, value)), keys: async () => [...entries.keys()].map((url) => ({ url })), delete: async (key) => entries.delete(key.url), addAll: vi.fn(async () => {}) };
  const caches = { open: async () => cache, keys: async () => ['unrelated-app', 'gazalbide-stats-v6'], delete: vi.fn(async () => true) };
  const response = { status: 200, type: 'basic', clone() { return this; } };
  const fetch = vi.fn(async () => response);
  const self = { registration: { scope }, location: { origin: new URL(scope).origin }, addEventListener: (name, handler) => { handlers[name] = handler; }, clients: { claim: async () => {} }, skipWaiting: async () => {} };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, caches, fetch, URL, Response });
  async function request(url, mode = 'navigate', method = 'GET') {
    let result;
    handlers.fetch({ request: { url, mode, method }, respondWith(value) { result = value; } });
    return result ? await result : undefined;
  }
  return { handlers, cache, caches, fetch, response, request, entries };
}
it('updates the offline shell and falls back to it in both hosting layouts', async () => {
  for (const scope of ['https://club.example/', 'https://club.example/gazalbide-stats/']) {
    const w = worker(scope);
    expect(await w.request(scope)).toBe(w.response);
    expect(w.cache.put).toHaveBeenCalledWith(scope, w.response);
    w.fetch.mockRejectedValue(new Error('offline'));
    expect(await w.request(scope)).toBe(w.response);
  }
});
it('does not cache callback responses, intercept writes or Supabase requests', async () => {
  const w = worker();
  await w.request('https://club.example/gazalbide-stats/?code=private');
  expect(w.cache.put).not.toHaveBeenCalled();
  expect(await w.request('https://project.supabase.co/rest/v1/profiles', 'cors')).toBeUndefined();
  expect(await w.request('https://club.example/gazalbide-stats/', 'cors', 'POST')).toBeUndefined();
  expect(w.fetch).toHaveBeenCalledTimes(1);
});
it('removes only this app’s old caches', async () => {
  const w = worker();
  let completion;
  w.handlers.activate({ waitUntil(value) { completion = value; } });
  await completion;
  expect(w.caches.delete.mock.calls).toEqual([['gazalbide-stats-v6']]);
});
it('refreshes published JSON rather than keeping stale match data', async () => {
  const w = worker();
  const url = 'https://club.example/gazalbide-stats/data/match.json';
  w.entries.set(url, { old: true });
  expect(await w.request(url, 'cors')).toBe(w.response);
  expect(w.cache.put).toHaveBeenCalled();
});
