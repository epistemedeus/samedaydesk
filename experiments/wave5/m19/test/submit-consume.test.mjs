import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collectEvents, selectContribution } from "../lib/events.mjs";
import {
  applyProtectedSurface,
  consumeLatest,
  independentlyConsumed,
  submitContribution,
} from "../lib/integrate.mjs";
import { reportError } from "../lib/integrate.mjs";
import { outreachRefusal } from "../lib/refuse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/distribute.mjs");

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("dry-run submit is transport-ok and not published", async () => {
  const events = await collectEvents();
  const contribution = await selectContribution(events);
  const submitted = await submitContribution(contribution);
  assert.equal(submitted.transport.ok, true);
  assert.equal(submitted.transport.apply, "dry-run");
  assert.equal(submitted.delivery.published, false);
  assert.equal(submitted.delivery.complete, false);
  assert.equal(submitted.submitted.version, "1.23.40");
  assert.equal(submitted.submitted.bodyMatchesSelection, true);
  assert.equal(submitted.analysis.classification, "stale");
});

test("fixture --apply on mcp-registry stays fixture-write-not-live", async () => {
  const events = await collectEvents();
  const contribution = await selectContribution(events);
  const submitted = await submitContribution(contribution, { apply: true });
  assert.equal(submitted.transport.apply, "sent");
  assert.equal(submitted.transport.sentCount, 1);
  assert.equal(submitted.delivery.published, false);
  assert.equal(submitted.delivery.reason, "fixture-write-not-live");
});

test("consume presence listing does not match the submitted origin version", async () => {
  const events = await collectEvents();
  const contribution = await selectContribution(events);
  const consume = await consumeLatest({ snapshot: "presence-fixture-2026-09-03" });
  assert.equal(consume.listing.version, "1.23.36");
  assert.equal(independentlyConsumed(contribution, consume), false);
  const consumer = await consumeLatest({ snapshot: "mcp-registry-consumer-2026-09-09" });
  assert.equal(consumer.listing.version, "1.23.45");
  assert.equal(consumer.listing.isLatest, true);
  assert.equal(independentlyConsumed(contribution, consumer), false);
});

test("bazaar --apply is a protected-field valid refusal, not a crash", async () => {
  const report = await applyProtectedSurface("bazaar");
  assert.equal(report.refused, true);
  assert.equal(report.transport.ok, true);
  assert.equal(report.transport.apply, "refused");
  assert.equal(report.analysis.kind, "valid-refusal");
  assert.match(report.analysis.refuseReason, /protected field/);
  assert.equal(report.sent.length, 0);
});

test("live publish is a valid refusal", async () => {
  const events = await collectEvents();
  const contribution = await selectContribution(events);
  const report = reportError(
    await submitContribution(contribution, { live: true }).catch((err) => err),
  );
  assert.equal(report.refused, true);
  assert.equal(report.code, "live-publish-not-authorized");
  assert.equal(report.transport.ok, true);
  assert.equal(report.analysis.kind, "valid-refusal");
});

test("CLI consume --naive-unfiltered refuses historical first hit", () => {
  const r = runCli(["consume", "--naive-unfiltered"]);
  assert.equal(r.status, 2, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.refused, true);
  assert.equal(body.code, "unfiltered-search-not-latest");
  assert.equal(body.detail.listedVersion, "1.0.0");
  assert.match(body.detail.listedRemote, /railway/);
});

test("CLI scan is closed generic outreach, not a crash", () => {
  const r = runCli(["scan"]);
  assert.equal(r.status, 2, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.refused, true);
  assert.equal(body.code, "closed-generic-outreach");
  assert.equal(body.analysis.kind, "valid-refusal");
  assert.equal(body.transport.ok, true);
});

test("outreachRefusal helper names closed kinds", () => {
  const err = outreachRefusal("grexal-marketplace-scan");
  assert.equal(err.code, "closed-generic-outreach");
  assert.ok(err.detail.closed.includes("grexal-marketplace-scan"));
});
