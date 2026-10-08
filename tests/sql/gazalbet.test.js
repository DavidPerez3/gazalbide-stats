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
    create table public.gameweeks(id bigint primary key, match_id uuid, status text, deadline timestamptz);
    create table public.player_match_stats(match_id uuid, player_id bigint, min_seconds int, pts int, three_pm int, reb int, ast int, pf int, pir int);
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
    create function public.gazalbet_prepare_wallet(bigint) returns void language sql as $$ select $$;`);
  await db.exec(latestFunction("place_gazalbet_ticket"));
  await db.exec(latestFunction("gazalbet_player_metric"));
  await db.exec(latestFunction("settle_gazalbet_tickets"));
  await db.exec(latestFunction("gazalbet_void_unavailable_ticket_legs"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate public.gazalbet_ticket_legs,public.gazalbet_ticket_settlements,public.gazalbet_tickets,public.gazalbet_bets,public.gazalbet_markets,public.gazalbet_credit_grants,public.gazalbet_wallets,public.gameweeks,public.matches,public.player_match_stats,public.players,public.player_statuses,public.test_notifications,auth.users cascade;
    insert into auth.users values('${USER}');
    insert into public.matches values('${USER}','published',80,70);
    insert into public.gameweeks values(1,'${USER}','scheduled',now()+interval '1 day');
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
describe("GazalBet unavailable players", () => {
  const voidUnavailable = () => db.query("select public.gazalbet_void_unavailable_ticket_legs(1,null)");
  const player = { leg_type: "player_prop", player_id: 1, stat_key: "pts", direction: "over", line: 11.5 };
  it("refunds a fully void ticket once, including a later settlement call", async () => {
    const id = await createTicket([player], 2);
    await db.query("insert into public.player_statuses values(1,1,'unavailable')");
    await voidUnavailable(); expect(await state(id)).toMatchObject({ status: "void", payout: 10, balance: 100 });
    await voidUnavailable(); await settle();
    expect((await state(id)).balance).toBe(100);
    expect((await db.query("select count(*)::int as n from public.test_notifications")).rows[0].n).toBe(1);
  });
  it("removes only the unavailable leg and recalculates the remaining odds", async () => {
    const id = await createTicket([player, { outcome: "won" }]);
    await db.query("insert into public.player_statuses values(1,1,'unavailable')");
    await voidUnavailable(); expect(await state(id)).toMatchObject({ status: "pending", odds: 2, balance: 90 });
    await settle(); expect(await state(id)).toMatchObject({ status: "won", payout: 20, balance: 110 });
  });
  it("does not cancel player legs because of availability changes after deadline", async () => {
    const id = await createTicket([player]);
    await db.query("update public.gameweeks set deadline=now()-interval '1 minute'");
    await db.query("insert into public.player_statuses values(1,1,'unavailable')");
    await voidUnavailable(); expect((await state(id)).status).toBe("pending");
    expect((await db.query("select status from public.gazalbet_ticket_legs")).rows[0].status).toBe("pending");
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
