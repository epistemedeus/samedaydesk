import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  postgresAvailable,
  startDisposableCluster,
  selectRows,
} from "../lib/postgres.mjs";
import { runLabelledJob } from "../lib/run.mjs";

describe("real local Postgres ledger store", () => {
  test("disposable initdb cluster stores a labelled owner-qa row", async (t) => {
    assert.equal(
      postgresAvailable(),
      true,
      "postgresql initdb/pg_ctl required on this host; missing dependency is incomplete, not a skip",
    );

    const cluster = startDisposableCluster();
    t.after(() => cluster.stop());

    const work = mkdtempSync(join(tmpdir(), "bvl-pg-"));
    const outDir = join(work, "out");
    mkdirSync(outDir);

    const result = await runLabelledJob({
      jobId: "vendor-budget-impact",
      buyerClass: "owner-qa",
      example: true,
      outDir,
      postgres: cluster,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.row.independentDemand, false);
    assert.equal(result.row.jobRevenueUsdc, null);
    assert.equal(result.usefulPaidWork, false);
    assert.equal(result.row.usefulPaidWork, false);

    const rows = selectRows(cluster);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].runId, result.row.runId);
    assert.equal(rows[0].buyerClass, "owner-qa");
    assert.equal(rows[0].sample, true);
    assert.equal(rows[0].independentDemand, false);
    assert.equal(rows[0].evidence.postgres, "local-runtime");
  });
});
