import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { COMMITTED, EXTRACT_AMOUNT, KNOWN_SETTLEMENT, SDS_PIN } from "../src/constants.mjs";
import { pinCommittedArtifacts } from "../src/committed.mjs";
import { findRepoRoot } from "../src/paths.mjs";

test("findRepoRoot locates the SDS checkout from this pack", () => {
  const root = findRepoRoot();
  assert.match(root, /samedaydesk|repo/);
});

test("committed extract accept is the SDS pin", () => {
  const pin = pinCommittedArtifacts();
  assert.equal(pin.ok, true, JSON.stringify(pin.errors, null, 2));
  assert.equal(pin.extractAmount, EXTRACT_AMOUNT);
  assert.equal(pin.payTo, SDS_PIN.payTo);
  assert.equal(pin.settlementTransaction, KNOWN_SETTLEMENT.transaction);
  assert.equal(pin.boundRoute, KNOWN_SETTLEMENT.boundRoute);
  assert.equal(pin.live, false);
  assert.equal(pin.paymentSent, false);
});

test("seeded committed catalog with extract amount 1 is pin_mismatch", () => {
  const root = mkdtempSync(join(tmpdir(), "w1123-pin-"));
  mkdirSync(join(root, "fixtures/presence/catalog"), { recursive: true });
  mkdirSync(join(root, "fixtures/verified-feed/observations"), { recursive: true });
  mkdirSync(join(root, "tools/evidence-records/fixtures/settlements"), { recursive: true });
  mkdirSync(join(root, "fixtures/buyer-runtimes/coinbase-x402/states"), { recursive: true });

  writeFileSync(
    join(root, COMMITTED.x402Catalog),
    JSON.stringify({
      items: [
        {
          resource: { routeTemplate: "/extract" },
          request: { method: "GET" },
          accepts: [
            {
              scheme: SDS_PIN.scheme,
              network: SDS_PIN.network,
              asset: SDS_PIN.asset,
              amount: "1",
              payTo: SDS_PIN.payTo,
            },
          ],
        },
      ],
    }),
  );
  writeFileSync(
    join(root, COMMITTED.extractObservation),
    JSON.stringify({
      route: "/extract",
      status: 402,
      headers: {},
      body: {
        accepts: [
          {
            scheme: SDS_PIN.scheme,
            network: SDS_PIN.network,
            asset: SDS_PIN.asset,
            amount: "1",
            payTo: SDS_PIN.payTo,
          },
        ],
      },
    }),
  );
  writeFileSync(
    join(root, COMMITTED.settlement),
    JSON.stringify({
      producer: { observedSurface: `x402 v2 Coinbase CDP settlement for GET ${KNOWN_SETTLEMENT.boundRoute}` },
      settlement: {
        operationId: KNOWN_SETTLEMENT.operationId,
        amountUsdc: KNOWN_SETTLEMENT.amountUsdc,
        transaction: KNOWN_SETTLEMENT.transaction,
      },
    }),
  );
  writeFileSync(
    join(root, COMMITTED.buyerStop),
    JSON.stringify({
      state: "stop",
      reason: "no wallet",
      mustNotRun: ["any facilitator /verify or /settle call"],
    }),
  );

  const pin = pinCommittedArtifacts(root);
  assert.equal(pin.ok, false);
  assert.ok(
    pin.errors.some((item) => item.code === "pin_mismatch" && String(item.path).includes("amount")),
    JSON.stringify(pin.errors, null, 2),
  );
});
