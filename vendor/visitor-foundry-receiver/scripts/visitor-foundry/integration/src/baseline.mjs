// Frozen no-network owner QA comparator. Deliberately major-only old behavior.
// This is a measured limited fixture, not a fabricated historical package API.
export function majorOnly(input) {
  const major=Number(input.range.match(/\d+/)?.[0]);
  return {status:Number(input.nodeVersion.split('.')[0])>=major?'compatible':'incompatible'};
}
