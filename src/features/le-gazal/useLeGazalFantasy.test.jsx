import { act,renderHook,waitFor } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { createLivingRound } from './livingEngine';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),rows:{},user:{id:'owner'}}));
vi.mock('../../context/AuthContext.jsx',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('../../lib/supabaseClient.js',()=>({supabase:{rpc:mocks.rpc,from:table=>{
 const chain={};['select','eq','order','limit'].forEach(k=>chain[k]=()=>chain);
 chain.maybeSingle=chain.single=async()=>({data:mocks.rows[table]||null,error:null});return chain;
}}}));
import { useLeGazalFantasy } from './useLeGazalFantasy';
afterEach(()=>{vi.useRealTimers();});
it('keeps spinning and cashout blocked until the living sequence finishes, then publishes the saved balance once',async()=>{
 const round=createLivingRound({scenario:'small',seed:0,bet:3});
 mocks.rows={fantasy_teams:{id:'team'},gameweeks:{id:41,name:'J2'},le_gazal_sessions:{id:'session',status:'active',gameweek_id:41,balance:20,total_spins:0}};
 mocks.rpc.mockResolvedValue({data:{visual_result:round,scenario:'small',bet:3,bet_spent:3,payout:3,balance:20,free_spins_remaining:0,bonus_multiplier:1},error:null});
 const {result,unmount}=renderHook(()=>useLeGazalFantasy());
 await waitFor(()=>expect(result.current.loading).toBe(false));vi.useFakeTimers();
 await act(async()=>{await result.current.spin();});
 expect(result.current.isSpinning).toBe(true);
 await act(async()=>{await result.current.spin();await result.current.cashout();});
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
 await act(async()=>{vi.advanceTimersByTime(1800);});
 expect(result.current.livingFrame.playing).toBe(true);expect(result.current.isSpinning).toBe(true);
 await act(async()=>{vi.runAllTimers();});
 expect(result.current.grid).toEqual(round.finalGrid);expect(result.current.session.balance).toBe(20);
 expect(result.current.session.total_spins).toBe(1);expect(result.current.isSpinning).toBe(false);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);unmount();
});
