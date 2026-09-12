import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { MERCHANT_ROOT, X402_FETCH_INSTALL } from "../harness/paths.mjs";
import { loadLockfiles } from "../harness/fixtures.mjs";
import {
  capturingFetch,
  proxyToMerchant,
  startFakeFacilitator,
  startMerchant,
  stopChild,
} from "../harness/merchant.mjs";

const ready = existsSync(join(MERCHANT_ROOT, "server.js"))
  && existsSync(join(X402_FETCH_INSTALL, "node_modules/@x402/fetch"));
const LIVE_URL = "https://agents.samedaydesk.com/lockfile-pin-delta";
const skip = ready ? false : "official @x402/fetch 2.25.0 install or merchant missing";

async function loadOfficial() {
  const href = (rel) => pathToFileURL(join(X402_FETCH_INSTALL, "node_modules", rel)).href;
  const [{ wrapFetchWithPayment, x402Client }, { ExactEvmScheme }, extensions, viem] = await Promise.all([
    import(href("@x402/fetch/dist/esm/index.mjs")),
    import(href("@x402/evm/dist/esm/index.mjs")),
    import(href("@x402/extensions/dist/esm/index.mjs")),
    import(href("viem/_esm/accounts/index.js")),
  ]);
  return { wrapFetchWithPayment, x402Client, ExactEvmScheme, extensions, viem };
}

function identifierExtension(extensions) {
  return {
    key: extensions.PAYMENT_IDENTIFIER,
    async enrichPaymentPayload(paymentPayload) {
      const next = paymentPayload.extensions ? structuredClone(paymentPayload.extensions) : {};
      extensions.appendPaymentIdentifierToExtensions(next);
      return { ...paymentPayload, extensions: next };
    },
  };
}

const skipOfficial = skip;

test("official @x402/fetch binds POST body; payment-identifier required; auto-pays 402", {
  timeout: 120_000,
  skip: skipOfficial,
}, async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "rr-x402fetch-"));
  const official = await loadOfficial();
  const account = official.viem.privateKeyToAccount(official.viem.generatePrivateKey());
  const facilitator = await startFakeFacilitator({ payer: account.address });
  let merchant;
  t.after(async () => {
    await stopChild(merchant?.child);
    await facilitator.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  merchant = await startMerchant({ dataDir, facilitatorUrl: facilitator.url });
  const proxy = proxyToMerchant(merchant.base);
  const { fetchImpl, payments } = capturingFetch(proxy);
  const { changeBody, noChangeBody } = loadLockfiles();
  const init = {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: changeBody,
  };

  const bare = new official.x402Client()
    .register("eip155:8453", new official.ExactEvmScheme(account));
  const paidBare = await official.wrapFetchWithPayment(fetchImpl, bare)(LIVE_URL, init);
  assert.equal(paidBare.status, 400, await paidBare.text());
  assert.equal(facilitator.calls.settle, 0);

  const client = new official.x402Client()
    .register("eip155:8453", new official.ExactEvmScheme(account))
    .registerExtension(identifierExtension(official.extensions));
  const paid = await official.wrapFetchWithPayment(fetchImpl, client)(LIVE_URL, init);
  const body = await paid.json();
  assert.equal(paid.status, 200, JSON.stringify(body));
  assert.equal(body.analysis, "actionable");
  assert.equal(body.charged, true);
  assert.equal(payments.at(-1).body, changeBody);
  assert.equal(facilitator.calls.settle, 1);

  const replayNegative = await proxy(LIVE_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "payment-signature": payments.at(-1).header,
    },
    body: noChangeBody,
  });
  assert.equal(replayNegative.status, 409);
  assert.equal((await replayNegative.json()).charged, false);
  assert.equal(facilitator.calls.settle, 1);
});
