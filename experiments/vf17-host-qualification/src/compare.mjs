export function compareAggregates(baseline, current) {
  if (!baseline || !current || baseline.status !== "complete" || current.status !== "complete") {
    return {
      status: "incomplete-run",
      baseline: baseline?.status ?? null,
      current: current?.status ?? null,
    };
  }
  if (JSON.stringify(baseline.workloadPlan) !== JSON.stringify(current.workloadPlan)) {
    return { status: "incomparable-workload-plan" };
  }
  const missing = [];
  for (const cell of baseline.cells ?? []) {
    const found = (current.cells ?? []).some((item) => item.axis === cell.axis && item.offeredClients === cell.offeredClients);
    if (!found) missing.push(`${cell.axis}:${cell.offeredClients}`);
  }
  if ((baseline.cells ?? []).length === 0 || missing.length) {
    return { status: "incomplete-comparison", missing };
  }
  return { status: "comparable", cells: baseline.cells.length };
}
