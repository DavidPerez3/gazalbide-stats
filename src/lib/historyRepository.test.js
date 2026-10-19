import { expect, it, vi } from 'vitest';
const { fixtures, select } = vi.hoisted(() => ({ fixtures: { rows: [] }, select: vi.fn() }));
vi.mock('./supabaseClient.js', () => ({ supabase: { from: () => {
  const q = { select: (...args) => { select(...args); return q; }, eq: () => q,
    order: () => q, then: (fn) => Promise.resolve({ data: fixtures.rows, error: null }).then(fn) };
  return q;
} } }));
import { loadHistoricalPlayerRows, loadLineupHistory } from './historyRepository.js';

it('defaults historical stats to league and allows an explicit friendly or all scope', async () => {
  fixtures.rows = [false, true].map((friendly, i) => ({ match_id: `match-${i}`, player_id: 5,
    match: { is_friendly: friendly, season: '2026-2027' }, player: { name: 'Julen' } }));
  expect((await loadHistoricalPlayerRows()).map(r => r.match_id)).toEqual(['match-0']);
  expect((await loadHistoricalPlayerRows({ matchType: 'friendly' })).map(r => r.match_id)).toEqual(['match-1']);
  expect(await loadHistoricalPlayerRows({ matchType: 'all' })).toHaveLength(2);
  expect(select.mock.calls[0][0]).toContain('is_friendly');
});
it('applies the same scope to lineup rankings', async () => {
  fixtures.rows = [false, true].map((friendly, i) => ({ match_id: `match-${i}`, player_ids: [5], match: { is_friendly: friendly } }));
  expect((await loadLineupHistory()).map(r => r.match_id)).toEqual(['match-0']);
  expect((await loadLineupHistory({ matchType: 'friendly' })).map(r => r.match_id)).toEqual(['match-1']);
});
