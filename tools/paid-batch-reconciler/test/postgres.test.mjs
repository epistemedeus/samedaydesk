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
  it("persists item-level outcomes with sold=false CHECK", async () => {
    assert.equal(
      postgresAvailable(),
      true,
      "Postgres 16 binaries are required at /usr/lib/postgresql/16/bin; missing Postgres is incomplete, not a skip",
    );
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
          `SELECT item_id, outcome, funding_state, sold, price_usdc FROM paid_batch_items WHERE batch_id = $1 ORDER BY item_id`,
          [ledger.batchId],
        );
        assert.equal(counts.rows.length, 2);
        assert.ok(counts.rows.every((row) => row.sold === false));
        assert.ok(counts.rows.every((row) => row.price_usdc === "0.02"));
        assert.ok(counts.rows.some((row) => row.outcome === "completed"));
        assert.ok(counts.rows.some((row) => row.outcome === "rejected"));
        assert.notEqual(counts.rows[0].item_id, counts.rows[1].item_id);

        await assert.rejects(
          () =>
            client.query(
              `INSERT INTO paid_batch_items (batch_id, item_id, engine_id, outcome, funding_state, sold, price_kind, price_usdc)
               VALUES ($1, $2, 'vendor-budget-impact', 'completed', 'reserved-fixture', FALSE, 'fixture', '0.02')`,
              [ledger.batchId, stored.items[0].id],
            ),
          /duplicate key|unique/i,
        );

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
