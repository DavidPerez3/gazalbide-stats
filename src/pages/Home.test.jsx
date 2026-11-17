import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const { matches, getTechsMock } = vi.hoisted(() => ({ matches: [], getTechsMock: vi.fn() }));
vi.mock('../context/SeasonContext.jsx', () => ({ useSeason: () => ({ activeSeason: { id: 'test', label: '2026–2027', current: true } }) }));
vi.mock('../lib/data', () => ({ getMatches: async () => matches, getPlayers: async () => [], getTechs: getTechsMock, getMatchStats: async () => [] }));
vi.mock('../lib/supabaseClient.js', () => ({ supabase: { from: () => { const q = { select: () => q, eq: () => q, gte: () => q, order: () => q, then: (fn) => Promise.resolve({ data: [] }).then(fn) }; return q; } } }));
vi.mock('../components/LeaguePreview.jsx', () => ({ default: () => null }));
vi.mock('../components/PublicLiveBanner.jsx', () => ({ default: () => null }));
vi.mock('../components/DashboardHighlights', () => ({ default: () => <div>Destacados</div> }));
import Home from './Home.jsx';
beforeEach(()=>{getTechsMock.mockReset();getTechsMock.mockResolvedValue({});});
afterEach(() => cleanup());
it('keeps the shoulder counter visible in an empty season', async () => {
  matches.length = 0;
  render(<MemoryRouter><Home /></MemoryRouter>);
  await screen.findByText(/Todavía no hay partidos publicados/);
  expect(screen.getByRole('heading', { name: 'Hombro de Imanol' })).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.queryByText(/Bienvenido/)).toBeNull();
});
it('starts with three recent games, then expands and filters the full list', async () => {
  matches.splice(0, matches.length, ...[1,2,3,4].map(i => ({ id: `match-${i}`, date: `2026-10-0${i}`, opponent: `Rival ${i}`, gazal_pts: 50+i, opp_pts: 40, result: 'W' })));
  render(<MemoryRouter><Home /></MemoryRouter>);
  await screen.findByText('Rival 4');
  expect(screen.queryByText('Rival 1')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Ver todos/ }));
  expect(screen.getByText('Rival 1')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por rival' }), { target: { value: 'Rival 2' } });
  expect(screen.getByText('Rival 2')).toBeTruthy();
  expect(screen.queryByText('Rival 4')).toBeNull();
});
it('defaults to league and isolates friendly results when switching sections', async () => {
  matches.splice(0, matches.length,
    { id: 'league', date: '2026-10-18', opponent: 'Vedrisko', gazal_pts: 44, opp_pts: 42, result: 'W', is_friendly: false },
    { id: 'friendly', date: '2026-10-03', opponent: 'Atzurrak Sugoiak', gazal_pts: 50, opp_pts: 34, result: 'W', is_friendly: true });
  render(<MemoryRouter><Home /></MemoryRouter>);
  await screen.findByText('Vedrisko');
  expect(screen.queryByText('Atzurrak Sugoiak')).toBeNull();
  expect(screen.getByRole('button', { name: 'Liga' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('44,0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Amistosos' }));
  await screen.findByText('Atzurrak Sugoiak');
  expect(screen.queryByText('Vedrisko')).toBeNull();
  expect(screen.getByText('50,0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Liga' }));
  await screen.findByText('Vedrisko');
  expect(screen.queryByText('Atzurrak Sugoiak')).toBeNull();
});

it('shows the official technical total and reloads it when switching competition',async()=>{
 matches.splice(0,matches.length,{id:'league',date:'2026-10-18',opponent:'Vedrisko',gazal_pts:44,opp_pts:42,result:'W'});
 getTechsMock.mockImplementation(async(_season,{matchType})=>matchType==='league'?{'13':{name:'Aguirre',tech_fouls:2},'15':{name:'Gontzal',tech_fouls:1},'10':{name:'Oier',tech_fouls:1}}:{});
 render(<MemoryRouter><Home/></MemoryRouter>);await screen.findByText('Vedrisko');
 const summary=screen.getByLabelText('Resumen de temporada');expect(within(summary).getByText('Técnicas').parentElement.querySelector('strong')).toHaveTextContent('4');expect(within(summary).getByTitle('Máximo: #13 Aguirre (2)')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Amistosos'}));await screen.findByText(/Todavía no hay partidos publicados/);expect(within(summary).getByText('Técnicas').parentElement.querySelector('strong')).toHaveTextContent('0');expect(getTechsMock).toHaveBeenLastCalledWith('test',{matchType:'friendly'});
});
it('shows unavailable technicals without hiding the rest of the dashboard',async()=>{matches.length=0;getTechsMock.mockRejectedValue(Error('offline'));render(<MemoryRouter><Home/></MemoryRouter>);await screen.findByText(/No se pudieron cargar las técnicas/);const summary=screen.getByLabelText('Resumen de temporada');expect(within(summary).getByText('Técnicas').parentElement.querySelector('strong')).toHaveTextContent('—');expect(screen.getByRole('heading',{name:'Hombro de Imanol'})).toBeInTheDocument();});
