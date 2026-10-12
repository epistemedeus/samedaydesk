import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
  TEST_PROVENANCE,
  closeServer,
  createReservedTask,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("HTTP journey reserved→claimed→submitted→verified→owed (test provenance)", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const unauthorized = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      idempotencyKey: key("noauth"),
      body: JSON.stringify({ title: "x", summary: "y", provenance: TEST_PROVENANCE }),
    });
    assert.equal(unauthorized.status, 401);

    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const ownerView = await json(baseUrl, `/v1/tasks/${taskId}`, { token: OWNER_TOKEN });
    assert.equal(ownerView.status, 200);
    assert.equal((ownerView.body as { task: { fundingState: string; provenance: string } }).task.fundingState, "reserved");
    assert.equal((ownerView.body as { task: { provenance: string } }).task.provenance, TEST_PROVENANCE);

    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string; status: string } }).reservation.id;
    assert.equal((claimed.body as { reservation: { status: string } }).reservation.status, "active");
    assert.equal((claimed.body as { task: { lifecycle: string } }).task.lifecycle, "claimed");

    const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("submit"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal((submitted.body as { task: { lifecycle: string } }).task.lifecycle, "submitted");

    const verified = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(verified.status, 201, JSON.stringify(verified.body));
    assert.equal((verified.body as { verdict: { outcome: string } }).verdict.outcome, "pass");
    assert.equal((verified.body as { task: { lifecycle: string } }).task.lifecycle, "verified");

    const accepted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    const obligation = (accepted.body as {
      obligation: {
        id: string;
        payoutState: string;
        transfer: null;
        kind: string;
        adapter: string;
        termsVersion: string;
      };
      task: { payoutState: string; fundingState: string };
    }).obligation;
    assert.equal(obligation.kind, "owed_record");
    assert.equal(obligation.payoutState, "owed");
    assert.equal(obligation.transfer, null);
    assert.equal(obligation.adapter, "typed_owed_record_v0");
    assert.equal(obligation.termsVersion, termsVersion);
    assert.equal((accepted.body as { task: { payoutState: string } }).task.payoutState, "owed");
    assert.equal((accepted.body as { task: { fundingState: string } }).task.fundingState, "released");

    const fetched = await json(baseUrl, `/v1/tasks/${taskId}/obligation`, { token: OWNER_TOKEN });
    assert.equal(fetched.status, 200);
    assert.equal((fetched.body as { obligation: { payoutState: string; transfer: null } }).obligation.payoutState, "owed");
    assert.equal((fetched.body as { obligation: { transfer: null } }).obligation.transfer, null);

    const payout = await json(baseUrl, `/v1/tasks/${taskId}/payout`, { token: OWNER_TOKEN });
    assert.equal(payout.status, 200, JSON.stringify(payout.body));
    const recon = (payout.body as {
      payoutState: string;
      obligationId: string;
      reservationId: string;
      contributorPublicId: string;
      payoutDestination: string;
      termsVersion: string;
      reconciliation: {
        adapter: string;
        transfer: null;
        paid: boolean;
        settled: boolean;
        paying: boolean;
        sale: boolean;
        owed: boolean;
        obligationId: string;
      };
    }).reconciliation;
    assert.equal((payout.body as { payoutState: string }).payoutState, "owed");
    assert.equal((payout.body as { obligationId: string }).obligationId, obligation.id);
    assert.equal((payout.body as { reservationId: string }).reservationId, reservationId);
    assert.equal((payout.body as { contributorPublicId: string }).contributorPublicId, contrib.publicId);
    assert.equal((payout.body as { termsVersion: string }).termsVersion, termsVersion);
    assert.equal(recon.adapter, "null_nonpaying_v0");
    assert.equal(recon.transfer, null);
    assert.equal(recon.paying, false);
    assert.equal(recon.paid, false);
    assert.equal(recon.settled, false);
    assert.equal(recon.sale, false);
    assert.equal(recon.owed, true);
    assert.equal(recon.obligationId, obligation.id);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
