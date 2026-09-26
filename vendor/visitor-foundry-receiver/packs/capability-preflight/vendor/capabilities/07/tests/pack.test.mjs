import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  PACK_STATUS,
  REDACTED,
  REUSE_FROM,
  SCHEMA,
  buildBuyerContextPack,
  validateBuyerContextPackInput,
  validateEndpointScope,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const FIXED = () => Date.parse("2026-09-10T19:00:00.000Z");

test("schema + reuse markers", () => {
  assert.equal(SCHEMA, "pilot.r2.capabilities.buyer_context_pack.v1");
  assert.deepEqual([...REUSE_FROM], ["R2-CAPABILITIES-01"]);
  assert.ok(FORBIDDEN_FIELDS.includes("buyerCount"));
  assert.ok(FORBIDDEN_FIELDS.includes("revenue"));
  assert.ok(FORBIDDEN_FIELDS.includes("claimAuthority"));
  assert.ok(FORBIDDEN_FIELDS.includes("escrow"));
  assert.ok(FORBIDDEN_FIELDS.includes("custody"));
});

test("positive: ready pack includes only allowed fields and redacts secrets", () => {
  const out = buildBuyerContextPack(load("positive.json"), { clock: FIXED });
  assert.equal(out.schema, SCHEMA);
  assert.equal(out.status, PACK_STATUS.READY);
  assert.equal(out.generatedAt, "2026-09-10T19:00:00.000Z");
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  assert.equal(out.endpointScope.method, "POST");
  assert.equal(out.endpointScope.url, "https://example.com/api/v1/observe");
  assert.deepEqual(out.endpointScope.allowedHeaders, ["Authorization", "Content-Type"]);

  const ids = out.includedInputs.map((i) => i.id).sort();
  assert.deepEqual(ids, ["Authorization", "Content-Type", "label", "source_uri"].sort());

  const auth = out.includedInputs.find((i) => i.id === "Authorization");
  assert.equal(auth.secret, true);
  assert.equal(auth.value, REDACTED);

  assert.ok(out.excludedExtras.some((e) => e.id === "bonus_noise"));
  assert.ok(out.excludedExtras.some((e) => e.id === "X-Debug-Extra"));
  assert.equal(out.missingInputs.length, 0);

  assert.equal(out.dryRunReadback.method, "POST");
  assert.equal(out.dryRunReadback.headers.Authorization, REDACTED);
  assert.equal(out.dryRunReadback.headers["Content-Type"], "application/json");
  assert.equal(out.dryRunReadback.bodyPreview.source_uri, "https://example.com/docs/changelog");
  assert.equal(out.dryRunReadback.bodyPreview.label, "changelog-observe");
  assert.equal(Object.prototype.hasOwnProperty.call(out.dryRunReadback.headers, "X-Debug-Extra"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "buyerCount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "revenue"), false);
  assert.match(out.mutationBoundary, /Root owns merge/i);
});

test("positive requiredInputs-only shape (Cap01 mirror, no capabilityContract)", () => {
  const out = buildBuyerContextPack(load("positive-required-inputs-only.json"), { clock: FIXED });
  assert.equal(out.status, PACK_STATUS.READY);
  assert.equal(out.capabilityId, "cap01-shaped-inputs.v1");
  const token = out.includedInputs.find((i) => i.id === "api_token");
  assert.equal(token.secret, true);
  assert.equal(token.value, REDACTED);
  assert.equal(out.dryRunReadback.bodyPreview.api_token, REDACTED);
  assert.equal(out.dryRunReadback.bodyPreview.source_uri, "https://example.com/docs");
  assert.ok(out.excludedExtras.some((e) => e.id === "noise"));
});

test("partial: missing required secret yields partial_input; never invents secret", () => {
  const out = buildBuyerContextPack(load("partial-missing-secret.json"), { clock: FIXED });
  assert.equal(out.status, PACK_STATUS.PARTIAL_INPUT);
  assert.ok(out.missingInputs.some((m) => m.id === "Authorization" && m.secret === true));
  assert.ok(out.includedInputs.some((i) => i.id === "query"));
  assert.equal(
    out.includedInputs.some((i) => i.id === "Authorization"),
    false,
  );
  assert.ok(out.excludedExtras.some((e) => e.id === "stray"));
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  // Optional hint missing — omitted, not invented
  assert.equal(
    out.includedInputs.some((i) => i.id === "hint"),
    false,
  );
  assert.equal(
    out.missingInputs.some((m) => m.id === "hint"),
    false,
  );
});

test("negative: forbidden buyerCount/revenue reject", () => {
  const out = buildBuyerContextPack(load("negative-forbidden.json"), { clock: FIXED });
  assert.equal(out.status, PACK_STATUS.REJECTED);
  assert.equal(out.error.code, ERROR_CODES.FORBIDDEN_CLAIM);
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  assert.equal(out.dryRunReadback, null);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "buyerCount"), false);
});

test("negative: endpointScope must not embed secret values", () => {
  const out = buildBuyerContextPack(load("negative-endpoint-secrets.json"), { clock: FIXED });
  assert.equal(out.status, PACK_STATUS.REJECTED);
  assert.equal(out.error.code, ERROR_CODES.FORBIDDEN_ENDPOINT);
  assert.match(out.error.message, /authorization/i);
});

test("validateEndpointScope: names only; rejects Name: value", () => {
  assert.throws(
    () =>
      validateEndpointScope({
        method: "GET",
        url: "https://example.com/x",
        allowedHeaders: ["Authorization: Bearer x"],
      }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_ENDPOINT,
  );
});

test("validate: accepts Cap01-shaped capabilityContract.inputs", () => {
  const normalized = validateBuyerContextPackInput(load("positive.json"));
  assert.equal(normalized.taskId, "demo-buyer-pack-positive");
  assert.equal(normalized.descriptors.length, 4);
  assert.equal(normalized.endpointScope.method, "POST");
  assert.ok(normalized.descriptors.some((d) => d.id === "Authorization" && d.secret === true));
});

test("secret cleartext never appears in dry-run readback JSON", () => {
  const out = buildBuyerContextPack(load("positive.json"), { clock: FIXED });
  const dumped = JSON.stringify(out);
  assert.equal(dumped.includes("sk-synthetic-demo-token-not-real"), false);
  assert.ok(dumped.includes(REDACTED));
});

test("rejected when capabilityContract and requiredInputs both absent", () => {
  const out = buildBuyerContextPack(
    {
      taskId: "no-inputs",
      callerProvided: {},
      endpointScope: { method: "GET", url: "https://example.com/x", allowedHeaders: [] },
    },
    { clock: FIXED },
  );
  assert.equal(out.status, PACK_STATUS.REJECTED);
  assert.equal(out.error.code, ERROR_CODES.MISSING_REQUIREMENT);
});
