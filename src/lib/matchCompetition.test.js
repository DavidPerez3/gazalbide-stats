import { expect, it } from "vitest";
import { filterMatchCompetition } from "./matchCompetition.js";

it("separates friendlies while preserving legacy league matches without a flag", () => {
  const matches = [{ id: "league", is_friendly: false }, { id: "friendly", is_friendly: true }, { id: "legacy" }];
  expect(filterMatchCompetition(matches).map(m => m.id)).toEqual(["league", "legacy"]);
  expect(filterMatchCompetition(matches, "friendly").map(m => m.id)).toEqual(["friendly"]);
  expect(filterMatchCompetition(matches, "all")).toEqual(matches);
});
