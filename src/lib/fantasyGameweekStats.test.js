import { beforeEach, expect, it, vi } from 'vitest';
const { from, results } = vi.hoisted(() => ({ from: vi.fn(), results: {} }));
vi.mock('./supabaseClient.js', () => ({ supabase: { from } }));
import { loadFantasyGameweekStats } from './fantasyGameweekStats.js';
beforeEach(() => {
  from.mockReset();
  from.mockImplementation((table) => {
    const query = { select: () => query, eq: () => query, order: () => query, maybeSingle: async () => results[table], then: (resolve, reject) => Promise.resolve(results[table]).then(resolve, reject) };
    return query;
  });
  results.matches = { data: { status: 'published', publication_version: 1 } };
  results.player_match_stats = { data: [{ player_id: 7, pir: -2, pts: 4 }] };
  results.game_roster = { data: [{ player_id: 7, jersey_number: '14', player_name: 'Iñaki' }] };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ number: '10', pir: 17 }] })));
});
it('resolves a published Live game even when its JSON reference is stale', async () => {
  const result = await loadFantasyGameweekStats({ match_id: 'live-match', stats_file: 'missing.json' });
  expect(result.source).toBe('supabase');
  expect(result.map.get(14).pir).toBe(-2);
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves static historical games without a Live publication', async () => {
  results.matches.data.publication_version = 0;
  const result = await loadFantasyGameweekStats({ match_id: 'old-match', stats_file: 'old.json' }, '/club/');
  expect(result.map.get(10).pir).toBe(17);
  expect(fetch).toHaveBeenCalledWith('/club/data/player_stats/old.json');
});
it('does not present unpublished Live data as final Fantasy scoring', async () => {
  results.matches.data.status = 'live';
  expect(await loadFantasyGameweekStats({ stats_file: 'live:match' })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('propagates database errors instead of substituting stale JSON', async () => {
  results.matches = { error: new Error('unavailable') };
  await expect(loadFantasyGameweekStats({ match_id: 'match', stats_file: 'old.json' })).rejects.toThrow('unavailable');
});
