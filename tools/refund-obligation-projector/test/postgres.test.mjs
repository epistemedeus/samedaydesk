import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  insertProjection,
  installSchema,
  postgresBinaries,
  startDisposableCluster,
} from "../lib/postgres.mjs";
import { projectDir } from "../lib/project.mjs";

const bins = postgresBinaries();

test("local Postgres stores the projection and refuses paid_out=true", { skip: !bins.available, timeout: 120_000 }, (t) => {
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());
  installSchema(cluster);

  const report = projectDir();
  assert.equal(report.ok, true);
  insertProjection(cluster, { ...report.projection, evidenceKind: "local_runtime" });

  const listed = cluster.psql(
    "SELECT operation_id, refund_claim, paid_out FROM refund_obligation_projections ORDER BY operation_id;",
  );
  assert.match(listed, /agent402-external-validation-purchase-2026-08-29/);
  assert.match(listed, /not-offered/);
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
