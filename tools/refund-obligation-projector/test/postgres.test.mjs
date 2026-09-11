import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createAdapters } from "../lib/adapters.mjs";
import { parsePolicy } from "../lib/policy.mjs";
import {
  insertProjection,
  installSchema,
  postgresBinaries,
  startDisposableCluster,
} from "../lib/postgres.mjs";
import { projectDir } from "../lib/project.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bins = postgresBinaries();

test("local Postgres is required and stores unknown claims without paid_out", { timeout: 120_000 }, (t) => {
  if (!bins.available) {
    throw new Error("postgres binaries missing; Co07 Postgres gate is incomplete, not skipped");
  }
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());
  installSchema(cluster);

  const report = projectDir();
  assert.equal(report.ok, true);
  insertProjection(cluster, { ...report.projection, evidenceKind: "local_runtime" });

  const listed = cluster.psql(
    "SELECT operation_id, refund_claim, refund_claim_source, outcome_kind, paid_out FROM refund_obligation_projections ORDER BY operation_id;",
  );
  assert.match(listed, /agent402-external-validation-purchase-2026-08-29/);
  assert.match(listed, /unknown/);
  assert.match(listed, /no_policy/);
  assert.match(listed, /operational_error/);
  assert.doesNotMatch(listed, /8\.105/);
  assert.doesNotMatch(listed, /t\n/);

  const denied = spawnSync(
    bins.psql,
    [
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "UPDATE refund_obligation_projections SET paid_out = true;",
    ],
    { env: { ...process.env, ...cluster.env }, encoding: "utf8" },
  );
  assert.notEqual(denied.status, 0);
  assert.match(`${denied.stderr}${denied.stdout}`, /never_paid_out/);
});

test("local Postgres stores an explicit-policy not-offered row", { timeout: 120_000 }, (t) => {
  if (!bins.available) {
    throw new Error("postgres binaries missing; Co07 Postgres gate is incomplete, not skipped");
  }
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());
  installSchema(cluster);
  const adapters = createAdapters();
  const policy = parsePolicy(
    adapters.evidence.loadJson(join(here, "../fixtures/policy/agent402-not-offered.json")),
  );
  const report = projectDir(undefined, adapters, { policy });
  insertProjection(cluster, report.projection);
  const listed = cluster.psql(
    "SELECT refund_claim, policy_id FROM refund_obligation_projections WHERE operation_id = 'agent402-external-validation-purchase-2026-08-29';",
  );
  assert.match(listed, /not-offered/);
  assert.match(listed, /sdd-agent402-not-offered/);
});
