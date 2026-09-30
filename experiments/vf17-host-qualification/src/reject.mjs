import { AXES, OFFERED_CLIENTS } from "./plan.mjs";

function seeded(message) {
  return Object.assign(new Error(`rejected seeded fixture: ${message}`), { code: "VF17_SEEDED_REJECT" });
}

function missed(message) {
  return Object.assign(new Error(message), { code: "VF17_SEED_MISSED" });
}

export function rejectSeed(fixture) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw missed("seeded fixture must be an object");
  }
  const reasons = [];
  if (fixture.databaseUrl || fixture.connectionString) reasons.push("external database URL");
  if (fixture.traffic && fixture.traffic !== "synthetic") reasons.push(`traffic ${fixture.traffic}`);
  if (fixture.silentReduction === true) reasons.push("silent workload reduction");
  if (Array.isArray(fixture.offeredClients)) {
    if (JSON.stringify(fixture.offeredClients) !== JSON.stringify(OFFERED_CLIENTS)) {
      reasons.push("offered client set is not 1, 8, 32, 128");
    }
  }
  if (Array.isArray(fixture.axes) && JSON.stringify(fixture.axes) !== JSON.stringify(AXES)) {
    reasons.push("axes are not concurrency, corpus, backlog");
  }
  if (fixture.workloadPlan && JSON.stringify(fixture.workloadPlan.offeredClients) !== JSON.stringify(OFFERED_CLIENTS)) {
    reasons.push("workload plan offered clients differ");
  }
  if (!reasons.length) throw missed("seeded fixture was not rejected");
  throw seeded(reasons.join("; "));
}
