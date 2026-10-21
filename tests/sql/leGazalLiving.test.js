// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,expect,it } from 'vitest';
import fs from 'node:fs';
import { createLivingRound } from '../../src/features/le-gazal/livingEngine.js';
let db;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table fantasy_teams(id uuid primary key,user_id uuid);create table gameweeks(id bigint primary key);
 create table fantasy_economy_ledger(fantasy_team_id uuid,gameweek_id bigint,entry_type text,event_key text,amount integer,metadata jsonb,created_by uuid);`);
 const old=fs.readFileSync('supabase/migrations/20260815230000_le_gazal_fantasy_backend.sql','utf8');
 await db.exec(old.slice(old.indexOf('create table if not exists public.le_gazal_sessions'),old.indexOf('alter table public.le_gazal_sessions enable')));
 await db.exec('alter table le_gazal_spins drop constraint le_gazal_spins_scenario_check;');
 await db.exec(fs.readFileSync('supabase/migrations/20261021075446_le_gazal_patterns.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021084943_le_gazal_living_board.sql','utf8'));
},30000);
afterAll(async()=>db?.close());
it('server and demo produce the same complete sequence for every scenario, including no-prize actions and scatters',async()=>{
 const samples=(await db.query(`select scenario,seed,gazalbide_internal.le_gazal_living(scenario,seed,3,2) r
 from (values('lose'),('small'),('medium'),('high'),('wild'),('scatter'),('scatter4'),('scatter5'),('bonus')) s(scenario) cross join generate_series(0,63) seed`)).rows;
 for(const {scenario,seed,r} of samples)expect(r,`${scenario}/${seed}`).toEqual(createLivingRound({scenario,seed,bet:3,multiplier:2}));
});
it('only collects activated reachable symbols, applies real column gravity and conserves the payout',()=>{
 for(let seed=0;seed<256;seed++){
  const round=createLivingRound({scenario:'high',seed,bet:1,multiplier:1.5});
  expect(round.amountWon).toBe(6);expect(round.events.reduce((s,e)=>s+e.amount,0)).toBe(6);
  let positions=round.starts;
  round.events.forEach((e,i)=>{
   if(e.kind==='move'){
    expect(Math.abs(positions[e.actor].row-e.row)+Math.abs(positions[e.actor].col-e.col)).toBe(1);
    expect(round.events[i-1].kind).toBe('transform');
   }
   if(e.kind==='collect'){
    expect(round.events[i-1].grid[e.row][e.col]).toBe(e.actor==='raccoon'?'BALL':'HOOP');
    expect(e.grid[e.row][e.col]).toBeNull();
    const refill=round.events[i+1];expect(refill.kind).toBe('cascade');
    for(let r=1;r<=e.row;r++)expect(refill.grid[r][e.col]).toBe(e.grid[r-1][e.col]);
   }
   positions=e.positions;
  });
  expect(round.events.filter(e=>e.kind==='collect').map(e=>e.actor).sort()).toEqual(['raccoon','raccoon','salamander','salamander']);
 }
});
it('persists events, updates the correct balance once per RPC and enforces ownership and free spins',async()=>{
 await db.exec(`insert into fantasy_teams values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');insert into gameweeks values(1);
 insert into le_gazal_sessions(fantasy_team_id,gameweek_id,starting_balance,balance) values('00000000-0000-0000-0000-000000000002',1,1000,1000);
 select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);`);
 const id=(await db.query('select id from le_gazal_sessions')).rows[0].id;
 let before=1000;
 for(let i=0;i<60;i++){
  const r=(await db.query('select le_gazal_spin($1,3) r',[id])).rows[0].r;
  expect(r.visual_result.mode).toBe('living');
  expect(r.visual_result.events.reduce((s,e)=>s+e.amount,0)).toBe(r.payout);
  expect(r.balance).toBe(before-r.bet_spent+r.payout);before=r.balance;
  expect((await db.query('select visual_result from le_gazal_spins where id=$1',[r.spin_id])).rows[0].visual_result).toEqual(r.visual_result);
 }
 await db.exec('update le_gazal_sessions set free_spins_remaining=2,free_spin_bet=3,bonus_multiplier=3;');
 const free=(await db.query('select le_gazal_spin($1,10) r',[id])).rows[0].r;
 expect(free.bet_spent).toBe(0);expect(free.bet).toBe(3);expect(free.round_multiplier).toBe(3);
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");
 await expect(db.query('select le_gazal_spin($1,3)',[id])).rejects.toThrow('session not found');
 expect((await db.query("select has_function_privilege('authenticated','gazalbide_internal.le_gazal_living(text,integer,integer,numeric)','execute') allowed")).rows[0].allowed).toBe(false);
});
