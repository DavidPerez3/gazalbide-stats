import { describe, it, expect } from "vitest";
import { validateLineup, getTeamFoulsForPeriod, isTeamInPenalty } from "./rules";
describe("Live lineup and overtime regression", () => {
  it("rejects duplicate, unselected and six-player lineups", () => {
    expect(validateLineup([1, 1], [1]).ok).toBe(false);
    expect(validateLineup([2], [1]).ok).toBe(false);
    expect(validateLineup([1, 2, 3, 4, 5, 6]).ok).toBe(false);
    expect(validateLineup([1, 2], [1, 2, 3]).ok).toBe(true);
  });
  it("carries Q4 fouls through successive overtimes without including Q3", () => {
    const fouls = { 3: { gazalbide: 5 }, 4: { gazalbide: 3, opponent: 1 }, 5: { gazalbide: 1, opponent: 2 }, 6: { gazalbide: 2, opponent: 1 } };
    expect(isTeamInPenalty(fouls, 4)).toBe(false);
    expect(isTeamInPenalty(fouls, 5)).toBe(true);
    expect(getTeamFoulsForPeriod(fouls, 6)).toEqual({ gazalbide: 6, opponent: 4 });
    expect(fouls[4].gazalbide).toBe(3);
  });
});
