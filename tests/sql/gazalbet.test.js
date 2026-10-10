// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

// Real PostgreSQL functions and ticket constraints are loaded from the migrations.
// Minimal club/auth fixtures isolate settlement; this is not an RLS/concurrency audit.
const migrationDir = resolve("supabase/migrations");
const readMigration = (name) => readFileSync(resolve(migrationDir, name), "utf8");
function latestFunction(name) {
  const marker = `create or replace function public.${name}(`;
  const file = readdirSync(migrationDir).sort().reverse().find((f) => f.endsWith(".sql") && readMigration(f).includes(marker));
  if (!file) throw new Error(`Missing migration function: ${name}`);
  const source = readMigration(file);
  const start = source.indexOf(marker);
  return source.slice(start, source.indexOf("$$;", start) + 3);
}
const USER = "00000000-0000-0000-0000-000000000001";
let db;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    create schema auth;
    create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create table public.players(id bigint primary key, number text);
    create table public.matches(id uuid primary key, status text, gazal_pts int, opp_pts int);
    create table public.gameweeks(id bigint primary key, match_id uuid, status text, deadline timestamptz, season_id text);
    create table public.player_match_stats(match_id uuid, player_id bigint, min_seconds int, pts int, three_pm int, reb int, ast int, pf int, pir int);
    create table public.season_players(season_id text,player_id bigint,jersey_number text);
    create table public.player_statuses(gameweek_id bigint, player_number smallint, status text);
    create table public.test_notifications(event_key text primary key);
    create function public.notification_enqueue_user(uuid,text,text,text,text,text,text,jsonb,timestamptz)
      returns void language plpgsql as $$ begin insert into public.test_notifications values($3) on conflict do nothing; end; $$;
  `);
  const base = readMigration("20260929124500_gazalbet_automatic_sportsbook.sql");
  await db.exec(base.slice(0, base.indexOf("-- Idempotency marker")));
  const tickets = readMigration("20260930122500_gazalbet_builder_and_accumulators.sql");
  await db.exec(tickets.slice(0, tickets.indexOf("create index")));
  const gameLines = readMigration("20261001065321_gazalbet_open_bankroll_and_game_lines.sql");
  await db.exec(gameLines.slice(0, gameLines.indexOf("create or replace function")));
  await db.exec("alter table public.gazalbet_markets add column sample_size integer not null default 0");
  const unlimited = readMigration("20261008101215_gazalbet_unlimited_accumulator_legs.sql");
  await db.exec(unlimited.slice(0, unlimited.indexOf("create or replace function")));
  await db.exec(`create function auth.uid() returns uuid language sql as $$ select '${USER}'::uuid $$;
    create function public.gazalbet_prepare_wallet(bigint) returns jsonb language sql as $$ select '{}'::jsonb $$;`);
  const reversible=readMigration("20261010214844_gazalbet_reversible_player_availability.sql");
  await db.exec(reversible.slice(0,reversible.indexOf("create or replace function")));
  await db.exec("alter table gameweeks add column date date; alter table matches add column date date");
  await db.exec(latestFunction("gazalbet_player_availability"));
  await db.exec(latestFunction("gazalbet_void_unavailable_player_markets"));
  await db.exec(latestFunction("gazalbet_player_status_void_trigger"));
  await db.exec(`create trigger trg_test_availability after insert or update of status on public.player_statuses
    for each row execute function public.gazalbet_player_status_void_trigger();`);
  await db.exec(latestFunction("place_gazalbet_ticket"));
  await db.exec(latestFunction("gazalbet_player_metric"));
  await db.exec(latestFunction("settle_gazalbet_tickets"));
  await db.exec("create table gazalbet_wallet_settlements(bet_id uuid primary key)");
  await db.exec(latestFunction("settle_gazalbet_gameweek"));
  await db.exec(latestFunction("gazalbet_void_unavailable_ticket_legs"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate public.gazalbet_wallet_settlements,public.gazalbet_ticket_legs,public.gazalbet_ticket_settlements,public.gazalbet_tickets,public.gazalbet_bets,public.gazalbet_markets,public.gazalbet_credit_grants,public.gazalbet_wallets,public.gameweeks,public.matches,public.player_match_stats,public.players,public.season_players,public.player_statuses,public.test_notifications,auth.users cascade;
    insert into auth.users values('${USER}');
    insert into public.matches(id,status,gazal_pts,opp_pts) values('${USER}','published',80,70);
    insert into public.gameweeks(id,match_id,status,deadline) values(1,'${USER}','scheduled',now()+interval '1 day');
    insert into public.players values(1,'01'),(2,'2');
    insert into public.player_match_stats values('${USER}',1,600,12,2,4,3,1,-2);
    insert into public.gazalbet_wallets(user_id,balance) values('${USER}',90);
  `);
});
async function createTicket(legs, totalOdds = 4) {
  const { rows } = await db.query("insert into public.gazalbet_tickets(user_id,gameweek_id,ticket_type,stake,total_odds) values($1,1,$2,10,$3) returning id", [USER, legs.length > 1 ? "accumulator" : "single", totalOdds]);
  const id = rows[0].id;
  for (const [index, leg] of legs.entries()) {
    let marketId = null;
    if (!leg.leg_type || leg.leg_type === "market") {
      const result = await db.query("insert into public.gazalbet_markets(gameweek_id,code,kind,title,selections,status,winning_key) values(1,$1,'winner','Test','[{\"key\":\"gazalbide\"},{\"key\":\"opponent\"}]',$2,$3) returning id", [String(index), leg.outcome === "void" ? "void" : leg.outcome === "pending" ? "open" : "settled", leg.outcome === "lost" ? "opponent" : "gazalbide"]);
      marketId = result.rows[0].id;
    }
    await db.query("insert into public.gazalbet_ticket_legs(ticket_id,position,leg_type,market_id,selection_key,player_id,stat_key,direction,line,label,odds) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'Test',2)", [id, index + 1, leg.leg_type || "market", marketId, leg.selection_key || "gazalbide", leg.player_id || null, leg.stat_key || null, leg.direction || null, leg.line ?? null]);
  }
  return id;
}
const settle = () => db.query("select public.settle_gazalbet_tickets(1) as result");
async function state(id) {
  const ticket = (await db.query("select status,payout,total_odds from public.gazalbet_tickets where id=$1", [id])).rows[0];
  const wallet = (await db.query("select balance from public.gazalbet_wallets")).rows[0];
  return { status: ticket.status, payout: Number(ticket.payout), odds: Number(ticket.total_odds), balance: Number(wallet.balance) };
}
describe("GazalBet SQL settlement", () => {
  it.each([
    [["won"], "won", 20], [["lost"], "lost", 0], [["void"], "void", 10],
    [["won", "won"], "won", 40], [["won", "void"], "won", 20],
    [["void", "void"], "void", 10], [["won", "lost"], "lost", 0], [["void", "lost"], "lost", 0],
  ])("settles %j once as %s", async (outcomes, status, payout) => {
    const id = await createTicket(outcomes.map((outcome) => ({ outcome })));
    await settle();
    const first = await state(id);
    expect(first).toMatchObject({ status, payout, balance: 90 + payout });
    expect(first.odds).toBeGreaterThanOrEqual(1.01);
    await settle(); expect(await state(id)).toEqual(first);
  });
  it("does not settle unpublished matches or tickets with unresolved legs", async () => {
    const id = await createTicket([{ outcome: "won" }]);
    await db.query("update public.matches set status='live'");
    expect((await settle()).rows[0].result.settled).toBe(false);
    expect((await state(id)).status).toBe("pending");
    await db.query("update public.matches set status='published'");
    await db.query("update public.gazalbet_markets set status='open'");
    await settle(); expect((await state(id)).balance).toBe(90);
    expect((await state(id)).status).toBe("pending");
  });
  it.each([
    ["handicap", "gazalbide", null, -9.5, "won"], ["handicap", "opponent", null, 9.5, "lost"],
    ["total", null, "over", 149.5, "won"], ["total", null, "under", 149.5, "lost"],
  ])("settles game prop %s %s %s %s", async (stat_key, selection_key, direction, line, status) => {
    const id = await createTicket([{ leg_type: "game_prop", stat_key, selection_key, direction, line }]);
    await settle(); expect((await state(id)).status).toBe(status);
  });
  it("settles player points and negative PIR; voids a player without playing time", async () => {
    const id = await createTicket([
      { leg_type: "player_prop", player_id: 1, stat_key: "pts", direction: "over", line: 11.5 },
      { leg_type: "player_prop", player_id: 1, stat_key: "pir", direction: "under", line: -1.5 },
      { leg_type: "player_prop", player_id: 2, stat_key: "pts", direction: "over", line: .5 },
    ], 8);
    await settle(); expect(await state(id)).toMatchObject({ status: "won", payout: 40, odds: 4, balance: 130 });
    expect((await db.query("select status from public.gazalbet_ticket_legs where player_id=2")).rows[0].status).toBe("void");
  });
  it("voids a player with an official row but zero minutes", async () => {
    const id = await createTicket([{ leg_type: "player_prop", player_id: 1, stat_key: "pts", direction: "over", line: .5 }], 2);
    await db.query("update public.player_match_stats set min_seconds=0");
    await settle(); expect(await state(id)).toMatchObject({ status: "void", payout: 10, balance: 100 });
  });
  it("caps winning accumulator payout at odds 100", async () => {
    const id = await createTicket([{ outcome: "won" }, { outcome: "won" }, { outcome: "won" }, { outcome: "won" }], 100);
    await db.query("update public.gazalbet_ticket_legs set odds=10");
    await settle(); expect(await state(id)).toMatchObject({ status: "won", odds: 100, payout: 1000 });
  });
});
describe("GazalBet reversible availability", () => {
  const player = { leg_type: "player_prop", player_id: 1, stat_key: "pts", direction: "over", line: 11.5 };
  const sync = () => db.query("select public.gazalbet_void_unavailable_ticket_legs(1,null)");
  const legStates = async (id) => (await db.query("select status,availability_status,odds from gazalbet_ticket_legs where ticket_id=$1 order by position",[id])).rows;
  async function pregame() { await db.query("update matches set status='draft'"); }
  it("keeps two doubtful selections, restores one and pays using official participation", async () => {
    const id=await createTicket([player,{...player,player_id:2}],4);
    await pregame();
    await db.query("insert into player_statuses values(1,1,'doubtful'),(1,2,'doubtful')");
    expect((await legStates(id)).map(l=>l.availability_status)).toEqual(['doubtful','doubtful']);
    expect(await state(id)).toMatchObject({status:'pending',odds:4,balance:90,payout:0});
    await db.query("update player_statuses set status='available' where player_number=1");
    expect((await legStates(id)).map(l=>l.availability_status)).toEqual(['available','doubtful']);
    expect((await legStates(id)).map(l=>Number(l.odds))).toEqual([2,2]);
    // A late availability update remains reversible after purchases have closed.
    await db.query("update gameweeks set deadline=now()-interval '1 minute'");
    await db.query("update player_statuses set status='injured' where player_number=1");
    await db.query("update player_statuses set status='available' where player_number=1");
    await db.query("update matches set status='published'");
    await settle();
    expect(await state(id)).toMatchObject({status:'won',odds:2,payout:20,balance:110});
    expect((await legStates(id)).map(l=>l.status)).toEqual(['won','void']);
    await sync(); await settle(); expect((await state(id)).balance).toBe(110);
  });
  it("does not refund even an entirely injured ticket before official no-play confirmation", async () => {
    const id=await createTicket([player],2); await pregame();
    await db.query("insert into player_statuses values(1,1,'injured')");
    await sync(); expect(await state(id)).toMatchObject({status:'pending',odds:2,balance:90});
    await db.query("update player_match_stats set min_seconds=0");
    await db.query("update matches set status='published'"); await settle();
    expect(await state(id)).toMatchObject({status:'void',payout:10,balance:100});
    await db.query("update player_statuses set status='available'"); await settle();
    expect(await state(id)).toMatchObject({status:'void',balance:100});
  });
  it("official minutes count even if the provisional status was never corrected", async () => {
    const id=await createTicket([player],2); await pregame();
    await db.query("insert into player_statuses values(1,1,'injured')");
    await db.query("update matches set status='published'"); await settle();
    expect(await state(id)).toMatchObject({status:'won',payout:20});
  });
  it("uses the season jersey number for availability", async () => {
    const id=await createTicket([player],2); await pregame();
    await db.exec("update gameweeks set season_id='current'; insert into season_players values('current',1,'15')");
    await db.query("insert into player_statuses values(1,1,'injured'),(1,15,'available')");
    expect((await legStates(id))[0].availability_status).toBe('available');
  });
  it("suspends and restores markets without altering placed legs or reopening a manually closed market", async () => {
    await pregame();
    const id=await createTicket([{outcome:'pending'}],2);
    await db.query(`update gazalbet_markets set kind='player_points',selections='[{"key":"over","player_id":1},{"key":"under","player_id":1}]'`);
    await db.query("insert into player_statuses values(1,1,'doubtful')");
    const syncMarkets=()=>db.query("select gazalbet_void_unavailable_player_markets(1)");
    await syncMarkets();
    expect((await db.query('select status,availability_suspended from gazalbet_markets')).rows[0]).toEqual({status:'closed',availability_suspended:true});
    expect(await state(id)).toMatchObject({status:'pending',odds:2,balance:90});
    await db.query("update player_statuses set status='available'"); await syncMarkets();
    expect((await db.query('select status from gazalbet_markets')).rows[0].status).toBe('open');
    await db.query("update gazalbet_markets set status='closed'"); await syncMarkets();
    expect((await db.query('select status from gazalbet_markets')).rows[0].status).toBe('closed');
    await db.exec("update gazalbet_markets set status='open'; update player_statuses set status='doubtful'"); await syncMarkets();
    await db.exec("update gameweeks set deadline=now()-interval '1 minute'; update player_statuses set status='available'"); await syncMarkets();
    expect((await db.query('select status from gazalbet_markets')).rows[0].status).toBe('closed');
  });
  it("settles suspended quick markets from actual minutes, not provisional availability", async () => {
    const id=await createTicket([{outcome:'pending',selection_key:'over'}],2); await pregame();
    await db.query(`update gazalbet_markets set kind='player_points',line=11.5,selections='[{"key":"over","player_id":1},{"key":"under","player_id":1}]'`);
    await db.query("insert into player_statuses values(1,1,'injured')");
    await db.query("select gazalbet_void_unavailable_player_markets(1)");
    await db.query("update matches set status='published'");
    await db.query("select settle_gazalbet_gameweek(1)"); await settle();
    // The quick market uses over/under keys; actual 12 points wins 'over'.
    expect((await db.query('select status,winning_key from gazalbet_markets')).rows[0]).toEqual({status:'settled',winning_key:'over'});
    expect(await state(id)).toMatchObject({status:'won',payout:20,balance:110});
  });
  it("voids quick player markets with zero official minutes", async () => {
    const id=await createTicket([{outcome:'pending'}],2);
    await db.query(`update gazalbet_markets set kind='player_points',line=11.5,selections='[{"key":"over","player_id":1},{"key":"under","player_id":1}]';`);
    await db.query("update player_match_stats set min_seconds=0");
    await db.query("select settle_gazalbet_gameweek(1)"); await settle();
    expect(await state(id)).toMatchObject({status:'void',payout:10,balance:100});
  });
  it("preserves referenced markets and suspends newly generated unavailable markets", async () => {
    const id=await createTicket([{outcome:'pending'}],2); await pregame();
    await db.exec(`update gazalbet_markets set kind='player_points',selections='[{"key":"over","player_id":1},{"key":"under","player_id":1}]';
      insert into player_statuses values(1,2,'doubtful');
      create or replace function gazalbet_generate_markets_v1(bigint) returns jsonb language plpgsql as $$ begin
        insert into gazalbet_markets(gameweek_id,code,kind,title,selections,status)
        values($1,'generated','player_points','Generated','[{"key":"over","player_id":2},{"key":"under","player_id":2}]','open')
        on conflict do nothing; return '{}'::jsonb; end; $$;`);
    await db.exec(latestFunction('ensure_gazalbet_markets'));
    await db.query('select ensure_gazalbet_markets(1)');
    expect(Number((await db.query('select count(*) n from gazalbet_markets')).rows[0].n)).toBe(2);
    expect((await db.query("select status,availability_suspended from gazalbet_markets where code='generated'")).rows[0]).toEqual({status:'closed',availability_suspended:true});
    expect((await state(id)).status).toBe('pending');
  });
  it("runs the complete migration body against PostgreSQL", async () => {
    const source=readMigration('20261010214844_gazalbet_reversible_player_availability.sql');
    await db.exec(source.slice(source.indexOf('create or replace function')));
  });
  it("repairs old pregame prop voids only in pending uncredited tickets", async () => {
    const pending=await createTicket([player,{outcome:'pending'}],2);
    const credited=await createTicket([player],2); await pregame();
    await db.query("update gazalbet_ticket_legs set status='void',settled_at=now() where leg_type='player_prop'");
    await db.query("update gazalbet_tickets set status='void',payout=10,settled_at=now() where id=$1",[credited]);
    await db.query("insert into gazalbet_ticket_settlements(ticket_id) values($1)",[credited]);
    const source=readMigration('20261010214844_gazalbet_reversible_player_availability.sql');
    const start=source.indexOf('update public.gazalbet_ticket_legs l set status=');
    await db.exec(source.slice(start,source.indexOf('do $$ declare r record;',start)));
    expect(await state(pending)).toMatchObject({status:'pending',odds:4,balance:90});
    expect((await legStates(pending))[0].status).toBe('pending');
    expect((await legStates(credited))[0].status).toBe('void');
  });
});

