export function formatSummary(report) {
  const lines = [
    `status: ${report.status}`,
    `traffic: ${report.traffic}`,
    `silentReduction: ${report.silentReduction}`,
    `hostingerMeasured: ${report.hostingerMeasured}`,
  ];
  if (report.failureReason) lines.push(`failureReason: ${report.failureReason}`);
  const settings = report.cluster?.settings;
  if (settings) {
    lines.push(`cluster: max_connections=${settings.max_connections} superuser_reserved_connections=${settings.superuser_reserved_connections} listen=${settings.listen_addresses}`);
  }
  lines.push("axis\toffered\tacquired\trejected\tofferedUnits\tactualUnits\tstatus\tlimit\tp95Ms\tholders");
  for (const cell of report.cells ?? []) {
    lines.push([
      cell.axis,
      cell.offeredClients,
      cell.acquiredClients,
      cell.refusedClients,
      cell.offeredUnits,
      cell.actualUnits,
      cell.status,
      cell.limit ?? "-",
      cell.p95Ms ?? "-",
      cell.holderRows,
    ].join("\t"));
  }
  for (const seed of report.seededRejections ?? []) {
    lines.push(`seed\t${seed.label}\trejected=${seed.rejected}\tsqlstate=${seed.sqlstate}`);
  }
  return lines.join("\n");
}
