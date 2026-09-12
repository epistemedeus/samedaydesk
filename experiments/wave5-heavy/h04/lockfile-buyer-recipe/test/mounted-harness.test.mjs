import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { CUSTOMER_X402_ROOT, RECIPE_ROOT } from "../src/paths.mjs";
import { loadCustomerX402, materializePatchedCustomerX402 } from "../src/overlay.mjs";
import { proxyToMerchant, startFakeFacilitator, startMerchant, stopChild } from "../src/harness.mjs";

const { generatePrivateKey, privateKeyToAccount } = await import(
  pathToFileURL(join(CUSTOMER_X402_ROOT, "node_modules/viem/_esm/accounts/index.js")).href
);

function capturingFetch(proxy) {
  const payments = [];
  const fetchImpl = async (input, init) => {
    const request = input instanceof Request && init == null ? input : new Request(input, init);
    const header = request.headers.get("payment-signature") || request.headers.get("PAYMENT-SIGNATURE");
    const bodyText = request.method === "POST" ? await request.clone().text() : null;
    if (header) payments.push({ header, body: bodyText, url: request.url });
    const response = await proxy(request);
    return response;
  };
  return { fetchImpl, payments };
}

test("mounted merchant: change, no-change, replay-negative via existing customer-x402", { timeout: 120_000 }, async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "h04-lockfile-mount-"));
  const clientDir = await mkdtemp(join(tmpdir(), "h04-lockfile-cx402-"));
  const throwawayKey = generatePrivateKey();
  const account = privateKeyToAccount(throwawayKey);
  const facilitator = await startFakeFacilitator({ payer: account.address });
  let merchant;
  t.after(async () => {
    await stopChild(merchant?.child);
    await facilitator.close();
    await rm(dataDir, { recursive: true, force: true });
    await rm(clientDir, { recursive: true, force: true });
  });
  merchant = await startMerchant({ dataDir, facilitatorUrl: facilitator.url });
  await materializePatchedCustomerX402(clientDir);
  const client = await loadCustomerX402(clientDir);
  const proxy = proxyToMerchant(merchant.base);
  const { fetchImpl, payments } = capturingFetch(proxy);

  const changeAuth = client.normalizeAuthorization(JSON.parse(
    await readFile(join(RECIPE_ROOT, "authorization/authorization-lockfile.json"), "utf8"),
  ));
  const noChangeAuth = client.normalizeAuthorization(JSON.parse(
    await readFile(join(RECIPE_ROOT, "authorization/authorization-lockfile-no-change.json"), "utf8"),
  ));

  const unpaidDefault = await client.runPreflight({
    authorization: changeAuth,
    fetchImpl,
  });
  assert.equal(unpaidDefault.outcome, "preflight_ok");
  assert.equal(unpaidDefault.walletAccessed, false);
  assert.equal(unpaidDefault.paymentSigned, false);
  assert.equal(unpaidDefault.paymentSent, false);
  assert.equal(unpaidDefault.offer.amountAtomic, "5000");
  assert.equal(facilitator.calls.settle, 0);

  const refused = await client.runAuthorizedPurchase({
    authorization: changeAuth,
    account,
    fetchImpl,
    approve: false,
  });
  assert.equal(refused.outcome, "authorization_refused");
  assert.equal(refused.walletAccessed, false);
  assert.equal(refused.paymentSigned, false);
  assert.equal(refused.paymentSent, false);

  const change = await client.runAuthorizedPurchase({
    authorization: changeAuth,
    account,
    fetchImpl,
    approve: true,
  });
  assert.equal(change.outcome, "valid_delivered", JSON.stringify({
    outcome: change.outcome,
    message: change.message,
    status: change.evidence?.httpStatus,
    analysis: change.evidence?.retainedBody?.analysis,
  }));
  assert.equal(change.paymentSigned, true);
  assert.equal(change.paymentSent, true);
  assert.equal(change.evidence.retainedBody.analysis, "actionable");
  assert.equal(change.evidence.retainedBody.charged, true);
  assert.equal(change.evidence.retainedBody.ok, true);
  assert.ok(change.evidence.retainedBody.engine.counts.changed >= 1);
  assert.equal(facilitator.calls.settle, 1);
  assert.equal(payments.length, 1);

  const sameBodyReplay = await proxy(changeAuth.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "payment-signature": payments[0].header,
    },
    body: changeAuth.bodyRaw,
  });
  assert.equal(sameBodyReplay.status, 200);
  assert.equal(sameBodyReplay.headers.get("x-payment-replay"), "hit");
  assert.equal(facilitator.calls.settle, 1);

  const replayNegative = await proxy(noChangeAuth.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "payment-signature": payments[0].header,
    },
    body: noChangeAuth.bodyRaw,
  });
  const replayNegativeBody = await replayNegative.json();
  assert.equal(replayNegative.status, 409, JSON.stringify(replayNegativeBody));
  assert.equal(replayNegativeBody.charged, false);
  assert.equal(facilitator.calls.settle, 1);

  const noChange = await client.runAuthorizedPurchase({
    authorization: noChangeAuth,
    account,
    fetchImpl,
    approve: true,
  });
  assert.equal(noChange.outcome, "valid_delivered", noChange.message);
  assert.equal(noChange.evidence.retainedBody.analysis, "informational");
  assert.equal(noChange.evidence.retainedBody.charged, true);
  assert.equal(noChange.evidence.retainedBody.engine.counts.changed, 0);
  assert.equal(facilitator.calls.settle, 2);
  assert.equal(payments.length, 2);
  assert.notEqual(payments[0].header, payments[1].header);
});

