export function fantasyPlayerStatus(entry) {
  const raw = String(entry?.status ?? "");
  const status = raw.trim().toLowerCase();
  const note = entry?.note || "";
  if (!status || status === "available" || status === "disponible") {
    return { statusColor: "available", statusLabel: "Disponible", statusNote: "" };
  }
  if (status === "doubtful" || status === "dudoso") {
    return { statusColor: "doubtful", statusLabel: note ? `Dudoso · ${note}` : "Dudoso", statusNote: note };
  }
  return {
    statusColor: "custom-red",
    statusLabel: note || (status === "injured" ? "No disponible" : raw),
    statusNote: note,
  };
}
