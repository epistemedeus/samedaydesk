import assert from "node:assert/strict";
import test from "node:test";
import { CITED_BANKED_USDC } from "../lib/contract.mjs";
import { createProjectionServer } from "../lib/http.mjs";
import { loadSettlementRecords, projectDir, projectDossier } from "../lib/project.mjs";

test("local HTTP GET /projection is a real server path, not a fake in-memory double", async (t) => {
  const loaded = loadSettlementRecords();
  const records = loaded.map((item) => item.record);
  const listening = await createProjectionServer({
    project: ({ operationId } = {}) => {
      const options = { evidenceKind: "local_runtime" };
      if (operationId) return projectDossier(operationId, records, undefined, options);
      const report = projectDir(undefined, undefined, options);
      return report;
    },
  });
  t.after(() => listening.close());

  const health = await fetch(`${listening.url}/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.stripeRefundsCalled, false);
  assert.equal(healthBody.citedBankedUsdcAttached, false);

  const response = await fetch(`${listening.url}/projection.json`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.projection.evidenceKind, "local_runtime");
  assert.equal(body.projection.records.length, 5);
  const agent402 = body.projection.records.find(
    (row) => row.operationId === "agent402-external-validation-purchase-2026-08-29",
  );
  assert.equal(
    agent402.delivery,
    "seller_http_200_repair_required_no_buyer_owned_output_enforcement",
  );
  assert.equal(agent402.refundClaim, "unknown");
  assert.equal(agent402.outcomeKind, "operational_error");
  assert.equal(agent402.paidOut, false);
  assert.equal(JSON.stringify(body).includes(CITED_BANKED_USDC), false);

  const dossier = await fetch(
    `${listening.url}/projection?operationId=agent402-external-validation-purchase-2026-08-29`,
  );
  assert.equal(dossier.status, 200);
  const dossierBody = await dossier.json();
  assert.equal(dossierBody.projection.records.length, 1);
  assert.equal(JSON.stringify(dossierBody).includes(CITED_BANKED_USDC), false);
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

test("local HTTP unexpected throw is transport 500, not an invented refundClaim", async (t) => {
  const listening = await createProjectionServer({
    project: () => {
      throw new Error("disk missing");
    },
  });
  t.after(() => listening.close());
  const response = await fetch(`${listening.url}/projection`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "projector_transport_error");
  assert.equal(Object.hasOwn(body, "refundClaim"), false);
});
