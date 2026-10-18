import { describe, expect, it, vi } from "vitest";
import { validateLiveReview } from "./liveReview.js";

vi.mock("./localSession.js", () => ({
  loadLiveEvents: vi.fn(),
  loadLiveRuntime: vi.fn(),
  loadLiveSetup: vi.fn(),
  saveLiveEvents: vi.fn(),
  saveLiveRuntime: vi.fn(),
}));

function review(events) {
  return validateLiveReview({
    setup: { matchId: "recovered-match" },
    state: {
      period: 4, clockMs: 0, clockRunning: false,
      score: { gazalbide: 2, opponent: 0 },
      onCourtIds: ["1", "2", "3", "4", "5"],
    },
    events,
    players: Array.from({ length: 5 }, (_, index) => ({
      id: String(index + 1), name: `Player ${index + 1}`, playedMs: 2_400_000,
      stats: {
        pts: index === 0 ? 2 : 0, two_pm: index === 0 ? 1 : 0,
        two_pa: index === 0 ? 1 : 0, fgm: index === 0 ? 1 : 0,
        fga: index === 0 ? 1 : 0, plus_minus: 2,
      },
    })),
    lineupSummary: [{ durationMs: 2_400_000 }],
  }).filter((issue) => issue.level === "error");
}

const action = { id: "shot", client_sequence: 250, server_sequence: 290000,
  period: 4, subject: "gazalbide", event_type: "TWO_MADE" };
const end = { id: "end", client_sequence: 251, period: 4,
  subject: "system", event_type: "PERIOD_END" };

describe("Live review after recovering a synced session", () => {
  it("accepts a local final marker after previously synced actions", () => {
    expect(review([action, end])).toEqual([]);
  });

  it("uses client order even when server insertion order differs", () => {
    expect(review([action, { ...end, server_sequence: 280000 }])).toEqual([]);
  });

  it.each([undefined, 300000])("still blocks a real action after the end (%s)", (serverSequence) => {
    const late = { ...action, id: "late", client_sequence: 252, server_sequence: serverSequence };
    expect(review([action, end, late]).map((issue) => issue.code)).toEqual(["events-after-final-end"]);
  });

  it("ignores voided late actions and superseded final markers", () => {
    expect(review([
      { ...end, id: "old-end", client_sequence: 249, server_sequence: 280000, is_void: true },
      action, end,
      { ...action, id: "void-late", client_sequence: 252, is_void: true },
    ])).toEqual([]);
  });
});
