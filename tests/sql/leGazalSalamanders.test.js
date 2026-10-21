// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,expect,it } from 'vitest';
import fs from 'node:fs';
import { createSalamanderRound,resolveSalamanderRound,salamanderTarget,salamanderRoute,settleSalamanderColumns,SALAMANDER_VALUES } from '../../src/features/le-gazal/salamanderEngine.js';
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
  for (const name of ['20261021075446_le_gazal_patterns','20261021084943_le_gazal_living_board','20261021095220_le_gazal_bonus_upgrades','20261021101859_le_gazal_symbol_collections','20261021111438_le_gazal_four_salamanders','20261021120155_le_gazal_occupied_cells','20261021122927_le_gazal_chain_prizes','20261021150529_le_gazal_random_routes'])
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
   if(e.kind==='move'){
    const p=positions[e.actor];expect(Math.abs(p.row-e.row)+Math.abs(p.col-e.col)).toBe(1);
    expect(grid[e.row][e.col]).toBe(e.symbol);expect(SALAMANDER_VALUES[e.actor][e.symbol]).toBe(1);
   }
   if(e.kind==='collect'){
    expect(SALAMANDER_VALUES[e.actor][e.symbol]).toBe(1);expect(e.amount).toBeGreaterThan(0);
    collected.add(e.actor);cents+=Math.round(e.amount*100);
   }
   if(e.kind==='chain')cents+=Math.round(e.amount*100);
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
 for(const c of counts)for(const n of Object.values(c))expect(n).toBeGreaterThan(150);
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
  expect(r.visual_result.patternVersion).toBe(8);expect(r.bet_spent).toBe(0);expect(r.bet).toBe(1);
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
 expect(r.amountWon).toBeGreaterThanOrEqual(0.1);
});

it('pays each cumulative threshold once across actors, with exact cents in both engines',async()=>{
 const fixtures=[[21,4,0],[8,5,.3],[3,9,.3],[1,10,1.2],[38,11,1.2],[16,14,1.2],[187,15,3],[31,16,3]];
 for(const bet of [1,3,10])for(const [seed,count,extras] of fixtures){
  const r=createSalamanderRound({seed,bet});
  expect(r.chainCount).toBe(count);expect(r.chainBonus).toBe(Math.round(extras*bet*100)/100);
  expect(Math.round(r.amountWon*100)).toBe(Math.round((count*.05+extras)*bet*100));
  expect(r.events.filter(e=>e.kind==='chain').map(e=>e.chainCount)).toEqual([5,10,15].filter(n=>n<=count));
  const sql=(await db.query('select gazalbide_internal.le_gazal_salamanders($1,$2,1,false,null) r',[seed,bet])).rows[0].r;
  expect(sql).toEqual(r);
 }
 expect(createSalamanderRound({seed:38}).amountWon).toBe(1.75);
 expect(createSalamanderRound({seed:187}).amountWon).toBe(3.75);
});
it('never multiplies chain extras by scatter or floor and resets the chain on each free spin',async()=>{
 const floor={columns:6,collections:99,levels:Object.fromEntries(Array.from({length:30},(_,i)=>[`${Math.floor(i/6)}-${i%6}`,2]))};
 for(const multiplier of [2,3,5]){
  const r=createSalamanderRound({seed:187,bet:3,multiplier,inBonus:true,boardState:floor});
  expect(r.chainCount).toBe(15);expect(r.chainBonus).toBe(9);
  expect(r.amountWon).toBe(15*.05*3*3*multiplier+9);
  expect(r.events[0].chainCount).toBe(0);expect(r.events[0].chainBonus).toBe(0);
  const sql=(await db.query('select gazalbide_internal.le_gazal_salamanders(187,3,$1,true,$2) r',[multiplier,JSON.stringify(floor)])).rows[0].r;
  expect(sql).toEqual(r);
 }
 const first=createSalamanderRound({seed:14,inBonus:true});
 const next=createSalamanderRound({seed:14,inBonus:true,boardState:first.nextBoard});
 expect(next.events[0].chainCount).toBe(0);expect(next.events[0].chainBonus).toBe(0);
 for(const [forcedOutcome,spins,mult] of [['scatter',10,2],['scatter4',15,3],['scatter5',20,5]]){
  const r=createSalamanderRound({forcedOutcome,inBonus:true,multiplier:5});
  expect(r.freeSpinsAwarded).toBe(spins);expect(r.awardedMultiplier).toBe(mult);
 }
});
it('adds retrigger spins, retains the higher multiplier and pays the resolved total once',async()=>{
 // Controlled resolver result at the RPC boundary, rolled back with the session changes.
 const grid=createSalamanderRound({seed:14}).grid.map(row=>[...row]);
 grid[2][1]='SHIELD';grid[2][2]='SHIELD';grid[2][3]='SHIELD';
 const round=resolveSalamanderRound({grid,refills:Array.from({length:5},()=>Array(6).fill(null)),bet:3,multiplier:5,inBonus:true});
 expect(round.freeSpinsAwarded).toBe(10);
 await db.exec('begin');
 try{
  await db.exec(`select set_config('test.uid','00000000-0000-0000-0000-000000000001',true);
   update le_gazal_sessions set status='active',balance=100,free_spins_remaining=2,free_spin_bet=3,bonus_multiplier=5;
   create or replace function gazalbide_internal.le_gazal_salamanders(p_seed integer,p_bet integer,p_multiplier numeric,p_bonus boolean,p_board jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$select '${JSON.stringify(round)}'::jsonb$$;`);
  const id=(await db.query('select id from le_gazal_sessions')).rows[0].id;
  const r=(await db.query('select le_gazal_spin($1,10) r',[id])).rows[0].r;
  expect(r.free_spins_remaining).toBe(11);expect(r.bonus_multiplier).toBe(5);
  expect(r.bet).toBe(3);expect(r.bet_spent).toBe(0);
  expect(r.payout).toBe(round.amountWon);expect(r.balance).toBe(100+round.amountWon);
 }finally{await db.exec('rollback');}
});

