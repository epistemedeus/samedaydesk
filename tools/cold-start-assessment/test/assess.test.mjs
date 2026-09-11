import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BIN_PATH, PACKAGE_ROOT } from "../src/paths.mjs";
import { main, parseArgs } from "../src/assess.mjs";
import { SCHEMA, PROPOSED_PRICE, PROPOSED_PRICE_ATOMIC } from "../src/catalog.mjs";
import { createFetcher } from "../src/fetch.mjs";
import { captureIo, ensureFixtures, fixtureDir } from "./helpers.mjs";

ensureFixtures();

function runBin(args, cwd = PACKAGE_ROOT) {
  return spawnSync(process.execPath, [BIN_PATH, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function readOut(dir) {
  const jsonPath = join(dir, "assessment.json");
  const mdPath = join(dir, "explanation.md");
  assert.equal(existsSync(jsonPath), true, "assessment.json missing");
  assert.equal(existsSync(mdPath), true, "explanation.md missing");
  return {
    assessment: JSON.parse(readFileSync(jsonPath, "utf8")),
    explanation: readFileSync(mdPath, "utf8"),
  };
}

test("CLI help describes fixture journey, live optional, and no payment", async () => {
  const io = captureIo();
  const code = await main(["--help"], io);
  assert.equal(code, 0);
  assert.match(io.out, /--fixture-dir fixtures\/ok/);
  assert.match(io.out, /--out \/tmp\/w2-06-out/);
  assert.match(io.out, /--live/);
  assert.match(io.out, /cannot settle/i);
  assert.match(io.out, /No credentials/);
  assert.doesNotMatch(io.out, /GITHUB_TOKEN|PAYMENT-SIGNATURE/);
});

test("literal fixture journey writes usable assessment files", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "w2-06-ok-"));
  const io = captureIo();
  const code = await main(["--fixture-dir", fixtureDir("ok"), "--out", outDir], io);
  assert.equal(code, 0, io.out + io.err);
  const { assessment, explanation } = readOut(outDir);
  assert.equal(assessment.schema, SCHEMA);
  assert.equal(assessment.ok, true);
  assert.equal(assessment.usableReproduction, true);
  assert.equal(assessment.label, "usable_reproduction");
  assert.equal(assessment.purchaseAuthority, false);
  assert.equal(assessment.fundingState, "fixture");
  assert.equal(assessment.actualCompletion, false);
  assert.equal(assessment.sold, false);
  assert.equal(assessment.cannotSettle, true);
  assert.equal(assessment.publishedToLiveCatalog, false);
  assert.equal(assessment.githubCredentialsRequired, false);
  assert.equal(assessment.paymentHeadersSent, false);
  assert.deepEqual(assessment.proposedPrice, PROPOSED_PRICE);
  assert.equal(assessment.proposedPriceAtomic, PROPOSED_PRICE_ATOMIC);
  assert.equal(assessment.proposedPrice.network, "fixture");
  assert.equal(assessment.acquisition.extracted, true);
  assert.equal(assessment.commands.length, 3);
  const lines = assessment.commands.map((row) => row.commandLine);
  assert.deepEqual(lines, [
    "node bin/capability-consumer-kit.mjs status",
    "node bin/capability-consumer-kit.mjs cold-start --probe",
    "node bin/capability-consumer-kit.mjs journey",
  ]);
  for (const command of assessment.commands) {
    assert.equal(command.exitCode, 0);
    assert.match(command.stdoutSha256, /^[a-f0-9]{64}$/);
  }
  assert.match(explanation, /node bin\/capability-consumer-kit\.mjs status/);
  assert.match(explanation, /node bin\/capability-consumer-kit\.mjs cold-start --probe/);
  assert.match(explanation, /node bin\/capability-consumer-kit\.mjs journey/);
  assert.match(explanation, /usable reproduction/i);
  assert.doesNotMatch(explanation, /actual_completion/);
  assert.doesNotMatch(io.out, /GITHUB_TOKEN|ghp_|PAYMENT-SIGNATURE/);
});

test("spawned bin with --fixture-dir fixtures/ok --out writes files", () => {
  const outDir = mkdtempSync(join(tmpdir(), "w2-06-bin-"));
  const spawned = runBin(["--fixture-dir", "fixtures/ok", "--out", outDir]);
  assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
  const { assessment } = readOut(outDir);
  assert.equal(assessment.ok, true);
  assert.equal(assessment.usableReproduction, true);
});

