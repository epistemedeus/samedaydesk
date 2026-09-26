#!/usr/bin/env node
// SDS worker pass that claims one real reserved assignment and holds it.
// The wrapper must let this finish after SIGTERM. Killing the process leaves
// the attempt without termination evidence.
import { IntegrationStore } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/store.mjs";

const phase = process.argv[2];
const projectId = process.env.FOUNDRY_CLAIM_PROJECT;
const assignmentId = process.env.FOUNDRY_CLAIM_ASSIGNMENT;
const holdMs = Number(process.env.FOUNDRY_WORKER_HOLD_MS || "10000");
const supervisor = "supervisor:sds-claimed-pass";

if (phase === "recover") {
  process.stdout.write("recover-started\nrecover-done\n");
  process.exit(0);
}
if (phase !== "dispatch" || !projectId || !assignmentId) {
  console.error(JSON.stringify({ error: "claimed_pass_usage" }));
  process.exit(2);
}

const store = new IntegrationStore(process.env.CORRESPONDENCE_DATABASE_URL, {
  schema: process.env.CORRESPONDENCE_PG_SCHEMA,
  poolMax: 1,
});
try {
  const claimed = await store.claimAttempt(projectId, assignmentId, supervisor);
  if (claimed.notLaunched) {
    console.error(JSON.stringify({ error: "not_launched" }));
    process.exit(1);
  }
  await store.runnerWrite(projectId, assignmentId, supervisor, claimed.fence, {
    processIdentity: {
      pid: process.pid,
      supervisorPid: process.ppid,
      bootId: "sds-claimed-pass",
      startTicks: String(process.hrtime.bigint()),
    },
  });
  process.stdout.write("claimed\n");
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  await store.runnerWrite(projectId, assignmentId, supervisor, claimed.fence, {
    termination: {
      exited: true,
      code: 0,
      signal: null,
      witnessedBy: supervisor,
      observedAt: new Date().toISOString(),
    },
  });
  process.stdout.write("terminated\n");
} finally {
  await store.close();
}