it('uses four distinct seeded random cells on every board size and never overlaps actors in any frame',()=>{
 const seen=new Set();
 for(const columns of [6,7,8])for(let seed=1;seed<=150;seed++){
  const r=createSalamanderRound({seed,inBonus:true,boardState:{columns,collections:0,levels:{}}});
  seen.add(JSON.stringify(r.starts));
  for(const frame of [{positions:r.starts,grid:r.grid},...r.events]){
   const ps=Object.values(frame.positions);
   expect(new Set(ps.map(p=>`${p.row}-${p.col}`)).size).toBe(4);
   for(const p of ps){expect(p.row).toBeGreaterThanOrEqual(0);expect(p.row).toBeLessThan(5);expect(p.col).toBeGreaterThanOrEqual(0);expect(p.col).toBeLessThan(columns);expect(frame.grid[p.row][p.col]).toBeNull();}
  }
 }
 expect(seen.size).toBeGreaterThan(400);
});
it('chooses three visible pickups below over one valuable pickup above and finishes the route before gravity',async()=>{
 const grid=Array.from({length:5},()=>Array(6).fill(null));
 grid[1][2]='BALL';grid[3][2]='BALL';grid[4][2]='BALL';grid[4][3]='BALL';
 const positions={yellow:{row:2,col:2},pink:{row:0,col:0},blue:{row:4,col:0},green:{row:4,col:5}};
 const levels={'1-2':2};
 expect(salamanderRoute(grid,positions,'yellow',levels).map(p=>[p.row,p.col])).toEqual([[3,2],[4,2],[4,3]]);
 const refills=Array.from({length:5},()=>Array(6).fill(null));
 const r=resolveSalamanderRound({grid,refills,positions,inBonus:true,boardState:{columns:6,collections:0,levels}});
 const firstFall=r.events.findIndex(e=>e.kind==='cascade');
 expect(r.events.slice(0,firstFall).filter(e=>e.kind==='collect').map(e=>[e.row,e.col])).toEqual([[3,2],[4,2],[4,3]]);
 expect(r.events[firstFall].columns).toEqual([2,3]);
 const sql=(await db.query('select gazalbide_internal.le_gazal_resolve_salamanders($1,$2,1,1,true,$3,$4) r',[grid,refills,JSON.stringify({columns:6,collections:0,levels}),JSON.stringify(positions)])).rows[0].r;
 expect(sql).toEqual(r);
});
it('lets icons fall through a salamander in the middle of a column without occupying its cell',()=>{
 const grid=Array.from({length:5},()=>Array(6).fill(null));grid[0][1]='BALL';grid[1][1]='WHISTLE';
 const positions={yellow:{row:0,col:0},pink:{row:0,col:5},blue:{row:2,col:1},green:{row:4,col:5}};
 const refills=Array.from({length:5},()=>Array(6).fill('HOOP'));refills[0][1]='SHOE';
 const used=Array(6).fill(0);settleSalamanderColumns(grid,positions,[1],refills,used);
 expect(grid.map(row=>row[1])).toEqual(['HOOP','SHOE',null,'BALL','WHISTLE']);expect(used[1]).toBe(2);
});
it('rejects duplicate starting cells in both engines and bounds dense-board route searches deterministically',async()=>{
 const grid=Array.from({length:5},()=>Array(8).fill('BALL'));
 const positions={yellow:{row:2,col:2},pink:{row:0,col:0},blue:{row:4,col:0},green:{row:4,col:7}};
 const bad={...positions,pink:positions.yellow};
 expect(()=>resolveSalamanderRound({grid,refills:[],positions:bad})).toThrow('Invalid salamander positions');
 await expect(db.query('select gazalbide_internal.le_gazal_resolve_salamanders($1,$2,1,1,false,null,$3)',[grid,grid,JSON.stringify(bad)])).rejects.toThrow('Invalid salamander positions');
 const expected=salamanderRoute(grid,positions,'yellow');
 const sql=(await db.query("select gazalbide_internal.le_gazal_salamander_route($1,$2,'yellow','{}') r",[grid,JSON.stringify(positions)])).rows[0].r;
 expect(sql).toEqual(expected);expect(expected.length).toBeGreaterThan(20);
 expect(new Set(expected.map(p=>`${p.row}-${p.col}`)).size).toBe(expected.length);
});
