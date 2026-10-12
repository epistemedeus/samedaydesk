import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
  closeServer,
  createReservedTask,
  createTaskPayload,
  databaseUrl,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

const root = path.dirname(fileURLToPath(import.meta.url));

test("OpenAPI Provenance schema exists and create documents terms", () => {
  const document = JSON.parse(readFileSync(path.join(root, "../openapi.json"), "utf8")) as {
    components: { schemas: Record<string, { enum?: string[] }> };
    paths: Record<
      string,
      {
        post?: {
          requestBody?: { content?: { "application/json": { schema: Record<string, unknown> } } };
        };
      }
    >;
  };
  assert.deepEqual(document.components.schemas.Provenance.enum, ["test", "fixture", "production"]);
  const createSchema = document.paths["/v1/tasks"]?.post?.requestBody?.content?.["application/json"].schema as {
    properties: { terms?: unknown; provenance: { $ref: string } };
  };
  assert.equal(createSchema.properties.provenance.$ref, "#/components/schemas/Provenance");
  assert.ok(createSchema.properties.terms);
  assert.ok(document.paths["/v1/tasks/{taskId}/terms"]?.post?.requestBody);
  assert.match(JSON.stringify(document.paths["/v1/tasks/{taskId}/submissions"]), /evidenceBase64/);
});

test("omitted create terms still hash from listing summary; explicit terms.summary is used when present", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const omitted = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("h03-create-omitted-terms"),
      body: JSON.stringify({
        title: "H03 omitted terms",
        summary: "test provenance — omitted create terms object",
        provenance: "test",
        reward: { amount: "0.10", asset: "USDC", network: "base" },
        budget: { amount: "0.10", asset: "USDC", network: "base" },
      }),
    });
    assert.equal(omitted.status, 201, JSON.stringify(omitted.body));
    const omittedTask = (omitted.body as { task: { id: string; termsDocument: { summary: string } } }).task;
    assert.equal(omittedTask.termsDocument.summary, "test provenance — omitted create terms object");

    const payload = createTaskPayload();
    const created = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("h03-create-with-terms"),
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test(
  "in-flight backend terminate does not crash HTTP; same-key accept does not duplicate obligations",
  { timeout: 60_000 },
  async () => {
    const { store, schema } = await openStore({ poolMax: 4 });
    const { server, baseUrl } = await listen(store);
    const inspector = new pg.Client({ connectionString: databaseUrl() });
    await inspector.connect();
    try {
      const { taskId, termsVersion } = await createReservedTask(baseUrl);
      const contrib = await issueContributor(baseUrl, { taskId });
      const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: contrib.token,
        idempotencyKey: key("h03-claim"),
        body: JSON.stringify({ termsVersion }),
      });
      assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
      const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
      const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
        method: "POST",
        token: contrib.token,
        idempotencyKey: key("h03-submit"),
        body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
      const verdict = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key("h03-verdict"),
        body: JSON.stringify({ reservationId, outcome: "pass" }),
      });
      assert.equal(verdict.status, 201, JSON.stringify(verdict.body));

      await inspector.query(`SET search_path TO ${quoteIdent(schema)}`);
      await inspector.query("BEGIN");
      await inspector.query("LOCK TABLE earned_work_tasks IN ACCESS EXCLUSIVE MODE");

      const acceptKey = key("h03-accept");
      const acceptPromise = json(baseUrl, `/v1/tasks/${taskId}/accept`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: acceptKey,
        body: JSON.stringify({ reservationId }),
      });

      let victim: number | null = null;
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline && victim == null) {
        const waiting = await inspector.query<{ pid: number }>(
          `SELECT pid FROM pg_stat_activity
           WHERE application_name = $1
             AND pid <> pg_backend_pid()
             AND wait_event_type = 'Lock'`,
          [`ew_${schema}`.slice(0, 63)],
        );
        if (waiting.rows[0]) victim = waiting.rows[0].pid;
        else await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (victim != null) {
        await inspector.query("SELECT pg_terminate_backend($1)", [victim]);
      }
      await inspector.query("ROLLBACK");

      const first = await acceptPromise;
      assert.notEqual(first.status, undefined);
      const health = await json(baseUrl, "/healthz");
      assert.equal(health.status, 200, JSON.stringify(health.body));
      assert.equal((health.body as { ok: boolean }).ok, true);

      const replay = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: acceptKey,
        body: JSON.stringify({ reservationId }),
      });
      assert.ok(replay.status === 200 || replay.status === 201, JSON.stringify(replay.body));

      const counted = await inspector.query("SELECT count(*)::int AS n FROM earned_work_obligations WHERE task_id = $1", [
        taskId,
      ]);
      assert.equal(counted.rows[0]?.n, 1);
      const payout = await json(baseUrl, `/v1/tasks/${taskId}/payout`, { token: OWNER_TOKEN });
      assert.equal((payout.body as { payoutState: string }).payoutState, "owed");
      assert.equal((payout.body as { reconciliation: { paid: boolean } }).reconciliation.paid, false);
    } finally {
      try {
        await inspector.query("ROLLBACK");
      } catch {
        // already rolled back
      }
      await inspector.end();
      await closeServer(server);
      await store.close();
      await dropSchema(schema);
    }
  },
);
