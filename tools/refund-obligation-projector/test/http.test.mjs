import assert from "node:assert/strict";
import test from "node:test";
import { createProjectionServer } from "../lib/http.mjs";
import { projectDir } from "../lib/project.mjs";

test("local HTTP GET /projection is a real server path, not a fake in-memory double", async (t) => {
  const report = projectDir();
  assert.equal(report.ok, true);
  const listening = await createProjectionServer({
    project: () => ({
      ok: true,
      projection: { ...report.projection, evidenceKind: "local_runtime" },
    }),
  });
  t.after(() => listening.close());

  const health = await fetch(`${listening.url}/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.stripeRefundsCalled, false);

  const response = await fetch(`${listening.url}/projection.json`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.projection.evidenceKind, "local_runtime");
  assert.equal(body.projection.records.length, 5);
  const agent402 = body.projection.records.find(
    (row) => row.operationId === "agent402-external-validation-purchase-2026-08-29",
  );
  assert.match(agent402.delivery, /repair_required/);
  assert.equal(agent402.refundClaim, "not-offered");
  assert.equal(agent402.paidOut, false);
});

test("local HTTP POST refund is refused", async (t) => {
  const listening = await createProjectionServer({
    project: () => projectDir(),
  });
  t.after(() => listening.close());

  const response = await fetch(`${listening.url}/refund`, { method: "POST", body: "{}" });
  assert.equal(response.status, 405);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "execute_refund_refused");
});
