import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGazalBetTracking } from "./useGazalBetTracking";
import { loadLiveCenterSnapshot, subscribeLiveCenter } from "../../lib/liveCenter";
import { fetchGazalBetPortfolio } from "../../lib/gazalbet";
vi.mock("../../lib/liveCenter", () => ({ loadLiveCenterSnapshot: vi.fn(), subscribeLiveCenter: vi.fn() }));
vi.mock("../../lib/gazalbet", () => ({ fetchGazalBetPortfolio: vi.fn() }));
let unsubscribe, changed;
beforeEach(() => {
  unsubscribe = vi.fn();
  subscribeLiveCenter.mockImplementation((_id, callback) => { changed = callback; return unsubscribe; });
  loadLiveCenterSnapshot.mockResolvedValue({ score: { gazalbide: 12 }, phase: "live" });
  fetchGazalBetPortfolio.mockResolvedValue({ tickets: [] });
});
afterEach(() => vi.clearAllMocks());
describe("GazalBet tracking refresh", () => {
  it("refreshes portfolio on live changes and unsubscribes on unmount", async () => {
    const onPortfolio = vi.fn();
    const { result, unmount } = renderHook(() => useGazalBetTracking({ enabled: true, matchId: "m1", userId: "u1", onPortfolio }));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    await act(async () => { await changed(); });
    expect(onPortfolio).toHaveBeenCalledTimes(2);
    unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("preserves the last snapshot on transient failure while still refreshing tickets", async () => {
    const onPortfolio = vi.fn();
    const { result } = renderHook(() => useGazalBetTracking({ enabled: true, matchId: "m1", userId: "u1", onPortfolio }));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    loadLiveCenterSnapshot.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await changed(); });
    expect(result.current.snapshot.score.gazalbide).toBe(12);
    expect(result.current.error).toContain("Reintentando");
    expect(onPortfolio).toHaveBeenCalledTimes(2);
  });
  it("ignores stale requests when switching matches", async () => {
    let finishFirst;
    loadLiveCenterSnapshot.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }));
    const onPortfolio = vi.fn();
    const { result, rerender } = renderHook(({ matchId }) => useGazalBetTracking({ enabled: true, matchId, userId: "u1", onPortfolio }), { initialProps: { matchId: "m1" } });
    rerender({ matchId: "m2" });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    await act(async () => { finishFirst({ score: { gazalbide: 99 } }); });
    expect(result.current.snapshot.score.gazalbide).toBe(12);
    expect(onPortfolio).toHaveBeenCalledOnce();
  });
  it("coalesces realtime bursts without overlapping requests", async () => {
    let finish;
    loadLiveCenterSnapshot.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const onPortfolio = vi.fn();
    renderHook(() => useGazalBetTracking({ enabled: true, matchId: "m1", userId: "u1", onPortfolio }));
    await act(async () => { changed(); changed(); changed(); });
    expect(loadLiveCenterSnapshot).toHaveBeenCalledOnce();
    await act(async () => { finish({ score: {} }); });
    expect(loadLiveCenterSnapshot).toHaveBeenCalledTimes(2);
  });
  it("refreshes on connection recovery without requiring navigation", async () => {
    const onPortfolio = vi.fn();
    renderHook(() => useGazalBetTracking({ enabled: true, matchId: "m1", userId: "u1", onPortfolio }));
    await waitFor(() => expect(onPortfolio).toHaveBeenCalledOnce());
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(onPortfolio).toHaveBeenCalledTimes(2));
  });
  it("does not load or subscribe while tracking is disabled", () => {
    renderHook(() => useGazalBetTracking({ enabled: false, matchId: "m1", userId: "u1", onPortfolio: vi.fn() }));
    expect(loadLiveCenterSnapshot).not.toHaveBeenCalled();
    expect(subscribeLiveCenter).not.toHaveBeenCalled();
  });
  it("refreshes history without a linked live match", async () => {
    const onPortfolio = vi.fn();
    renderHook(() => useGazalBetTracking({ enabled: true, matchId: null, userId: "u1", onPortfolio }));
    await waitFor(() => expect(onPortfolio).toHaveBeenCalledOnce());
    expect(loadLiveCenterSnapshot).not.toHaveBeenCalled();
  });
});
