import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { EXECUTION_CONTRACT } from "../lib/pins.mjs";
import { prefixLayout } from "../lib/install.mjs";
import { classifyConsumerOutcome, runD01Cli, runD07Cli } from "../lib/invoke.mjs";
import { extractFeedSamples, sharedPrefix, stageCaller } from "./helpers.mjs";

test("D01 missing required inputs is a truthful refusal, not an engine crash", () => {
  const prefix = sharedPrefix();
  const result = runD01Cli(prefix, ["run", "vendor-budget-impact"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.json?.ok, false);
  assert.equal(result.json?.refused, true);
  assert.equal(result.json?.code, "missing-required-inputs");
  assert.equal(result.json?.transport, "rejected");
  assert.equal(result.json?.analysis?.outcome, "not-run");
  assert.equal(result.json?.sold, false);
  const classified = classifyConsumerOutcome(result.json);
  assert.equal(classified.transport, "rejected");
  assert.notEqual(classified.transport, "engine-crash");
});

test("D01 unknown job is refused without claiming delivery", () => {
  const prefix = sharedPrefix();
  const result = runD01Cli(prefix, ["run", "not-a-catalog-job"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.json?.code, "unknown-job");
  assert.equal(result.json?.ok, false);
  assert.equal(result.json?.delivery?.complete ?? false, false);
});

test("feed-agenda identical samples are a valid informational analysis with complete artifacts", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const samples = extractFeedSamples(prefix, join(layout.work, "feed-samples"));
  const outDir = join(layout.work, "d01-feed");
  const result = runD01Cli(prefix, [
    "run",
    "feed-agenda",
    "--before",
    samples.before,
    "--after",
    samples.after,
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.json?.ok, true);
  assert.equal(result.json?.contract, EXECUTION_CONTRACT);
  assert.equal(result.json?.transport, "ok");
  assert.equal(result.json?.delivery?.complete, true);
  const analysis = result.json?.analysis?.outcome || result.json?.analysis?.status;
  assert.equal(analysis, "informational");
  assert.ok(existsSync(join(outDir, "agenda.json")));
  assert.ok(existsSync(join(outDir, "agenda.ics")));
  const classified = classifyConsumerOutcome(result.json);
  assert.equal(classified.transport, "ok");
  assert.equal(classified.validDomainRefusal, true);
});

test("export terms hash is not forced equal to the D01 receipt digest", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const caller = stageCaller(prefix);
  const outDir = join(layout.work, "hash-budget");
  const d01 = runD01Cli(prefix, [
    "run",
    "vendor-budget-impact",
    "--before",
    caller.before,
    "--after",
    caller.after,
    "--out-dir",
    outDir,
  ]);
  assert.equal(d01.json?.ok, true);
  const exported = runD07Cli(prefix, ["export", "--in-dir", outDir, "--out", join(layout.work, "hash-export")]);
  assert.equal(exported.json?.ok, true, exported.stderr || exported.stdout);
  const terms = exported.json?.termsVersion || exported.json?.enginePin;
  const receiptDigest = d01.json?.receipt?.inputsDigest;
  assert.ok(terms);
  assert.ok(receiptDigest);
  assert.notEqual(terms, receiptDigest);
  const manifest = JSON.parse(readFileSync(join(layout.work, "hash-export", "manifest.json"), "utf8"));
  assert.equal(manifest.schema, "samedaydesk.job-artifact-export.manifest.v1");
  assert.notEqual(manifest.schema, d01.json.receipt.schema);
});
