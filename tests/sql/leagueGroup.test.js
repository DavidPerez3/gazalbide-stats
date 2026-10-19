// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db;let html;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;
 create table matches(id text,season text,date date,opponent text,status text,is_friendly boolean default false,gazal_pts int,opp_pts int);`);
 const sql=await readFile('supabase/migrations/20261019071533_league_group_model.sql','utf8');
 // Network/cron deployment and existing sportsbook wrappers have separate dependencies.
 const core=sql.slice(0,sql.indexOf('-- Network requests'));
 const model=sql.slice(sql.indexOf('-- Ratings use'),sql.indexOf('alter table public.gazalbet_markets'));
 await db.exec(core+model);
 html=await readFile('tests/fixtures/basketaraba-group.html','utf8');
 await db.query('select gazalbide_internal.import_league_html($1,$2)',['2026-2027',html]);
},30000);
afterAll(async()=>db.close());
const model=async(opponent='Pozo I Moicar',date='2026-10-25')=>(await db.query('select league_match_model($1,$2,$3,true) model',[opponent,date,'2026-2027'])).rows[0].model;
it('imports all 42 fixtures and three results, excluding byes',async()=>{
 expect((await db.query('select count(*)::int n,count(home_score)::int played from league_fixtures')).rows[0]).toEqual({n:42,played:3});
 expect((await db.query("select count(*)::int n from league_fixtures where home_key='descansa' or away_key='descansa'")).rows[0].n).toBe(0);
});
it('matches punctuation aliases and the next home opponent',async()=>{
 expect((await model()).opponent_key).toBe('pozoimoicar');
 const p=(await db.query("select get_league_preview('POZO I. MOICAR','2026-10-25','2026-2027') p")).rows[0].p;
 expect(p.opponent).toBe('POZO I. MOICAR');expect(p.home).toBe(true);
});
it('uses other teams results and excludes future information',async()=>{
 const before=await model();expect(before.group_games).toBe(3);expect(before.rival.losses).toBe(1);
 expect((await model('Pozo I Moicar','2026-10-18')).group_games).toBe(0);
 await db.exec("update league_fixtures set home_score=80,away_score=40 where home_key='pozoimoicar' and round=1");
 const stronger=await model();expect(stronger.probability).toBeLessThan(before.probability);
 await db.query('select gazalbide_internal.import_league_html($1,$2)',['2026-2027',html]);
});
it('uses historical head to head but never friendlies or results after the match',async()=>{
 await db.exec(`insert into matches values('old','2025-2026','2025-11-09','Pozo I Moicar','published',false,70,45),('friendly','2026-2027','2026-10-11','POZO I. MOICAR','published',true,100,10),('future','2026-2027','2026-11-25','Pozo I Moicar','published',false,10,100);`);
 const p=await model();expect(p.h2h_count).toBe(1);expect(p.h2h[0].id).toBe('old');expect(p.h2h_weight).toBeLessThanOrEqual(.2);
});
it('rejects a wrong group or incomplete page without destroying the cached results',async()=>{
 await expect(db.query('select gazalbide_internal.import_league_html($1,$2)',['2026-2027',html.replace('GRUPO: 1001','GRUPO: 9999')])).rejects.toThrow(/group/);
 await expect(db.query('select gazalbide_internal.import_league_html($1,$2)',['2026-2027','GRUPO: 1001 GAZALBIDE A'])).rejects.toThrow(/Incomplete/);
 expect((await db.query('select count(*)::int n from league_fixtures')).rows[0].n).toBe(42);
});
it('keeps synchronization writes inaccessible to public users',async()=>{
 expect((await db.query("select has_function_privilege('anon','gazalbide_internal.import_league_html(text,text)','execute') allowed")).rows[0].allowed).toBe(false);
});
