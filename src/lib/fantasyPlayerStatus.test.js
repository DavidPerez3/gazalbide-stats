import { describe, it, expect } from "vitest";
import { fantasyPlayerStatus } from "./fantasyPlayerStatus.js";

describe("Fantasy player availability", () => {
  it.each([undefined, { status: "available" }, { status: " AVAILABLE ", note: "old reason" }, { status: "Disponible" }])("renders available players in Spanish and green", (entry) => {
    expect(fantasyPlayerStatus(entry)).toEqual({ statusColor: "available", statusLabel: "Disponible", statusNote: "" });
  });
  it("preserves doubtful and unavailable reasons", () => {
    expect(fantasyPlayerStatus({ status: "doubtful", note: "Hombro" }).statusLabel).toBe("Dudoso · Hombro");
    expect(fantasyPlayerStatus({ status: "injured" }).statusLabel).toBe("No disponible");
    expect(fantasyPlayerStatus({ status: "Pádel" })).toMatchObject({ statusColor: "custom-red", statusLabel: "Pádel" });
  });
});
