import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GazalBetLive from "./GazalBetLive";
import GazalBetHistory from "./GazalBetHistory";
vi.mock("../../lib/gazalbet", () => ({ formatCredits: (v) => String(v), formatDeadline: (v) => v || "Sin fecha" }));
const week = { id: 1, name: "Jornada 1", opponent: "Rival", match_id: "m1" };
const ticket = { id: "t1", gameweek_id: 1, ticket_type: "single", stake: 10, total_odds: 2, payout: 0, status: "pending", placed_at: "2026-10-06", gazalbet_ticket_legs: [{ id: "l1", leg_type: "game_prop", stat_key: "total", direction: "over", line: 120.5, odds: 2, label: "Más de 120.5", status: "pending" }] };
describe("GazalBet Live and history views", () => {
  it("shows the review phase and accessible provisional tracking", () => {
    render(<GazalBetLive gameweeks={[week]} gameweek={week} onGameweekChange={vi.fn()} tickets={[ticket]} snapshot={{ phase: "review", score: { gazalbide: 80, opponent: 70 } }} />);
    expect(screen.getByText("PENDIENTE DE REVISIÓN")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Más de 120.5: Cumpliéndose/ })).toBeInTheDocument();
    expect(screen.getByText(/pendiente de liquidación/)).toBeInTheDocument();
  });
  it("shows settled leg outcomes without a live snapshot", () => {
    const won = { ...ticket, status: "won", payout: 20, gazalbet_ticket_legs: [{ ...ticket.gazalbet_ticket_legs[0], status: "won", result_value: 150 }] };
    render(<GazalBetLive gameweeks={[week]} gameweek={week} onGameweekChange={vi.fn()} tickets={[won]} snapshot={null} />);
    expect(screen.getByText("Resultado oficial: 150")).toBeInTheDocument();
    expect(screen.getAllByText("Ganada")).toHaveLength(2);
  });
  it("filters legacy and new history together and shows per-leg results", () => {
    const won = { ...ticket, id: "t2", status: "won", payout: 20, gazalbet_ticket_legs: [{ ...ticket.gazalbet_ticket_legs[0], status: "won", result_value: 150 }] };
    const legacy = { id: "old", gameweek_id: 1, selection_label: "Old void bet", status: "void", stake: 5, odds: 2, payout: 5, placed_at: "2026-10-05" };
    render(<GazalBetHistory tickets={[ticket, won]} bets={[legacy]} gameweeks={[week]} />);
    fireEvent.click(screen.getByRole("button", { name: "Liquidadas" }));
    expect(screen.getByText(/Ganada · cuota 2.00 · resultado 150/)).toBeInTheDocument();
    expect(screen.queryByText("Old void bet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anuladas" }));
    expect(screen.getByText("Old void bet")).toBeInTheDocument();
    expect(screen.queryByText("Más de 120.5")).not.toBeInTheDocument();
  });
});