test("wrong digest is not marked usable and does not extract", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "w2-06-digest-"));
  const io = captureIo();
  const code = await main(["--fixture-dir", fixtureDir("fail-digest"), "--out", outDir], io);
  assert.equal(code, 1);
  const { assessment } = readOut(outDir);
  assert.equal(assessment.usableReproduction, false);
  assert.equal(assessment.ok, false);
  assert.equal(assessment.acquisition.extracted, false);
  assert.equal(assessment.acquisition.stoppedBeforeExtract, true);
  assert.equal(assessment.acquisition.code, "digest_mismatch");
  assert.equal(assessment.label, "rejected");
  assert.equal(assessment.actualCompletion, false);
});

test("wrong size is not marked usable and does not extract", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "w2-06-size-"));
  const io = captureIo();
  const code = await main(["--fixture-dir", fixtureDir("fail-size"), "--out", outDir], io);
  assert.equal(code, 1);
  const { assessment } = readOut(outDir);
  assert.equal(assessment.usableReproduction, false);
  assert.equal(assessment.acquisition.extracted, false);
  assert.equal(assessment.acquisition.stoppedBeforeExtract, true);
  assert.equal(assessment.acquisition.code, "size_mismatch");
});

test("SAMPLE demo labelled actual_completion is rejected and not paid", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "w2-06-paid-"));
  const io = captureIo();
  const code = await main(["--fixture-dir", fixtureDir("fail-sample-paid"), "--out", outDir], io);
  assert.equal(code, 1);
  const { assessment, explanation } = readOut(outDir);
  assert.equal(assessment.usableReproduction, false);
  assert.equal(assessment.honesty.sampleLabelledAsPaidCompletion, true);
  assert.equal(assessment.actualCompletion, false);
  assert.equal(assessment.sold, false);
  assert.equal(assessment.honesty.paid, false);
  assert.equal(assessment.purchaseAuthority, false);
  assert.match(explanation, /not a paid/);
});

test("optional useful-jobs second target is a usable fixture reproduction", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "w2-06-jobs-"));
  const io = captureIo();
  const code = await main(
    ["--target", "useful-jobs", "--fixture-dir", fixtureDir("ok"), "--out", outDir],
    io,
  );
  assert.equal(code, 0, io.out);
  const { assessment, explanation } = readOut(outDir);
  assert.equal(assessment.ok, true);
  assert.equal(assessment.target.id, "useful-jobs");
  assert.equal(assessment.purchaseAuthority, false);
  assert.match(explanation, /node bin\/useful-jobs\.mjs list/);
  assert.match(explanation, /--example/);
});

test("settle flags are refused without sending payment headers", async () => {
  const io = captureIo();
  const code = await main(
    ["--fixture-dir", fixtureDir("ok"), "--out", "/tmp/unused", "--settle"],
    io,
  );
  assert.equal(code, 1);
  const payload = JSON.parse(io.out);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "live-settle-out-of-scope");
  assert.equal(payload.cannotSettle, true);
  assert.equal(payload.purchaseAuthority, false);
});

test("fetcher refuses GitHub hosts and payment headers", async () => {
  const fetcher = createFetcher({ mode: "fixture", fixtureDir: fixtureDir("ok") });
  await assert.rejects(
    () => fetcher.fetchUrl("https://github.com/epistemedeus/neomorphic-io/raw/main/x.tar.gz"),
    /GitHub/,
  );
  await assert.rejects(
    () =>
      fetcher.fetchUrl("https://neomorphic.io/downloads/capability-preflight/capability-preflight.tar.gz", {
        headers: { "PAYMENT-SIGNATURE": "00" },
      }),
    /payment_header_forbidden|refusing to send/,
  );
});

test("missing --out is an invocation error", async () => {
  const io = captureIo();
  const code = await main(["--fixture-dir", fixtureDir("ok")], io);
  assert.equal(code, 2);
  const payload = JSON.parse(io.out);
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /--out/);
});

test("parseArgs rejects combining live and fixture", () => {
  assert.throws(() => parseArgs(["--live", "--fixture-dir", "fixtures/ok", "--out", "/tmp/x"]), /do not combine/);
});

test("live flag is recognized without running DNS", () => {
  const options = parseArgs(["--live", "--target", "capability-preflight", "--out", "/tmp/x"]);
  assert.equal(options.live, true);
  assert.equal(options.target, "capability-preflight");
  assert.equal(options.out, "/tmp/x");
});
