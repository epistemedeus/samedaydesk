import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collectEvents, selectContribution } from "../lib/events.mjs";
import { invokeSelectedOffer, runJourney } from "../lib/integrate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/distribute.mjs");

function runCli(args, timeout = 180_000) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("wrapper CLI invoke delivers vendor-budget-impact artifacts and is not a sale", { timeout: 120_000 }, () => {
  const result = invokeSelectedOffer();
  assert.equal(result.transport.ok, true, JSON.stringify(result));
  assert.equal(result.analysis.kind, "completed");
  assert.equal(result.delivery.complete, true);
  assert.equal(result.sold, false);
  assert.equal(result.fundingState, "reserved-fixture");
  assert.equal(result.ok, true);
  assert.equal(result.testedInterface, "server/paid-useful-jobs/bin/cli.mjs");
});

test("SAMPLE --example invoke is a valid refusal, not a distributed contribution", { timeout: 120_000 }, () => {
  const result = invokeSelectedOffer({ example: true });
  assert.equal(result.refused, true);
  assert.equal(result.sample, true);
  assert.equal(result.analysis.kind, "valid-refusal");
  assert.equal(result.code, "sample-not-a-sale");
  assert.equal(result.sold, false);
  assert.equal(result.ok, false);
});

test("CLI journey submits, consumes, and invokes without claiming live publish", { timeout: 180_000 }, () => {
  const r = runCli(["journey"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "journey");
  assert.equal(body.contribution.id, "mcp-registry-version-only");
  assert.equal(body.contribution.listingAccepted, true);
  assert.equal(body.contribution.independentlyConsumed, false);
  assert.equal(body.contribution.submittedVersion, "1.23.40");
  assert.equal(body.contribution.listedVersion, "1.23.36");
  assert.equal(body.contribution.consumerLatestVersion, "1.23.45");
  assert.equal(body.submit.delivery.published, false);
  assert.equal(body.payment.sold, false);
  assert.equal(body.events.consumerNaiveFirstLooksCurrent, false);
  assert.equal(body.invoke.ok, true);
  assert.equal(body.invoke.sold, false);
  assert.ok(body.remainingLiveSteps.some((s) => /publish/i.test(s)));
});

test("library journey matches CLI contribution identity", { timeout: 180_000 }, async () => {
  const events = await collectEvents();
  const contribution = await selectContribution(events);
  const journey = await runJourney();
  assert.equal(journey.contribution.submittedVersion, contribution.request.body.version);
  assert.notEqual(journey.contribution.submittedVersion, contribution.consumerLatestVersion);
  assert.equal(journey.ok, true);
});
