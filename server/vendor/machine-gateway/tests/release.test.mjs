import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Ajv from "ajv";
import { openapi } from "../src/contracts.mjs";
import { sampleInput } from "./helpers.mjs";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("dedicated machine manifest and existing-host configuration do not claim production activation or funded tests", () => {
  const manifest = read("../../../public/machine/machine-gateway.json");
  const deployment = read("../deploy/hostinger.json");
  assert.equal(manifest.state, "prepared-not-deployed");
  assert.equal(manifest.deployment.verifiedLiveBaseUrl, null);
  assert.equal(manifest.deployment.productionActivationPerformed, false);
  assert.equal(manifest.deployment.newSpendRequired, false);
  assert.equal(manifest.payments.liveFundMovementPerformed, false);
  assert.equal(manifest.payments.liveSettlementVerified, false);
  assert.equal(deployment.activated, false); assert.equal(deployment.paymentsEnabled, false);
  assert.equal(deployment.mountPrefix, "/api/machine-gateway");
  assert.equal(deployment.hostStartCommand, "node server/index.js");
  assert.equal(deployment.newServiceOrPlanRequired, false);
});

test("OpenAPI route inputs resolve and validate actual closed provider contracts", () => {
  const document = openapi();
  assert.deepEqual(read("../openapi.json"), document);
  const definitions = JSON.parse(JSON.stringify(document.components.schemas).replaceAll("#/components/schemas/", "#/definitions/"));
  const validate = new Ajv({ strict: true }).compile({ definitions, $ref: "#/definitions/quoteRequest" });
  assert.equal(validate({ routeId: "lockfile.delta", input: sampleInput }), true);
  assert.equal(validate({ routeId: "http.capture", input: { url: "https://example.com/" } }), true);
  assert.equal(validate({ routeId: "http.capture", input: { url: "https://example.com/", tenant: "other" } }), false);
  assert.equal(validate({ routeId: "unregistered", input: {} }), false);
  assert.deepEqual(document.paths["/v1/execute"].post.security, [{ tenantBearer: [] }]);
  assert.equal(document["x-release-state"], "prepared-not-deployed");
});

test("vendored source hashes and shipped SDK lock match their exact pins", () => {
  const source = read("../SOURCE.json"), lock = read("../npm-shrinkwrap.json"), pkg = read("../package.json");
  assert.equal(source.vendor.sha, "82a51274e7dc7a7600b90f1317a6be6b28442592");
  assert.equal(source.inspected.find(i => i.repository === "epistemedeus/samedaydesk").sha, "d8cea059213e06d2f263be67f82e498f8052a50f");
  for (const file of source.vendor.files) {
    const bytes = readFileSync(new URL(`../${file.path}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
  }
  assert.equal(pkg.dependencies["@x402/core"], "2.16.0");
  assert.equal(lock.packages["node_modules/@x402/core"].version, "2.16.0");
  assert.equal(lock.packages["node_modules/@x402/core"].integrity, source.paymentSdk.integrity);
  assert.ok(pkg.files.includes("npm-shrinkwrap.json"));
});