test("mounted merchant: timeout/unknown does not authorize a new payment", { timeout: 60_000 }, async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "h04-lockfile-timeout-"));
  const clientDir = await mkdtemp(join(tmpdir(), "h04-lockfile-cx402-to-"));
  const throwawayKey = generatePrivateKey();
  const account = privateKeyToAccount(throwawayKey);
  const facilitator = await startFakeFacilitator({ payer: account.address });
  let merchant;
  t.after(async () => {
    await stopChild(merchant?.child);
    await facilitator.close();
    await rm(dataDir, { recursive: true, force: true });
    await rm(clientDir, { recursive: true, force: true });
  });
  merchant = await startMerchant({
    dataDir,
    facilitatorUrl: facilitator.url,
    extraEnv: {
      LOCKFILE_PIN_DELTA_TIMEOUT_MS: "200",
      LOCKFILE_PIN_DELTA_WORKER_HOLD_MS: "2000",
    },
  });
  await materializePatchedCustomerX402(clientDir);
  const client = await loadCustomerX402(clientDir);
  const proxy = proxyToMerchant(merchant.base);
  const { fetchImpl, payments } = capturingFetch(proxy);
  const auth = client.normalizeAuthorization(JSON.parse(
    await readFile(join(RECIPE_ROOT, "authorization/authorization-lockfile.json"), "utf8"),
  ));

  const timedOut = await client.runAuthorizedPurchase({
    authorization: auth,
    account,
    fetchImpl,
    approve: true,
    timeoutMs: 15_000,
  });
  assert.equal(timedOut.outcome, "unknown", timedOut.message);
  assert.equal(timedOut.paymentSent, true);
  assert.equal(timedOut.evidence.httpStatus, 503);
  assert.equal(timedOut.evidence.retainedBody?.charged, false);
  assert.equal(timedOut.evidence.retainedBody?.analysis, "not-run");
  assert.equal(timedOut.evidence.retainedBody?.transport, "timeout");
  assert.equal(facilitator.calls.settle, 0);
  assert.equal(payments.length, 1);

  const sameSignatureRetry = await proxy(auth.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "payment-signature": payments[0].header,
    },
    body: auth.bodyRaw,
  });
  const retryBody = await sameSignatureRetry.json();
  assert.equal(sameSignatureRetry.status, 503, JSON.stringify(retryBody));
  assert.notEqual(sameSignatureRetry.headers.get("x-payment-replay"), "hit");
  assert.equal(retryBody.charged, false);
  assert.equal(facilitator.calls.settle, 0);
});
