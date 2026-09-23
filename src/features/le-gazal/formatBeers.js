export function formatBeers(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? (Math.round((amount + Number.EPSILON) * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })
    : "0";
}
