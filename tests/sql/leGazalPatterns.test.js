// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import fs from 'node:fs';
import { evaluateGrid, spinSlot } from '../../src/features/le-gazal/slotEngine.js';
import PAYLINES from '../../src/features/le-gazal/paylines.json';
let db;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table fantasy_teams(id uuid primary key,user_id uuid);
 create table gameweeks(id bigint primary key);
 create table fantasy_economy_ledger(fantasy_team_id uuid,gameweek_id bigint,entry_type text,event_key text,amount integer,metadata jsonb,created_by uuid);
 `);
 const baseline=fs.readFileSync('supabase/migrations/20260815230000_le_gazal_fantasy_backend.sql','utf8');
 await db.exec(baseline.slice(baseline.indexOf('create table if not exists public.le_gazal_sessions'),baseline.indexOf('alter table public.le_gazal_sessions enable')));
 await db.exec("alter table le_gazal_spins drop constraint le_gazal_spins_scenario_check;");
 await db.exec(fs.readFileSync('supabase/migrations/20261021075446_le_gazal_patterns.sql','utf8'));
},30000);
afterAll(async()=>db?.close());
const payout={lose:0,small:1,medium:2,high:4,wild:2,scatter:0,scatter4:0,scatter5:0,bonus:0};
it('keeps the browser and server catalog identical with 20 unique paths',async()=>{
 const p=(await db.query('select gazalbide_internal.le_gazal_paylines() p')).rows[0].p;
 expect(p).toEqual(PAYLINES);
 expect(new Set(p.map(x=>x.rows.slice(0,3).join())).size).toBe(20);
});
it('every recorded board matches its exact prize and bonus symbols, without phantom winning lines',async()=>{
 const results=(await db.query(`select scenario,n,gazalbide_internal.le_gazal_visual(scenario,md5(n::text)::uuid,3*multiplier) v
 from (values ('lose',0),('small',1),('medium',2),('high',4),('wild',2),('scatter',0),('scatter4',0),('scatter5',0),('bonus',0)) s(scenario,multiplier) cross join generate_series(1,80) n`)).rows;
 let diagonals=0,dual=0;
 for(const {scenario,v} of results){
   const e=evaluateGrid(v.grid,3);
   expect(e.amountWon,scenario).toBe(3*payout[scenario]);
   expect(e.winningCombinations.map(x=>x.lineId).sort()).toEqual(v.winningCombinations.map(x=>x.lineId).sort());
   expect(v.winningCombinations.reduce((s,x)=>s+x.amountWon,0)).toBe(e.amountWon);
   if (v.winningCombinations.some(x=>x.lineId>5)) diagonals++;
   if(v.winningCombinations.length>1) dual++;
   const count=scenario==='scatter5'?5:scenario==='scatter4'?4:scenario==='scatter'?3:0;
   expect(e.scatterCount).toBe(count);expect(e.bonusCount).toBe(scenario==='bonus'?3:0);
 }
 expect(diagonals).toBeGreaterThan(0);expect(dual).toBeGreaterThan(0);
});
it('demo uses nonhorizontal wins and never displays a win in losing or bonus scenarios',()=>{
 let seed=17;const randomSource=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 const ids=new Set();
 for(const scenario of Object.keys(payout))for(let n=0;n<100;n++){
  const spin=spinSlot({bet:3,forcedOutcome:scenario,randomSource});
  expect(spin.amountWon).toBe(3*payout[scenario]);
  spin.winningCombinations.forEach(x=>ids.add(x.lineId));
 }
 expect(ids.size).toBe(20);
});
it('records the server board atomically with balance, ledger, bonus and free-spin accounting',async()=>{
 const owner='00000000-0000-0000-0000-000000000001', team='00000000-0000-0000-0000-000000000002';
 await db.exec(`insert into fantasy_teams values('${team}','${owner}');insert into gameweeks values(1);
 insert into le_gazal_sessions(fantasy_team_id,gameweek_id,starting_balance,balance) values('${team}',1,1000,1000);select set_config('test.uid','${owner}',false);`);
 const session=(await db.query('select id from le_gazal_sessions')).rows[0].id;
 let before=1000;
 for(let i=0;i<80;i++){
  const r=(await db.query('select le_gazal_spin($1,3) r',[session])).rows[0].r;
  expect(r.balance).toBe(before-r.bet_spent+r.payout);before=r.balance;
  expect(evaluateGrid(r.visual_result.grid,r.bet,r.round_multiplier).amountWon).toBe(r.payout);
  expect((await db.query('select visual_result from le_gazal_spins where id=$1',[r.spin_id])).rows[0].visual_result).toEqual(r.visual_result);
 }
 await db.exec(`update le_gazal_sessions set free_spins_remaining=2,free_spin_bet=3,bonus_multiplier=3;`);
 const r=(await db.query('select le_gazal_spin($1,10) r',[session])).rows[0].r;
 expect(r.was_free_spin).toBe(true);expect(r.bet_spent).toBe(0);expect(r.bet).toBe(3);expect(r.round_multiplier).toBe(3);
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");
 await expect(db.query('select le_gazal_spin($1,3)',[session])).rejects.toThrow('session not found');
 expect((await db.query("select has_function_privilege('authenticated','gazalbide_internal.le_gazal_visual(text,uuid,integer)','execute') allowed")).rows[0].allowed).toBe(false);
});