it('accepts eight accumulator legs, retains the odds cap and charges once', async () => {
  const legs=[];
  for(let index=0;index<8;index++) {
    const market=(await db.query(`insert into public.gazalbet_markets(gameweek_id,code,kind,title,selections,status) values(1,$1,'winner','Test','[{"key":"gazalbide","label":"Gazalbide","odds":2},{"key":"opponent","label":"Rival","odds":2}]','open') returning id`, [`eight-${index}`])).rows[0];
    legs.push({type:'market',market_id:market.id,selection_key:'gazalbide'});
  }
  const result=(await db.query('select public.place_gazalbet_ticket(1,$1::jsonb,10) result',[JSON.stringify(legs)])).rows[0].result;
  expect(Number(result.odds)).toBe(100);
  expect(Number((await db.query('select balance from gazalbet_wallets')).rows[0].balance)).toBe(80);
  expect(Number((await db.query('select count(*) n from gazalbet_ticket_legs')).rows[0].n)).toBe(8);
  await expect(db.query('select public.place_gazalbet_ticket(1,$1::jsonb,10)',[JSON.stringify([...legs,legs[0]])])).rejects.toThrow(/Duplicate/);
  expect(Number((await db.query('select balance from gazalbet_wallets')).rows[0].balance)).toBe(80);
});
