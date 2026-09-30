const LIMIT_CODES = new Set(["53300", "EMFILE", "ENFILE"]);

export function classifyCell(cell) {
  const acquired = cell.acquiredClients;
  const offered = cell.offeredClients;
  const refused = cell.refusedClients;
  const unknown = cell.unknownClients;
  if (acquired + refused + unknown !== offered) return "failed";
  if (unknown > 0 || cell.badRows > 0 || cell.leftover > 0 || cell.accountingMismatch) return "failed";
  if (acquired === offered && cell.actualUnits === cell.offeredUnits && refused === 0) return "qualified";

  const codes = Object.keys(cell.errorCodes ?? {});
  const capOnly = refused > 0 && codes.length === 1 && LIMIT_CODES.has(codes[0]) && cell.errorCodes[codes[0]] === refused;
  if (!capOnly || acquired < 1 || acquired >= offered) return "failed";
  if (cell.actualUnits === cell.offeredUnits) return "limited";
  const per = cell.offeredUnits / offered;
  if (Number.isInteger(per) && cell.actualUnits === acquired * per) return "limited";
  return "failed";
}

export function measurementLimits(report) {
  const concurrency = (report.cells ?? []).filter((cell) => cell.axis === "concurrency");
  const maxAcquiredOnConcurrencyAxis = concurrency.reduce((max, cell) => Math.max(max, cell.acquiredClients), 0);
  const settings = report.cluster?.settings ?? {};
  const observedMaxConnections = Number(settings.max_connections);
  const observedSuperuserReservedConnections = Number(settings.superuser_reserved_connections);
  const ownerSessionDuringFanout = report.cluster?.ownerSessionDuringFanout ?? 0;
  const capped = (report.cells ?? []).filter((cell) => cell.limit === "max_connections");
  const cappedAcquired = capped.map((cell) => cell.acquiredClients);
  return {
    observedMaxConnections,
    observedSuperuserReservedConnections,
    ownerSessionDuringFanout,
    predictedNonSuperuserSlots: observedMaxConnections - observedSuperuserReservedConnections,
    predictedWhileOwnerHeld: observedMaxConnections - observedSuperuserReservedConnections - ownerSessionDuringFanout,
    maxAcquiredOnConcurrencyAxis,
    cappedAcquiredMin: cappedAcquired.length ? Math.min(...cappedAcquired) : null,
    cappedAcquiredMax: cappedAcquired.length ? Math.max(...cappedAcquired) : null,
    offeredCountsWithRefusals: (report.workloadPlan?.offeredClients ?? []).filter((count) =>
      (report.cells ?? []).some((cell) => cell.offeredClients === count && cell.refusedClients > 0),
    ),
  };
}

export function countsByStatus(report, status) {
  const counts = [];
  for (const offered of report.workloadPlan.offeredClients) {
    const cells = report.cells.filter((cell) => cell.offeredClients === offered);
    if (cells.length && cells.every((cell) => cell.status === status)) counts.push(offered);
  }
  return counts;
}

export function failedCounts(report) {
  const counts = [];
  for (const offered of report.workloadPlan.offeredClients) {
    const cells = report.cells.filter((cell) => cell.offeredClients === offered);
    if (cells.some((cell) => cell.status === "failed")) counts.push(offered);
  }
  return counts;
}
