import { foundryConnectionMath, readFoundryPools } from "./envelope.mjs";
import { loadPins } from "./plan.mjs";
import { countsByStatus, failedCounts, measurementLimits } from "./status.mjs";

function byOfferedClients(report) {
  const grouped = {};
  for (const offered of report.workloadPlan.offeredClients) {
    grouped[String(offered)] = {};
    for (const cell of report.cells.filter((item) => item.offeredClients === offered)) {
      grouped[String(offered)][cell.axis] = cell.status;
    }
  }
  return grouped;
}

export function buildIntake(report) {
  if (report.silentReduction !== false) throw new Error("silent workload reduction is refused");
  if (report.traffic !== "synthetic") throw new Error("intake traffic must be synthetic");
  if (report.hostingerMeasured !== false) throw new Error("this intake is not a Hostinger measurement");
  for (const cell of report.cells ?? []) {
    if (cell.status === "qualified" && (cell.acquiredClients !== cell.offeredClients || cell.actualUnits !== cell.offeredUnits)) {
      throw new Error(`refusing qualified cell ${cell.id} that does not match the offer`);
    }
  }
  const pins = loadPins();
  const limits = measurementLimits(report);
  const admissibleOfferedClients = countsByStatus(report, "qualified");
  const limitedOfferedClients = report.workloadPlan.offeredClients.filter((offered) => {
    const cells = report.cells.filter((cell) => cell.offeredClients === offered);
    return cells.some((cell) => cell.status === "limited") && cells.every((cell) => cell.status !== "failed");
  });
  const failedOfferedClients = failedCounts(report);
  const recommendations = [
    `Measured concurrency peak ${limits.maxAcquiredOnConcurrencyAxis}. max_connections ${limits.observedMaxConnections}, superuser_reserved_connections ${limits.observedSuperuserReservedConnections}, owner sessions held during fanout ${limits.ownerSessionDuringFanout}, predicted non-superuser ceiling while that owner session is open ${limits.predictedWhileOwnerHeld}.`,
  ];
  if (limits.cappedAcquiredMin !== null && limits.cappedAcquiredMin !== limits.cappedAcquiredMax) {
    recommendations.push(`Simultaneous connect storms acquired ${limits.cappedAcquiredMin} to ${limits.cappedAcquiredMax} sessions once remaining slots were reserved for superusers. Requested sizes were kept.`);
  }
  if (admissibleOfferedClients.length) {
    recommendations.push(`Offered counts qualified on every axis: ${admissibleOfferedClients.join(", ")}.`);
  }
  if (limitedOfferedClients.length) {
    recommendations.push(`Offered counts recorded as limited, with requested and actual sizes both retained: ${limitedOfferedClients.join(", ")}.`);
  }
  if (failedOfferedClients.length) {
    recommendations.push(`Offered counts failed qualification: ${failedOfferedClients.join(", ")}.`);
  }
  recommendations.push("Synthetic clients only. Intake for the existing SDS254 receiving owner. No branch edit and no database plan change.");
  return {
    schema: "sds.vf17.host-qualification.sds254-intake.v1",
    jobId: pins.jobId,
    attemptOf: pins.attemptOf,
    operationId: pins.operationId,
    measuredAt: report.measuredAt,
    receivingOwner: {
      role: "SDS254",
      pin: pins.sds254,
      repository: "epistemedeus/samedaydesk",
      intakeOnly: true,
      branchEdits: false,
    },
    neoReceiver: pins.neoReceiver,
    vf11: {
      export: pins.vf11Export,
      pattern: pins.vf11Pattern,
    },
    repoBase: pins.repoBase,
    measuredAtHead: report.gitHead ?? null,
    traffic: "synthetic",
    hostingerMeasured: false,
    silentReduction: false,
    workloadPlan: report.workloadPlan,
    budgets: report.budgets,
    cluster: {
      version: report.cluster.version,
      listen: report.cluster.listen,
      settings: report.cluster.settings,
      roles: report.cluster.roles,
    },
    citedFoundryEnvelope: foundryConnectionMath(readFoundryPools()),
    seededRejections: report.seededRejections.map((row) => ({
      label: row.label,
      rejected: row.rejected,
      sqlstate: row.sqlstate,
    })),
    limits,
    cells: report.cells,
    byOfferedClients: byOfferedClients(report),
    admissibleOfferedClients,
    limitedOfferedClients,
    failedOfferedClients,
    recommendations,
    recommendedNextOwner: "existing SDS254 receiving owner",
    artifacts: {
      report: "experiments/vf17-host-qualification/evidence/qualification.json",
      intake: "experiments/vf17-host-qualification/aggregate/sds254-owner-intake.json",
    },
  };
}
