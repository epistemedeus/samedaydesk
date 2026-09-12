import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { D19_ROOT } from "../lib/pins.mjs";
import { Incomplete, locateCo16, locateCo20, co20Fixture } from "../lib/locate.mjs";
import { postgresBinariesAvailable, requirePostgres, startDisposablePostgres } from "../lib/pg-cluster.mjs";
import { spawnNode, twoCreates, parseJsonProc } from "../lib/run.mjs";

describe("multi-process Postgres stores", { timeout: 180_000 }, () => {
  it("fails incomplete when initdb is missing rather than skipping", () => {
    if (postgresBinariesAvailable()) {
      requirePostgres();
      return;
    }
    assert.throws(() => requirePostgres(), (err) => err instanceof Incomplete);
  });

  it("two order CLI processes share one Postgres reservation after schema warmup", async () => {
    requirePostgres();
    const cluster = startDisposablePostgres();
    try {
      const url = cluster.connectionString();
      const co20 = locateCo20();
      const storeMod = await import(
        pathToFileURL(join(co20.root, "tools/managed-useful-jobs-order/lib/store-postgres.mjs")).href
      );
      const warmup = await storeMod.createPostgresStore({ connectionString: url });
      await warmup.close();
      const req = co20Fixture("ord-1.json");
      const pair = await twoCreates([req, req], { databaseUrl: url });
      assert.equal(pair.a.body.parseError, false, pair.a.body.stderr);
      assert.equal(pair.b.body.parseError, false, pair.b.body.stderr);
      assert.equal(pair.a.body.ok, true, JSON.stringify(pair.a.body));
      assert.equal(pair.b.body.ok, true, JSON.stringify(pair.b.body));
      const replayed = [pair.a.body.replayed, pair.b.body.replayed];
      assert.equal(replayed.filter((value) => value === false).length, 1);
      assert.equal(pair.outputsA, true);
      assert.equal(pair.outputsB, true);
    } finally {
      cluster.stop();
    }
  });


  it("two insert processes keep both ledger jobs in Postgres", async () => {
    requirePostgres();
    const located = locateCo16();
    const pgLib = join(located.root, "tools/buyer-value-ledger/lib/postgres.mjs");
    if (!existsSync(pgLib)) {
      throw new Incomplete(`Co16 pin missing ${pgLib}`);
    }
    const postgres = await import(pathToFileURL(pgLib).href);
    const cluster = postgres.startDisposableCluster();
    try {
      const worker = join(D19_ROOT, "workers/pg-insert-row.mjs");
      const clusterJson = JSON.stringify({ psql: cluster.psql, env: cluster.env });
      const row = (runId) =>
        JSON.stringify({
          schema: "samedaydesk.buyer-value-ledger.row.v1",
          runId,
          jobId: "vendor-budget-impact",
          buyerClass: "owner-qa",
          sample: true,
          independentDemand: false,
          durationMs: 1,
          outputBytes: 1,
        });
      const [a, b] = await Promise.all([
        spawnNode([worker, pgLib, clusterJson, row("bvl_pg_a")], { cwd: located.root }),
        spawnNode([worker, pgLib, clusterJson, row("bvl_pg_b")], { cwd: located.root }),
      ]);
      const bodyA = parseJsonProc(a);
      const bodyB = parseJsonProc(b);
      assert.equal(a.status, 0, a.stderr);
      assert.equal(b.status, 0, b.stderr);
      assert.equal(bodyA.ok, true);
      assert.equal(bodyB.ok, true);
      const rows = postgres.selectRows(cluster);
      const ids = new Set(rows.map((item) => item.runId));
      assert.equal(ids.has("bvl_pg_a"), true);
      assert.equal(ids.has("bvl_pg_b"), true);
      assert.equal(rows.length, 2);
    } finally {
      cluster.stop();
    }
  });
});
