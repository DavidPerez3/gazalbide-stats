import { describe, it, expect } from "vitest";
import { trackLeg, selectTrackingGameweek, matchesHistoryFilter } from "./liveTracking";
const snapshot = { phase: "live", score: { gazalbide: 60, opponent: 55 }, players: [{ playerId: 1, stats: { pts: 10, pir: -3 } }, { playerId: 2, stats: { pts: 8 } }] };
const playerLeg = { leg_type: "player_prop", player_id: "1", stat_key: "pts", line: 10.5, direction: "over", status: "pending" };
describe("GazalBet live tracking", () => {
  it("tracks overs and unders on opposite sides of the threshold", () => {
    expect(trackLeg(playerLeg, snapshot).tone).toBe("behind");
    expect(trackLeg({ ...playerLeg, direction: "under" }, snapshot).tone).toBe("ahead");
    expect(trackLeg({ ...playerLeg, line: 9.5 }, snapshot).tone).toBe("ahead");
    expect(trackLeg({ ...playerLeg, direction: "under", line: 9.5 }, snapshot).tone).toBe("behind");
  });
  it("supports negative PIR and negative lines without NaN or inverted colors", () => {
    const result = trackLeg({ ...playerLeg, stat_key: "pir", line: -2.5, direction: "under" }, snapshot);
    expect(result.tone).toBe("ahead"); expect(result.progress).toBeGreaterThan(50);
  });
  it("waits for missing players and pregame instead of assuming zero", () => {
    expect(trackLeg({ ...playerLeg, player_id: 99 }, snapshot).tone).toBe("waiting");
    expect(trackLeg(playerLeg, { ...snapshot, phase: "pregame" }).tone).toBe("waiting");
  });
  it("honors settled statuses even with no live snapshot", () => {
    for (const status of ["won", "lost", "void"]) expect(trackLeg({ ...playerLeg, status }, null).tone).toBe(status);
  });
  it("evaluates the selected winner rather than always Gazalbide", () => {
    const leg = { leg_type: "market", gazalbet_markets: { kind: "winner" }, selection_key: "opponent" };
    expect(trackLeg(leg, snapshot).tone).toBe("behind");
    expect(trackLeg({ ...leg, selection_key: "gazalbide" }, snapshot).tone).toBe("ahead");
    expect(trackLeg(leg, { ...snapshot, score: { gazalbide: 55, opponent: 55 } }).tone).toBe("neutral");
  });
  it("uses the selected team's custom handicap and reverses legacy market handicap", () => {
    const custom = { leg_type: "game_prop", stat_key: "handicap", selection_key: "opponent", line: 5.5 };
    expect(trackLeg(custom, snapshot).tone).toBe("ahead");
    expect(trackLeg({ ...custom, line: 4.5 }, snapshot).tone).toBe("behind");
    expect(trackLeg({ leg_type: "market", gazalbet_markets: { kind: "handicap", line: -5.5 }, selection_key: "opponent" }, snapshot).tone).toBe("ahead");
  });
  it("tracks total points and uses a neutral threshold on equality", () => {
    const leg = { leg_type: "game_prop", stat_key: "total", direction: "under", line: 115.5 };
    expect(trackLeg(leg, snapshot).tone).toBe("ahead");
    expect(trackLeg({ ...leg, line: 115 }, snapshot).tone).toBe("neutral");
    expect(trackLeg({ ...leg, line: 114.5 }, snapshot).tone).toBe("behind");
  });
  it("supports old market totals and player points", () => {
    expect(trackLeg({ leg_type: "market", gazalbet_markets: { kind: "total", line: 114.5 }, selection_key: "over" }, snapshot).tone).toBe("ahead");
    expect(trackLeg({ leg_type: "market", gazalbet_markets: { kind: "player_points", line: 9.5, selections: [{ player_id: 1 }] }, selection_key: "over" }, snapshot).tone).toBe("ahead");
  });
  it("compares top scorers and head-to-head with ties remaining provisional", () => {
    for (const kind of ["top_scorer", "head_to_head"]) {
      const leg = { leg_type: "market", selection_key: "2", gazalbet_markets: { kind, selections: [{ key: "1" }, { key: "2" }] } };
      expect(trackLeg(leg, snapshot).tone).toBe("behind");
      expect(trackLeg({ ...leg, selection_key: "1" }, snapshot).tone).toBe("ahead");
    }
  });
  it("never settles a pending leg from a provisional or official snapshot", () => {
    const result = trackLeg({ ...playerLeg, line: 9.5 }, { ...snapshot, phase: "official" });
    expect(result.tone).toBe("ahead"); expect(result.caption).toContain("pendiente de liquidación");
  });
  it("bounds progress and waits on unsupported markets", () => {
    expect(trackLeg({ ...playerLeg, line: .5 }, snapshot).progress).toBe(100);
    expect(trackLeg({ leg_type: "market" }, snapshot).tone).toBe("waiting");
  });
});
describe("tracking gameweek and history", () => {
  it("keeps the current pending match visible when the next betting round opens", () => {
    const weeks = [{ id: 1, match_id: "match1", deadline: "2026-10-01" }, { id: 2, match_id: "match2", deadline: "2026-10-10" }];
    expect(selectTrackingGameweek(weeks, [{ gameweek_id: "1", status: "pending" }], weeks[1], Date.parse("2026-10-06")).id).toBe(1);
  });
  it("uses the current round when no pending linked match exists", () => {
    expect(selectTrackingGameweek([], [], { id: 2 }).id).toBe(2);
  });
  it("separates settled tickets from void and pending ones", () => {
    expect(matchesHistoryFilter("won", "settled")).toBe(true);
    expect(matchesHistoryFilter("lost", "settled")).toBe(true);
    expect(matchesHistoryFilter("void", "settled")).toBe(false);
    expect(matchesHistoryFilter("pending", "pending")).toBe(true);
  });
});
