import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./supabaseClient.js',()=>({supabase:{}}));
vi.mock('./statsRepository.js',()=>({getMatchesFromSupabase:vi.fn(),getMatchStatsFromSupabase:vi.fn(),getPlayersFromSupabase:vi.fn()}));
vi.mock('./historyRepository.js',()=>({loadHistoricalPlayerRows:vi.fn(),loadPlayerDisciplineAdjustments:vi.fn()}));
import {getTechs} from './data';
import {loadHistoricalPlayerRows,loadPlayerDisciplineAdjustments} from './historyRepository';
afterEach(()=>vi.resetAllMocks());
const row=(id,name,number,fields)=>({player_id:id,playerId:id,playerName:name,playerNumber:number,...fields});
it('counts general technicals and both categories from current published statistics',async()=>{
 loadHistoricalPlayerRows.mockResolvedValue([row(14,'Aguirre','13',{pf_technical_cat_1:2}),row(16,'Gontzal','15',{pf_technical_cat_1:1}),row(1,'Oier','10',{pf_technical:1,pf_technical_cat_2:1})]);loadPlayerDisciplineAdjustments.mockResolvedValue([]);
 const result=await getTechs('2026-2027');expect(result['13']).toMatchObject({name:'Aguirre',tech_fouls:2});expect(result['15'].tech_fouls).toBe(1);expect(result['10'].tech_fouls).toBe(2);expect(loadHistoricalPlayerRows).toHaveBeenCalledWith({seasonId:'2026-2027',matchType:'league'});
});
it('keeps the historical season adjustment once, without adding the legacy JSON again',async()=>{loadHistoricalPlayerRows.mockResolvedValue([row(14,'Aguirre','13',{pf_technical:1})]);loadPlayerDisciplineAdjustments.mockResolvedValue([{player_id:14,technical:2,player:{name:'Aguirre',number:'13'}}]);expect((await getTechs('2025-2026'))['13'].tech_fouls).toBe(3);});
it('requests friendlies separately and excludes season-only discipline adjustments',async()=>{loadHistoricalPlayerRows.mockResolvedValue([row(14,'Aguirre','13',{pf_technical_cat_2:1})]);expect((await getTechs('2026-2027',{matchType:'friendly'}))['13'].tech_fouls).toBe(1);expect(loadHistoricalPlayerRows).toHaveBeenCalledWith({seasonId:'2026-2027',matchType:'friendly'});expect(loadPlayerDisciplineAdjustments).not.toHaveBeenCalled();});
it('does not turn an unavailable official source into a false zero',async()=>{loadHistoricalPlayerRows.mockRejectedValue(Error('offline'));loadPlayerDisciplineAdjustments.mockResolvedValue([]);await expect(getTechs('2026-2027')).rejects.toThrow('offline');});
