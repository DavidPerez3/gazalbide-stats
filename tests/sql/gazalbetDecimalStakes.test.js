// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import fs from 'node:fs';
let db;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create schema auth; create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
    create table gameweeks(id bigint primary key,deadline timestamptz);
    create table gazalbet_wallets(user_id uuid primary key,balance numeric(12,2),total_wagered numeric(12,2),updated_at timestamptz);
    create table gazalbet_markets(id uuid,gameweek_id bigint,status text,selections jsonb,line numeric,title text,sample_size integer);
    create table gazalbet_tickets(id uuid primary key default gen_random_uuid(),user_id uuid,gameweek_id bigint,ticket_type text,stake numeric(12,2) constraint gazalbet_tickets_stake_check check(stake>=1),total_odds numeric);
    create table gazalbet_ticket_legs(ticket_id uuid,position integer,leg_type text,market_id uuid,selection_key text,player_id bigint,stat_key text,direction text,line numeric,label text,odds numeric,sample_size integer);
    create function gazalbet_prepare_wallet(bigint) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function gazalbet_quote_player_line(bigint,bigint,text,text,numeric) returns jsonb language sql as $$select '{"player_id":11,"stat_key":"pts","direction":"over","line":5.5,"label":"Covela +5.5","odds":1.85,"sample_size":8}'::jsonb$$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261020112608_gazalbet_decimal_stakes.sql','utf8'));
  const singles=fs.readFileSync('supabase/migrations/20260930125000_gazalbet_atomic_singles.sql','utf8');
  await db.exec(singles.slice(0,singles.indexOf('revoke all')));
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec(`truncate gazalbet_ticket_legs,gazalbet_tickets,gazalbet_wallets,gameweeks;
    insert into gameweeks values(41,now()+interval '1 day');
    insert into gazalbet_wallets values(auth.uid(),71.20,100,now());`);
});
const legs=`'[{"type":"player_prop","player_id":11,"stat_key":"pts","direction":"over","line":5.5}]'::jsonb`;
it('stakes the exact full decimal balance and computes a rounded potential payout',async()=>{
  const r=(await db.query(`select place_gazalbet_ticket(41,${legs},71.20) result`)).rows[0].result;
  expect(r).toMatchObject({stake:71.2,potential_return:131.72});
  expect((await db.query('select balance,total_wagered from gazalbet_wallets')).rows[0]).toEqual({balance:'0.00',total_wagered:'171.20'});
});
it('accepts one cent and decimal singles without rounding away funds',async()=>{
  await db.query(`select place_gazalbet_singles(41,${legs},.01)`);
  expect((await db.query('select balance from gazalbet_wallets')).rows[0].balance).toBe('71.19');
});
it.each(['0','-.01','.001','1.001',"'NaN'::numeric","'Infinity'::numeric",'null'])('rejects invalid stake %s without changing the wallet',async stake=>{
  await expect(db.query(`select place_gazalbet_ticket(41,${legs},${stake})`)).rejects.toThrow('Stake must be at least');
  expect((await db.query('select balance from gazalbet_wallets')).rows[0].balance).toBe('71.20');
});
it('still rejects overspending and closed markets',async()=>{
  await expect(db.query(`select place_gazalbet_ticket(41,${legs},71.21)`)).rejects.toThrow('Insufficient balance');
  await db.exec("update gameweeks set deadline=now()-interval '1 minute'");
  await expect(db.query(`select place_gazalbet_ticket(41,${legs},1.20)`)).rejects.toThrow('Market closed');
});
