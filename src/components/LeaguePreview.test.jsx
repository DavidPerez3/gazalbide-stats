import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabaseClient.js', () => ({ supabase: { rpc } }));
import LeaguePreview from './LeaguePreview.jsx';
afterEach(cleanup);
it('shows opponent form, previous meetings and a provisional-data notice',async()=>{
 rpc.mockResolvedValue({ data: { opponent: 'Pozo I. Moicar',date:'2026-10-25',home:true,rival:{wins:0,losses:1,games:1,form:['D']},h2h:[{id:'old-match',date:'2026-02-28',gazal:60,rival:40}],standings:[],group_games:3,provisional:true,source:{url:'https://basketaraba.com'} } });
 render(<MemoryRouter><LeaguePreview seasonId="2026-2027" /></MemoryRouter>);
 await screen.findByRole('heading',{name:'Pozo I. Moicar'});
 expect(screen.getByRole('link',{name:/60–40/}).getAttribute('href')).toBe('/partido/old-match');
 expect(screen.getByText(/Datos iniciales/)).toBeTruthy();
 expect(rpc).toHaveBeenCalledWith('get_league_preview',{p_season:'2026-2027',p_opponent:null,p_date:null});
});
it('handles unavailable federation data without blocking the page',async()=>{
 rpc.mockResolvedValue({error:{message:'offline'}});
 render(<LeaguePreview seasonId="2026-2027" />);
 expect(await screen.findByRole('status')).toHaveTextContent('no está disponible');
});
