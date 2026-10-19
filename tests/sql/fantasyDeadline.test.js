// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import fs from 'node:fs';
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function public.is_gazal_admin() returns boolean language sql as 'select false';
    create table gameweeks(id bigint primary key,season_id text,base_budget integer,deadline timestamptz,status text);
    create table fantasy_teams(id uuid primary key,season_id text);
    create table fantasy_lineups(id uuid primary key,fantasy_team_id uuid,gameweek_id bigint,players text[],captain_number smallint,coach_code text);
    create table fantasy_gameweek_economy(fantasy_team_id uuid,gameweek_id bigint,base_budget integer,carry_in integer,
      available_budget integer generated always as (base_budget+carry_in) stored,lineup_cost integer,valid_lineup boolean,
      savings_generated integer,carry_out integer,finalized_at timestamptz,updated_at timestamptz,locked_at timestamptz,savings_choice text,
      primary key(fantasy_team_id,gameweek_id));
    create table fantasy_season_settings(season_id text,max_carry integer);
    create table season_players(season_id text,player_id integer,active boolean,jersey_number text);
    create table fantasy_gameweek_prices(gameweek_id bigint,player_id integer,price integer);
    create table season_staff(season_id text,staff_id integer,active boolean,fantasy_enabled boolean);
    create table staff_members(id integer,code text);
    create table fantasy_economy_ledger(fantasy_team_id uuid,gameweek_id bigint,entry_type text,event_key text,amount integer,metadata jsonb,created_by uuid,
      unique(fantasy_team_id,gameweek_id,event_key));`);
  const sql = fs.readFileSync('supabase/migrations/20261019133125_fantasy_deadline_autoclose.sql','utf8');
  await db.exec(sql.slice(0,sql.indexOf('-- Only deadlines from installation')));
},30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`truncate gameweeks,fantasy_teams,fantasy_lineups,fantasy_gameweek_economy,fantasy_season_settings,
    season_players,fantasy_gameweek_prices,season_staff,staff_members,fantasy_economy_ledger;
    insert into gameweeks values(1,'s',80,now()-interval '1 minute','scheduled');
    insert into fantasy_teams values('00000000-0000-0000-0000-000000000001','s');
    insert into fantasy_lineups values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',1,array['1','2','3','4','5'],1,'david');
    insert into fantasy_gameweek_economy(fantasy_team_id,gameweek_id,base_budget,carry_in) select id,1,80,0 from fantasy_teams;
    insert into season_players select 's',n,true,n::text from generate_series(1,5) n;
    insert into fantasy_gameweek_prices select 1,n,10 from generate_series(1,5) n;
    insert into staff_members values(1,'david'); insert into season_staff values('s',1,true,true);
    insert into fantasy_season_settings values('s',20);`);
});
async function run() { return (await db.query("select gazalbide_internal.auto_close_fantasy_lineups(now()-interval '1 day') n")).rows[0].n; }
async function economy() { return (await db.query('select * from fantasy_gameweek_economy')).rows[0]; }
it('closes a valid saved lineup without a connected user and saves the capped surplus exactly once',async()=>{
  expect(await run()).toBe(1);
  expect(await economy()).toMatchObject({valid_lineup:true,lineup_cost:50,savings_generated:30,carry_out:20,savings_choice:'save'});
  expect((await economy()).locked_at).toBeTruthy();
  expect(await run()).toBe(0);
  expect((await db.query("select amount from fantasy_economy_ledger where event_key='savings'")).rows).toEqual([{amount:20}]);
});
it.each([
  "update fantasy_lineups set coach_code=null",
  "update fantasy_lineups set captain_number=6",
  "update fantasy_lineups set players=array['1','1','2','3','4']",
  "update fantasy_lineups set players=array['1','2','3','4','5','999']",
  "update fantasy_gameweek_prices set price=20",
  "delete from fantasy_gameweek_prices where player_id=5"
])('does not score or generate savings for invalid saved lineups: %s',async(sql)=>{
  await db.exec(sql); await run();
  expect(await economy()).toMatchObject({valid_lineup:false,carry_out:0,savings_generated:0,locked_at:null,savings_choice:null});
});
it('preserves early closes, Le Gazal allocations and prizes',async()=>{
  await db.exec("update fantasy_gameweek_economy set finalized_at=now(),locked_at=now(),valid_lineup=true,carry_out=27,savings_choice='play'");
  expect(await run()).toBe(0);
  expect(await economy()).toMatchObject({carry_out:27,savings_choice:'play'});
});
it('does not close future deadlines or rewrite deadlines predating activation',async()=>{
  await db.exec("update gameweeks set deadline=now()+interval '1 minute'"); expect(await run()).toBe(0);
  await db.exec("update gameweeks set deadline=now()-interval '2 days'"); expect(await run()).toBe(0);
});
it('keeps private scheduler inaccessible and the existing public finalizer admin-only',async()=>{
  expect((await db.query("select has_function_privilege('authenticated','gazalbide_internal.auto_close_fantasy_lineups(timestamptz)','execute') allowed")).rows[0].allowed).toBe(false);
  expect((await db.query("select has_function_privilege('anon','gazalbide_internal.finalize_fantasy_deadline(bigint)','execute') allowed")).rows[0].allowed).toBe(false);
  await expect(db.query('select public.finalize_fantasy_gameweek_economy_core(1)')).rejects.toThrow('Admin permissions required');
});
