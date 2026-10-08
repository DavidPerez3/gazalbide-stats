import { describe, it, expect } from "vitest";
import { computeLineupBreakdown } from "./fantasyScoring";
describe("Fantasy scoring regression", () => {
  const statsMap = new Map([[1, { name: "Player", pir: 10 }], [2, { name: "Other", pir: -2 }]]);
  const traitConfig = { playerTraitsByNumber: { "1": ["A"] }, coachTraitsByCode: { coach: ["A"] }, traits: { A: { multiplier: 1.5 } } };
  it("combines captain and configured coach synergy without multiplying other players", () => {
    const result = computeLineupBreakdown({ playersNums: [1, 2], statsMap, captainNumber: "1", coachCode: "coach", traitConfig });
    expect(result.totalPoints).toBe(28);
    expect(result.baseTotal).toBe(8);
    expect(result.bonusTotal).toBe(20);
  });
  it("treats missing statistics as zero", () => {
    expect(computeLineupBreakdown({ playersNums: [99], statsMap, traitConfig }).totalPoints).toBe(0);
  });
  it("returns an empty breakdown without a lineup", () => {
    expect(computeLineupBreakdown({ playersNums: [], statsMap }).players).toEqual([]);
  });
});
it('explains bonuses without changing totals, including negative captains', () => {
  const result = computeLineupBreakdown({ playersNums:[1], statsMap:new Map([[1,{pir:-10}]]), captainNumber:1, coachCode:'coach', traitConfig:{playerTraitsByNumber:{'1':['A']},coachTraitsByCode:{coach:['A']},traits:{A:{multiplier:1.5}}} });
  expect(result.totalPoints).toBe(-30); expect(result.captainBonus).toBe(-10); expect(result.synergyBonus).toBe(-10); expect(result.victoryBonus).toBe(0);
  expect(result.baseTotal+result.captainBonus+result.synergyBonus+result.victoryBonus).toBe(result.totalPoints);
});
