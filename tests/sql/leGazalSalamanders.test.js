// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,expect,it } from 'vitest';
import fs from 'node:fs';
import { createSalamanderRound,resolveSalamanderRound,salamanderTarget,SALAMANDER_VALUES } from '../../src/features/le-gazal/salamanderEngine.js';
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table fantasy_teams(id uuid primary key,user_id uuid); create table gameweeks(id bigint primary key);
    create table fantasy_economy_ledger(fantasy_team_id uuid,gameweek_id bigint,entry_type text,event_key text,amount integer,metadata jsonb,created_by uuid);`);
  const old = fs.readFileSync('supabase/migrations/20260815230000_le_gazal_fantasy_backend.sql','utf8');
  await db.exec(old.slice(old.indexOf('create table if not exists public.le_gazal_sessions'),old.indexOf('alter table public.le_gazal_sessions enable')));
  await db.exec('alter table le_gazal_spins drop constraint le_gazal_spins_scenario_check;');
  for (const name of ['20261021075446_le_gazal_patterns','20261021084943_le_gazal_living_board','20261021095220_le_gazal_bonus_upgrades','20261021101859_le_gazal_symbol_collections','20261021111438_le_gazal_four_salamanders','20261021120155_le_gazal_occupied_cells'])
    await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
}, 30000);
afterAll(async () => db?.close());

const board={columns:6,collections:5,levels:{'0-1':2,'4-4':1}};
it('matches all four actors, decimal rewards, floor upgrades and mixed grids in JS and SQL',async()=>{
 for(const inBonus of [false,true])for(const columns of [6,7,8]){
  const state={...board,columns};
  const rows=(await db.query('select seed,gazalbide_internal.le_gazal_salamanders(seed,3,1.5,$1,$2) r from generate_series(1,80) seed',[inBonus,JSON.stringify(state)])).rows;
  for(const {seed,r} of rows)expect(r,`${inBonus}/${columns}/${seed}`).toEqual(createSalamanderRound({seed,bet:3,multiplier:1.5,inBonus,boardState:state}));
 }
},20000);
it('moves only to the matching color, excludes all three other actors and conserves positive fractional prizes',()=>{
 const collected=new Set();
 for(let seed=0;seed<500;seed++){
  const r=createSalamanderRound({seed:seed*104729,bet:1,inBonus:true,boardState:board});
  let grid=r.grid,positions=r.starts,floor=r.initialBoard;
  expect(Object.keys(positions)).toEqual(['yellow','pink','blue','green']);
  let cents=0;
  for(const e of r.events){
   expect(e.actor).not.toBe('raccoon');
   if(e.kind==='move')expect(salamanderTarget(grid,positions,e.actor,floor.levels)).toMatchObject({row:e.row,col:e.col,symbol:e.symbol});
   if(e.kind==='collect'){
    expect(SALAMANDER_VALUES[e.actor][e.symbol]).toBe(1);expect(e.amount).toBeGreaterThan(0);
    collected.add(e.actor);cents+=Math.round(e.amount*100);
   }
   if(e.kind==='expand')break;
   grid=e.grid;positions=e.positions;floor=e.board;
  }
  for(const actor of Object.keys(positions))expect(salamanderTarget(grid,positions,actor,floor.levels)).toBeNull();
  expect(cents).toBe(Math.round(r.amountWon*100));
 }
 expect([...collected].sort()).toEqual(['blue','green','pink','yellow']);
});
it('mixes all four colors across both halves and offers stationary QA losses',()=>{
 const counts=Array.from({length:6},()=>({BALL:0,WHISTLE:0,SHOE:0,HOOP:0}));
 for(let seed=0;seed<300;seed++){
  const r=createSalamanderRound({seed:seed*104729});
  for(const row of r.grid)row.forEach((s,c)=>{if(s && s!=='SHIELD')counts[c][s]++;});
 }
 for(const [column,c] of counts.entries())for(const n of Object.values(c))expect(n).toBeGreaterThan(column===0 || column===5 ? 150 : 250);
 const loss=createSalamanderRound({forcedOutcome:'lose'});expect(loss.events).toEqual([]);expect(loss.amountWon).toBe(0);
 const fixture=createSalamanderRound({forcedOutcome:'high'});expect(fixture.events.filter(e=>e.kind==='collect').length).toBeGreaterThanOrEqual(4);
 for(const scenario of ['scatter','scatter4','scatter5'])expect(createSalamanderRound({forcedOutcome:scenario}).freeSpinsAwarded).toBeGreaterThan(0);
});
it('preserves cents across RPCs, ledger and reloads without rounding balances up',async()=>{
 await db.exec(`insert into fantasy_teams values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');insert into gameweeks values(1);
 insert into le_gazal_sessions(fantasy_team_id,gameweek_id,starting_balance,balance,free_spins_remaining,free_spin_bet,bonus_multiplier,board_state)
 values('00000000-0000-0000-0000-000000000002',1,1000,1000.25,100,1,2,'{"columns":6,"collections":0,"levels":{}}');
 select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);`);
 const id=(await db.query('select id from le_gazal_sessions')).rows[0].id;
 let balance=100025;
 for(let i=0;i<40;i++){
  const r=(await db.query('select le_gazal_spin($1,10) r',[id])).rows[0].r;
  expect(r.visual_result.patternVersion).toBe(6);expect(r.bet_spent).toBe(0);expect(r.bet).toBe(1);
  balance+=Math.round(r.payout*100);expect(Math.round(r.balance*100)).toBe(balance);
  const saved=(await db.query('select * from le_gazal_spins where id=$1',[r.spin_id])).rows[0];
  expect(Number(saved.payout)).toBe(r.payout);expect(Number(saved.balance_after)).toBe(r.balance);
  expect(saved.visual_result).toEqual(r.visual_result);
 }
 const sum=Number((await db.query('select sum(amount) amount from fantasy_economy_ledger')).rows[0].amount);
 expect(balance).toBe(100025+Math.round(sum*100));
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");
 await expect(db.query('select le_gazal_spin($1,3)',[id])).rejects.toThrow('session not found');
 expect((await db.query("select has_function_privilege('authenticated','gazalbide_internal.le_gazal_salamanders(integer,integer,numeric,boolean,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);
});
it('floors cashout to whole Fantasy beers and reports the discarded cents',async()=>{
 await db.exec(`alter table fantasy_economy_ledger add unique(fantasy_team_id,gameweek_id,event_key);
 alter table gameweeks add column season_id text;update gameweeks set season_id='test';
 create table fantasy_season_settings(season_id text,max_le_gazal_carry integer);insert into fantasy_season_settings values('test',30);
 create table fantasy_gameweek_economy(fantasy_team_id uuid,gameweek_id bigint,carry_out integer,updated_at timestamptz);
 insert into fantasy_gameweek_economy select fantasy_team_id,gameweek_id,0,now() from le_gazal_sessions;
 update le_gazal_sessions set balance=11.99;
 `);
 const id=(await db.query('select id from le_gazal_sessions')).rows[0].id;
 const r=(await db.query("select settle_le_gazal_session($1,'00000000-0000-0000-0000-000000000001',false) r",[id])).rows[0].r;
 expect(r.transferred).toBe(11);expect(r.discarded).toBe(0.99);
 expect((await db.query('select carry_out from fantasy_gameweek_economy')).rows[0].carry_out).toBe(11);
 expect((await db.query('select board_state from le_gazal_sessions')).rows[0].board_state).toBeNull();
});

it('never hides a symbol under any salamander, at the start, on moves, during falls or at the end',()=>{
 for(let seed=0;seed<300;seed++){
  const r=createSalamanderRound({seed:seed*104729,inBonus:true,boardState:board});
  const frames=[{grid:r.grid,positions:r.starts},...r.events,{grid:r.finalGrid,positions:r.events.at(-1)?.positions || r.starts}];
  for(const frame of frames)for(const p of Object.values(frame.positions))expect(frame.grid[p.row][p.col],`${seed}/${frame.kind}`).toBeNull();
 }
});
it('leaves the blue actor cell empty and makes a blue symbol above it reachable after gravity',()=>{
 const source=createSalamanderRound({forcedOutcome:'lose'}).grid.map(row=>[...row]);
 source[4][0]='SHOE';source[3][0]='SHOE';source[2][0]='SHOE';
 const refills=Array.from({length:5},()=>Array(6).fill(null));
 const r=resolveSalamanderRound({grid:source,refills});
 expect(r.grid[4][0]).toBeNull();
 const blue=r.events.filter(e=>e.kind==='collect' && e.actor==='blue');
 expect(blue.length).toBeGreaterThanOrEqual(2);
 for(const e of r.events)for(const p of Object.values(e.positions))expect(e.grid[p.row][p.col]).toBeNull();
 expect(r.amountWon).toBeGreaterThanOrEqual(0.2);
});
