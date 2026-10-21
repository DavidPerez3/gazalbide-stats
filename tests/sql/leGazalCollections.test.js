// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,expect,it } from 'vitest';
import fs from 'node:fs';
import { createCollectionRound,resolveCollectionRound,collectionTarget,COLLECTION_VALUES } from '../../src/features/le-gazal/collectionEngine.js';
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
  for (const name of ['20261021075446_le_gazal_patterns','20261021084943_le_gazal_living_board','20261021095220_le_gazal_bonus_upgrades','20261021101859_le_gazal_symbol_collections'])
    await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
}, 30000);
afterAll(async () => db?.close());

const floor={columns:7,collections:5,levels:{'1-0':2,'2-1':1,'2-5':2,'3-6':1}};
it('server and demo resolve the same generated symbols, targets, payouts, cascades and upgrades',async()=>{
 for(const inBonus of [false,true]) for(const columns of [6,7,8]) {
  const board={...floor,columns};
  const rows=(await db.query(`select seed,gazalbide_internal.le_gazal_collections(seed,3,1.5,$1,$2) r from generate_series(1,80) seed`,[inBonus,JSON.stringify(board)])).rows;
  for(const {seed,r} of rows)expect(r,`${inBonus}/${columns}/${seed}`).toEqual(createCollectionRound({seed,bet:3,multiplier:1.5,inBonus,boardState:board}));
 }
},20000);
it('every move has a reachable compatible symbol, pays its value and stops only when neither actor can collect',()=>{
 const symbols=new Set();
 for(let seed=0;seed<1500;seed++){
  const r=createCollectionRound({seed:seed*104729,bet:3,multiplier:2,inBonus:true,boardState:floor});
  let grid=r.grid,positions=r.starts,board=r.initialBoard;
  for(let i=0;i<r.events.length;i++){
   const e=r.events[i];
   expect(['scout','transform']).not.toContain(e.kind);
   if(e.kind==='move'){
    const target=collectionTarget(grid,positions,e.actor,board.levels);
    expect(target).toMatchObject({row:e.row,col:e.col,symbol:e.symbol});
    const collect=r.events[i+1];
    expect(collect.kind).toBe('collect');
    expect(collect.amount).toBe(3*2*COLLECTION_VALUES[e.actor][e.symbol]*(1+(board.levels[`${e.row}-${e.col}`]||0)));
    symbols.add(e.symbol);
   }
   if(e.kind==='expand') break; // Added space is used on the following spin.
   grid=e.grid;positions=e.positions;board=e.board;
  }
  expect(collectionTarget(grid,positions,'raccoon',board.levels)).toBeNull();
  expect(collectionTarget(grid,positions,'salamander',board.levels)).toBeNull();
  expect(r.events.reduce((s,e)=>s+e.amount,0)).toBe(r.amountWon);
  expect(r.grid.flat().every(s=>['BALL','HOOP','TROPHY','WHISTLE','SHIELD'].includes(s))).toBe(true);
 }
 expect([...symbols].sort()).toEqual(['BALL','HOOP','TROPHY','WHISTLE']);
});
it('has genuinely stationary losing boards; QA fixtures do not bypass symbol resolution',()=>{
 const round=createCollectionRound({forcedOutcome:'lose'});
 expect(round.amountWon).toBe(0);expect(round.events).toEqual([]);expect(round.finalGrid).toEqual(round.grid);
 const positions={raccoon:{row:2,col:0},salamander:{row:2,col:5}};
 const grid=round.grid.map(row=>[...row]);grid[1][0]='BALL';grid[2][1]='TROPHY';grid[3][0]='TROPHY';
 expect(collectionTarget(grid,positions,'raccoon')).toMatchObject({row:2,col:1}); // Higher base value; right wins tie with down.
 expect(collectionTarget(grid,positions,'raccoon',{'1-0':2})).toMatchObject({row:1,col:0}); // x3 floor outweighs trophy.
 const occupied={...positions,salamander:{row:2,col:1}};
 expect(collectionTarget(grid,occupied,'raccoon')).toMatchObject({row:3,col:0});
 const result=resolveCollectionRound({grid,refills:round.grid,bet:1});
 expect(result.events[0]).toMatchObject({kind:'move',row:2,col:1,symbol:'TROPHY'});
 expect(result.events[1].amount).toBe(2);
});
it('awards only shield bonuses and expansion never invents guaranteed collections',()=>{
 for(const [forcedOutcome,count,spins,multiplier] of [['scatter',3,10,2],['scatter4',4,15,3],['scatter5',5,20,5]]){
  const r=createCollectionRound({forcedOutcome});
  expect(r.grid.flat().filter(s=>s==='SHIELD')).toHaveLength(count);
  expect(r.freeSpinsAwarded).toBe(spins);expect(r.awardedMultiplier).toBe(multiplier);
  expect(r.amountWon).toBe(0);
 }
 const a=createCollectionRound({forcedOutcome:'small',inBonus:true,boardState:{columns:6,collections:5,levels:{}}});
 const b=createCollectionRound({forcedOutcome:'small',inBonus:true,boardState:{columns:7,collections:6,levels:{}}});
 expect(a.nextBoard.columns).toBe(7);expect(a.events.at(-1).kind).toBe('expand');
 expect(a.amountWon).toBe(1);expect(b.amountWon).toBe(1);
});
it('can pay actual pickups and activate a shield bonus on the same board in SQL',async()=>{
 const base=createCollectionRound({forcedOutcome:'scatter'});
 const grid=base.grid.map(row=>[...row]);grid[2][1]='TROPHY';
 const reserve=createCollectionRound({forcedOutcome:'lose'}).grid;
 const expected=resolveCollectionRound({grid,refills:reserve,bet:3});
 const array=value=>'{'+value.map(row=>'{'+row.join(',')+'}').join(',')+'}';
 const actual=(await db.query('select gazalbide_internal.le_gazal_resolve_collections($1::text[][],$2::text[][],3,1,false,null) r',[array(grid),array(reserve)])).rows[0].r;
 expect(actual).toEqual(expected);expect(actual.amountWon).toBe(6);expect(actual.freeSpinsAwarded).toBe(10);
});
it('persists v4 results and ledger atomically, honors existing free spins and isolates owners',async()=>{
 await db.exec(`insert into fantasy_teams values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');insert into gameweeks values(1);
 insert into le_gazal_sessions(fantasy_team_id,gameweek_id,starting_balance,balance,free_spins_remaining,free_spin_bet,bonus_multiplier,board_state)
 values('00000000-0000-0000-0000-000000000002',1,1000,1000,100,3,3,'{"columns":7,"collections":6,"levels":{}}');
 select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);`);
 const id=(await db.query('select id from le_gazal_sessions')).rows[0].id;
 let before=1000;
 for(let i=0;i<40;i++){
  const r=(await db.query('select le_gazal_spin($1,10) r',[id])).rows[0].r;
  expect(r.bet_spent).toBe(0);expect(r.bet).toBe(3);expect(r.round_multiplier).toBeGreaterThanOrEqual(3);
  expect(r.visual_result.patternVersion).toBe(4);expect(r.payout).toBe(r.visual_result.amountWon);
  expect(r.balance).toBe(before+r.payout);before=r.balance;
  expect((await db.query('select visual_result from le_gazal_spins where id=$1',[r.spin_id])).rows[0].visual_result).toEqual(r.visual_result);
  expect((await db.query('select board_state from le_gazal_sessions where id=$1',[id])).rows[0].board_state).toEqual(r.board_state);
 }
 await db.exec('update le_gazal_sessions set free_spins_remaining=0,free_spin_bet=null,bonus_multiplier=1');
 const paid=(await db.query('select le_gazal_spin($1,3) r',[id])).rows[0].r;
 expect(paid.bet_spent).toBe(3);expect(paid.visual_result.bonusBoard).toBe(false);
 expect(paid.visual_result.grid[0]).toHaveLength(6);
 before=paid.balance;
 const sum=(await db.query('select coalesce(sum(amount),0)::int amount from fantasy_economy_ledger')).rows[0].amount;
 expect(before).toBe(1000+sum);
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");
 await expect(db.query('select le_gazal_spin($1,3)',[id])).rejects.toThrow('session not found');
 expect((await db.query("select has_function_privilege('authenticated','gazalbide_internal.le_gazal_collections(integer,integer,numeric,boolean,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);
});
