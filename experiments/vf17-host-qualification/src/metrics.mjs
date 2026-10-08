// Same nearest-rank rule as the VF11 scale metrics helper.
export function quantile(values, q) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * q) - 1];
}
