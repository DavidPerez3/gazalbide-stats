// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import fs from 'node:fs';
import { createBonusRound, emptyBonusBoard, replaceLivingColumn, livingSpinFrame } from '../../src/features/le-gazal/bonusBoard.js';
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
  for (const name of ['20261021075446_le_gazal_patterns','20261021084943_le_gazal_living_board','20261021095220_le_gazal_bonus_upgrades'])
    await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
}, 30000);
afterAll(async () => db?.close());

it('matches complete server sequences across all scenarios, levels and expansion sizes', async () => {
  const scenarios = ['lose','small','medium','high','wild','scatter','scatter4','scatter5','bonus'];
  for (const columns of [6,7,8]) {
    const levels = {};
    for (let r=0;r<5;r++) for (let c=0;c<columns;c++) levels[`${r}-${c}`]=(r+c)%3;
    const board = { columns, collections:(columns-6)*6+5, levels };
    const rows = (await db.query(`select scenario,seed,gazalbide_internal.le_gazal_bonus_living(scenario,seed,3,1.5,$1) r
      from unnest($2::text[]) scenario cross join generate_series(0,63) seed`,[JSON.stringify(board),scenarios])).rows;
    for (const { scenario,seed,r } of rows) expect(r,`${columns}/${scenario}/${seed}`).toEqual(createBonusRound({scenario,seed,bet:3,multiplier:1.5,boardState:board}));
  }
}, 20000);
it('upgrades the floor, pays its prior level, unlocks both columns, and preserves progress on losses and retriggers', () => {
  let board = emptyBonusBoard();
  const prizes=[];
  for (let i=0;i<8;i++) {
    const round = createBonusRound({scenario:'high',seed:0,bet:1,multiplier:2,boardState:board});
    expect(board).not.toBe(round.nextBoard);
    expect(round.events.reduce((sum,e)=>sum+e.amount,0)).toBe(round.amountWon);
    let positions = round.starts;
    for (const e of round.events) {
      if(e.kind==='move') expect(Math.abs(positions[e.actor].row-e.row)+Math.abs(positions[e.actor].col-e.col)).toBe(1);
      positions=e.positions;
    }
    prizes.push(round.amountWon); board=round.nextBoard;
    expect(round.amountWon).toBeLessThanOrEqual(6*3*1*2);
    expect(Object.values(board.levels).every(n=>n<=2)).toBe(true);
  }
  expect(prizes[0]).toBe(8); expect(prizes[1]).toBe(16);
  expect(board.columns).toBe(8);
  const loss=createBonusRound({scenario:'lose',seed:0,boardState:board});
  expect(loss.amountWon).toBe(0); expect(loss.nextBoard).toEqual(board);
  const retrigger=createBonusRound({scenario:'scatter5',seed:2,boardState:board});
  expect(retrigger.nextBoard).toEqual(board);
  expect(retrigger.events.filter(e=>e.kind==='signal')).toHaveLength(5);
});
it('stages reel dimensions safely when expanding and resetting to a paid board', () => {
  const six=Array.from({length:5},()=>Array(6).fill('TEN'));
  const eight=Array.from({length:5},()=>Array(8).fill('BALL'));
  expect(replaceLivingColumn(six,eight,7)[0]).toHaveLength(8);
  expect(livingSpinFrame(eight,six,Array(6).fill(false),six)[0]).toHaveLength(6);
  expect(livingSpinFrame(six,eight,Array(8).fill(true),six)).toEqual(eight);
});
it('persists the authoritative board with wallet and ledger, resumes it, then resets after the final free spin', async () => {
  await db.exec(`insert into fantasy_teams values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001'); insert into gameweeks values(1);
    insert into le_gazal_sessions(fantasy_team_id,gameweek_id,starting_balance,balance,free_spins_remaining,free_spin_bet,bonus_multiplier,board_state)
    values('00000000-0000-0000-0000-000000000002',1,1000,1000,100,3,2,'{"columns":8,"collections":12,"levels":{"1-1":2,"2-1":2,"3-1":2,"1-6":2,"2-6":2,"3-6":2}}');
    select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);`);
  const id=(await db.query('select id from le_gazal_sessions')).rows[0].id;
  let previous=(await db.query('select * from le_gazal_sessions')).rows[0];
  for (let i=0;i<50;i++) {
    const r=(await db.query('select le_gazal_spin($1,10) r',[id])).rows[0].r;
    expect(r.bet).toBe(3); expect(r.bet_spent).toBe(0);
    expect(r.visual_result.initialBoard).toEqual(previous.board_state);
    expect(r.payout).toBe(r.visual_result.amountWon);
    expect(r.balance).toBe(previous.balance+r.payout);
    previous=(await db.query('select * from le_gazal_sessions where id=$1',[id])).rows[0];
    expect(previous.board_state).toEqual(r.board_state);
    const saved=(await db.query('select visual_result from le_gazal_spins where id=$1',[r.spin_id])).rows[0].visual_result;
    expect(saved).toEqual(r.visual_result); expect(saved.nextBoard).toEqual(r.board_state);
  }
  let last;
  // End a bonus regardless of random retriggers; no mutation of real player data.
  for (let i=0;i<10;i++) {
    await db.exec('update le_gazal_sessions set free_spins_remaining=1');
    last=(await db.query('select le_gazal_spin($1,1) r',[id])).rows[0].r;
    if(!last.free_spins_awarded) break;
  }
  expect(last.free_spins_remaining).toBe(0); expect(last.board_state).toBeNull();
  const paid=(await db.query('select le_gazal_spin($1,1) r',[id])).rows[0].r;
  expect(paid.visual_result.bonusBoard).toBeUndefined(); expect(paid.visual_result.grid[0]).toHaveLength(6);
  expect(paid.bet_spent).toBe(1);
  const ledger=(await db.query("select sum(amount)::integer amount from fantasy_economy_ledger")).rows[0].amount;
  expect(paid.balance).toBe(1000+ledger);
  await db.exec("update le_gazal_sessions set free_spins_remaining=5,board_state='{\"columns\":6,\"collections\":0,\"levels\":{}}'; update le_gazal_sessions set status='cashed_out'");
  expect((await db.query('select board_state from le_gazal_sessions')).rows[0].board_state).toBeNull();
  await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");
  await expect(db.query('select le_gazal_spin($1,1)',[id])).rejects.toThrow('session not found');
  expect((await db.query("select has_function_privilege('authenticated','gazalbide_internal.le_gazal_bonus_living(text,integer,integer,numeric,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);
});
