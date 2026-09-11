import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { journeyRequest } from "./helpers.mjs";
import { runBatch } from "../lib/ledger.mjs";
import {
  loadLedger,
  migrate,
  persistLedger,
  postgresAvailable,
  startDisposableCluster,
  stopDisposableCluster,
  withClient,
} from "../lib/postgres.mjs";

describe("real local Postgres ledger", { timeout: 120_000 }, () => {
  it("persists item-level outcomes with sold=false CHECK", async (t) => {
    if (!postgresAvailable()) {
      t.skip("Postgres 16 binaries not installed (local-runtime, not a fixture fake)");
      return;
    }
    const cluster = startDisposableCluster();
    try {
      await withClient(cluster, async (client) => {
        await migrate(client);
        const ledger = await runBatch(journeyRequest(), {
          persistKind: "postgres",
          persist: async (body) => persistLedger(client, body),
        });
        assert.equal(ledger.status, "partial");
        assert.equal(ledger.sold, false);
        const stored = await loadLedger(client, ledger.batchId);
        assert.equal(stored.sold, false);
        assert.equal(stored.status, "partial");
        assert.equal(stored.items.length, 2);

        const counts = await client.query(
          `SELECT outcome, funding_state, sold, price_usdc FROM paid_batch_items WHERE batch_id = $1 ORDER BY item_id`,
          [ledger.batchId],
        );
        assert.equal(counts.rows.length, 2);
        assert.ok(counts.rows.every((row) => row.sold === false));
        assert.ok(counts.rows.every((row) => row.price_usdc === "0.02"));
        assert.ok(counts.rows.some((row) => row.outcome === "completed"));
        assert.ok(counts.rows.some((row) => row.outcome === "rejected"));

        await assert.rejects(
          () =>
            client.query(
              `INSERT INTO paid_batch_ledger (batch_id, terms_version, status, sold, ledger)
               VALUES ('sold-forbidden', null, 'completed', TRUE, '{}'::jsonb)`,
            ),
          /sold/i,
        );
      });
    } finally {
      stopDisposableCluster(cluster);
    }
  });
});
