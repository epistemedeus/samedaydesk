import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  CUSTOMER_X402_ROOT,
  MERCHANT_ROOT,
  PACKAGE_ROOT,
} from "../harness/paths.mjs";
import {
  capturingFetch,
  proxyToMerchant,
  startFakeFacilitator,
  startMerchant,
  stopChild,
} from "../harness/merchant.mjs";

const ready = existsSync(join(MERCHANT_ROOT, "server.js"))
  && existsSync(join(MERCHANT_ROOT, "node_modules"))
  && existsSync(join(CUSTOMER_X402_ROOT, "src/purchase.mjs"));

const { generatePrivateKey, privateKeyToAccount } = ready
  ? await import(pathToFileURL(join(CUSTOMER_X402_ROOT, "node_modules/viem/_esm/accounts/index.js")).href)
  : { generatePrivateKey: null, privateKeyToAccount: null };

async function loadClient() {
  const href = (rel) => pathToFileURL(join(CUSTOMER_X402_ROOT, rel)).href;
  const [{ runAuthorizedPurchase }, { runPreflight }, { normalizeAuthorization }] = await Promise.all([
    import(href("src/purchase.mjs")),
    import(href("src/preflight.mjs")),
    import(href("src/authorization.mjs")),
  ]);
  return { runAuthorizedPurchase, runPreflight, normalizeAuthorization };
}

const skip = ready ? false : "merchant 7aaf004 runtime not mounted";

test("control customer-x402: inspect, amount cap, change, replay-negative", { timeout: 120_000, skip }, async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "rr-cx402-"));
  const account = privateKeyToAccount(generatePrivateKey());
  const facilitator = await startFakeFacilitator({ payer: account.address });
  let merchant;
  t.after(async () => {
    await stopChild(merchant?.child);
    await facilitator.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  merchant = await startMerchant({ dataDir, facilitatorUrl: facilitator.url });
  const client = await loadClient();
  const proxy = proxyToMerchant(merchant.base);
  const { fetchImpl, payments } = capturingFetch(proxy);
  const changeAuth = client.normalizeAuthorization(JSON.parse(
    await readFile(join(PACKAGE_ROOT, "clients/customer-x402/authorization-lockfile.json"), "utf8"),
  ));
  const noChangeAuth = client.normalizeAuthorization(JSON.parse(
    await readFile(join(PACKAGE_ROOT, "clients/customer-x402/authorization-lockfile-no-change.json"), "utf8"),
  ));

  const invalid = await proxy(changeAuth.url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: "{}",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).charged, false);
  assert.equal(facilitator.calls.settle, 0);

  const lowCap = JSON.parse(await readFile(join(PACKAGE_ROOT, "clients/customer-x402/authorization-lockfile.json"), "utf8"));
  lowCap.amountCapAtomic = "4000";
  const capped = client.normalizeAuthorization(lowCap);
  await assert.rejects(
    () => client.runPreflight({ authorization: capped, fetchImpl }),
    /exceeds authorized amountCapAtomic/,
  );

  const unpaid = await client.runPreflight({ authorization: changeAuth, fetchImpl });
  assert.equal(unpaid.outcome, "preflight_ok");
  assert.equal(unpaid.offer.amountAtomic, "5000");
  assert.equal(unpaid.walletAccessed, false);

  const refused = await client.runAuthorizedPurchase({
    authorization: changeAuth, account, fetchImpl, approve: false,
  });
  assert.equal(refused.outcome, "authorization_refused");
  assert.equal(refused.walletAccessed, false);

  const change = await client.runAuthorizedPurchase({
    authorization: changeAuth, account, fetchImpl, approve: true,
  });
  assert.equal(change.outcome, "valid_delivered", change.message);
  assert.equal(change.evidence.retainedBody.analysis, "actionable");
  assert.equal(payments[0].body, changeAuth.bodyRaw);
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
  assert.equal(replayNegative.status, 409);
  assert.equal((await replayNegative.json()).charged, false);
  assert.equal(facilitator.calls.settle, 1);
});

test("control customer-x402: timeout/unknown does not mint a new payment", { timeout: 60_000, skip }, async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "rr-cx402-to-"));
  const account = privateKeyToAccount(generatePrivateKey());
  const facilitator = await startFakeFacilitator({ payer: account.address });
  let merchant;
  t.after(async () => {
    await stopChild(merchant?.child);
    await facilitator.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  merchant = await startMerchant({
    dataDir,
    facilitatorUrl: facilitator.url,
    extraEnv: {
      LOCKFILE_PIN_DELTA_TIMEOUT_MS: "200",
      LOCKFILE_PIN_DELTA_WORKER_HOLD_MS: "2000",
    },
  });
  const client = await loadClient();
  const proxy = proxyToMerchant(merchant.base);
  const { fetchImpl, payments } = capturingFetch(proxy);
  const auth = client.normalizeAuthorization(JSON.parse(
    await readFile(join(PACKAGE_ROOT, "clients/customer-x402/authorization-lockfile.json"), "utf8"),
  ));
  const timedOut = await client.runAuthorizedPurchase({
    authorization: auth, account, fetchImpl, approve: true, timeoutMs: 15_000,
  });
  assert.equal(timedOut.outcome, "unknown");
  assert.equal(timedOut.paymentSent, true);
  assert.equal(timedOut.evidence.httpStatus, 503);
  assert.equal(facilitator.calls.settle, 0);
  assert.equal(payments.length, 1);
});
