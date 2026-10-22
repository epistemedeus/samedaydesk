import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  INTEGRATED_ENGINE_PIN,
  JOB_ID,
  MERCHANT_VERSION,
  PUBLIC_ARCHIVE_VERSION,
  PUBLIC_CATALOG_PIN,
  WRAPPER_ARCHIVE_VERSION,
} from "../lib/constants.mjs";
import { normalizeDescription, normalizeDiscovery, normalizeInvocation } from "../lib/normalize.mjs";
import {
  CALLER_AFTER,
  CALLER_BEFORE,
  OWNED,
  describeTo,
  discoverTo,
  invokeTo,
  ownedTmp,
  writeJson,
} from "./helpers.mjs";

test("discover names a linked chain and keeps source captures distinct from hosted evidence", () => {
  const dir = ownedTmp();
  const out = join(dir, "discovery.json");
  const result = discoverTo(out);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const discovery = result.json;
  assert.equal(discovery.schema, "cw69.machine-offer-discovery.v1");
  assert.equal(discovery.jobId, JOB_ID);
  assert.equal(discovery.chain.status, "linked");
  assert.equal(discovery.chain.observedOffer.kind, "hosted-evidence");
  assert.equal(discovery.chain.workableTask.kind, "source-capture");
  assert.equal(discovery.chain.qualifiedActivation.status, "unknown");
  assert.equal(discovery.chain.usefulMerchantJob.status, "published-unpaid");
  assert.equal(discovery.identity.merchant.kind, "hosted-evidence");
  assert.equal(discovery.identity.engine.kind, "source-capture");
  assert.equal(discovery.identity.merchant.version, MERCHANT_VERSION);
  assert.equal(discovery.identity.merchant.isLatestAuthority, false);
  assert.equal(discovery.identity.merchant.getSupported, false);
  assert.equal(discovery.identity.publicArchive.version, PUBLIC_ARCHIVE_VERSION);
  assert.equal(discovery.identity.wrapperArchive.version, WRAPPER_ARCHIVE_VERSION);
  assert.equal(discovery.identity.engine.pinSha, INTEGRATED_ENGINE_PIN);
  assert.equal(discovery.identity.catalog.publicPinSha, PUBLIC_CATALOG_PIN);
  assert.equal(discovery.identity.pinsDistinct.publicPinEqualsIntegrated, false);
  assert.equal(discovery.acquisitions.costFloor, "unknown");
  assert.equal(discovery.acquisitions.monetaryMargin, "unknown");
  assert.equal(discovery.acquisitions.publishedPaidHttp.adapterSupportsThisAcquisition, false);
  assert.equal(discovery.illustrativePaidOutput.authority, false);
  assert.equal(discovery.purchaseAuthority, false);
  assert.equal(existsSync(out), true);
  const normalized = normalizeDiscovery(discovery);
  writeJson(join(OWNED, "evidence/normalized/discovery.json"), normalized);
});

test("describe+invoke with caller-authored lockfiles emit pin-delta for one named changed dependency", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  const descriptionPath = join(dir, "description.json");
  const outDir = join(dir, "out");
  assert.equal(discoverTo(discoveryPath).status, 0);
  const described = describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, descriptionPath);
  assert.equal(described.status, 0, described.stderr + described.stdout);
  assert.equal(described.json.sample.sample, false);
  const invoked = invokeTo(descriptionPath, CALLER_BEFORE, CALLER_AFTER, outDir);
  assert.equal(invoked.status, 0, invoked.stderr + invoked.stdout);
  const invocation = invoked.json;
  assert.equal(invocation.ok, true);
  assert.equal(invocation.jobId, JOB_ID);
  assert.equal(invocation.sold, false);
  assert.equal(invocation.purchaseAuthority, false);
  assert.equal(invocation.transport, "ok");
  assert.equal(invocation.pinDelta.status, "actionable");
  assert.equal(invocation.pinDelta.changed, 1);
  assert.deepEqual(invocation.pinDelta.changedNames, ["cw69-dependency"]);
  assert.equal(invocation.pinDelta.purchaseAuthority, false);
  const report = JSON.parse(readFileSync(join(outDir, "pin-delta.json"), "utf8"));
  assert.equal(report.schema, "samedaydesk.lockfile-pin-delta.v1");
  assert.equal(report.ok, true);
  assert.equal(existsSync(join(outDir, "pin-delta.md")), true);
  assert.match(readFileSync(join(outDir, "pin-delta.md"), "utf8"), /cw69-dependency/);
  assert.equal(invocation.engine.pinSha, INTEGRATED_ENGINE_PIN);
  writeJson(join(OWNED, "evidence/normalized/description.json"), normalizeDescription(described.json));
  writeJson(join(OWNED, "evidence/normalized/invocation.json"), normalizeInvocation(invocation));
});

test("identical caller input is informational useful output, not transport failure", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  const descriptionPath = join(dir, "description.json");
  const outDir = join(dir, "out");
  assert.equal(discoverTo(discoveryPath).status, 0);
  const described = describeTo(discoveryPath, CALLER_BEFORE, CALLER_BEFORE, descriptionPath);
  assert.equal(described.status, 0, described.stderr);
  const invoked = invokeTo(descriptionPath, CALLER_BEFORE, CALLER_BEFORE, outDir);
  assert.equal(invoked.status, 0, invoked.stderr + invoked.stdout);
  assert.equal(invoked.json.ok, true);
  assert.equal(invoked.json.transport, "ok");
  assert.equal(invoked.json.pinDelta.status, "informational");
  assert.equal(invoked.json.pinDelta.changed, 0);
});
