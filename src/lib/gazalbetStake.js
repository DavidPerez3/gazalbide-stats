// Keep editable text intact; validate and convert only when submitting.
export function parseGazalBetStake(raw) {
  const text = String(raw).trim();
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(text)) return null;
  const amount = Number(text.replace(",", "."));
  return Number.isFinite(amount) && amount >= .01 && amount <= 9999999999.99 ? amount : null;
}

export function totalGazalBetStake(amount, count = 1) {
  return amount == null ? 0 : Math.round(amount * 100) * count / 100;
}
