/**
 * Cold-consumer install check. Packs this kit with `npm pack`, installs the tarball into
 * a fresh temporary project with `npm install --no-audit --no-fund <tgz>`, then, from
 * that project only, imports the public exports and runs the bin.
 *
 * Run on a VM: `npm run test:install` (or `node --test install-check/cold-install.mjs`).
 * It is not part of `npm test`. It skips with a message when npm is not available.
 * The package has zero dependencies, so the install needs no registry access.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { RECORDED } from "./recorded.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));


function npmCommand() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return { cmd: process.execPath, pre: [process.env.npm_execpath] };
  }
  const probe = spawnSync("npm", ["--version"], { encoding: "utf8" });
  if (probe.status === 0) return { cmd: "npm", pre: [] };
  return null;
}

const npm = npmCommand();

const CONSUMER = `
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  artifactDigests, buildWorkflowRequest, createClientEndpoint, createKitEffects,
  fromMakeExecution, fromN8nExecution, runDirectJourney, runPeriod,
} from "${pkg.name}";

const NAME = "${pkg.name}";
const pkgRoot = dirname(fileURLToPath(import.meta.resolve(NAME + "/package.json")));
const read = (rel) => readFileSync(join(pkgRoot, rel));
const json = (rel) => JSON.parse(read(rel).toString("utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clock = "2026-11-12T10:30:00.000Z";
const out = { pkgRoot, resolved: {}, hashes: {}, digests: artifactDigests() };

for (const rel of ["make/record-to-accepted-output.blueprint.json", "n8n/record-to-accepted-output.workflow.json"]) {
  const file = fileURLToPath(import.meta.resolve(NAME + "/" + rel));
  out.resolved[rel] = file.startsWith(pkgRoot);
  const bytes = readFileSync(file);
  out.hashes[rel] = { bytes: bytes.length, sha256: sha(bytes) };
}

// Accepted period with a retryable uncommitted first attempt (n8n export), same key.
const effects = createKitEffects();
const uncommitted = runPeriod(fromN8nExecution(json("fixtures/n8n/execution-period-n-error.json"), { clock }), { effects });
const effectsAfterUncommitted = effects.appliedCount();
const accepted = runPeriod(fromN8nExecution(json("fixtures/n8n/execution-period-n.json"), { clock }), { effects });
const replay = runPeriod(fromN8nExecution(json("fixtures/n8n/execution-period-n.json"), { clock }), { effects });
out.retryable = {
  code: uncommitted.period.exception?.code ?? null,
  retryable: uncommitted.period.retry.retryable,
  effectsAfterUncommitted,
  acceptedDecision: accepted.period.decision,
  sameKey: uncommitted.period.retry.sameIdempotencyKey === accepted.period.idempotencyKey,
  replayRecovered: replay.period.retry.recovered,
  replaySameKey: replay.period.retry.sameIdempotencyKey === accepted.period.idempotencyKey,
  replaySecondEffect: replay.period.retry.secondEffect,
  effects: effects.appliedCount(),
};

// capture_stale through the client endpoint (Make request body), then the fresh capture.
const endpoint = createClientEndpoint({ clock });
const makeBody = json("fixtures/make/execution-period-n.json").modules["1"].output[0];
const staleCapture = json("vendor/payment-rail/recurring-journey/fixtures/synthetic-permitted-failure-stale.json");
const req = (period) => buildWorkflowRequest({ platform: "make", period, workflowOutput: period.capture?.payload ?? null, committed: true, clock });
const stale = endpoint.handle({ path: "/periods", body: req({ ...makeBody.period, capture: staleCapture }) });
const fresh = endpoint.handle({ path: "/periods", body: req(makeBody.period) });
const key = fresh.body.period.idempotencyKey;
const again = endpoint.handle({ path: "/periods", headers: { "Idempotency-Key": key }, body: req(makeBody.period) });
const h1 = endpoint.handle({ path: "/periods/accepted", headers: { "Idempotency-Key": key }, body: {} });
const h2 = endpoint.handle({ path: "/periods/accepted", headers: { "Idempotency-Key": key }, body: {} });
out.stale = {
  code: stale.body.period.exception?.code ?? null,
  retryable: stale.body.period.retry.retryable,
  freshDecision: fresh.body.period.decision,
  replayRecovered: again.body.period.retry.recovered,
  replaySameKey: again.body.period.idempotencyKey === key,
  replaySecondEffect: again.body.period.retry.secondEffect,
  handOff: [h1.status, h2.body.duplicate],
  effects: endpoint.effects.appliedCount(key),
  deliveries: endpoint.deliveredCount(key),
};

// Non-retryable exception.
const missing = { ...makeBody.period, caller: { ...makeBody.period.caller, continuationFileMissing: true } };
const nonRetryable = endpoint.handle({ path: "/periods", body: req(missing) });
out.nonRetryable = { code: nonRetryable.body.period.exception?.code ?? null, retryable: nonRetryable.body.period.retry.retryable, effectsTotal: endpoint.effects.appliedCount() };

// Changed-schema later period (Make export), then the explicit declared adapter.
const fx = createKitEffects();
const periodN = runPeriod(fromMakeExecution(json("fixtures/make/execution-period-n.json"), { clock }), { effects: fx });
const later = fromMakeExecution(json("fixtures/make/execution-schema-change.json"), { clock });
const unadapted = runPeriod(later, { effects: fx, periodN: periodN.result });
const effectsAfterChange = fx.appliedCount();
const declared = { ...later, schemaAdapter: { payloadVersion: "later-period-output-keys.v1" } };
const adapted = runPeriod(declared, { effects: fx, periodN: periodN.result });
const adaptedReplay = runPeriod(declared, { effects: fx, periodN: periodN.result });
out.schema = {
  code: unadapted.period.exception?.code ?? null,
  complete: unadapted.period.completeness.complete,
  effectsAfterChange,
  adaptedDecision: adapted.period.decision,
  adapter: adapted.adapter?.payloadVersion ?? null,
  newKey: adapted.period.idempotencyKey !== periodN.period.idempotencyKey,
  replayRecovered: adaptedReplay.period.retry.recovered,
  replaySecondEffect: adaptedReplay.period.retry.secondEffect,
  effects: fx.appliedCount(),
  effectsOnPeriodN: fx.appliedCount(periodN.period.idempotencyKey),
};

const direct = runDirectJourney();
out.direct = { acceptedPathSteps: direct.acceptedPathSteps, retrySteps: direct.retrySteps, duplicateEffects: direct.duplicateEffects };
process.stdout.write(JSON.stringify(out));
`;

test("cold consumer: npm pack, npm install of the tarball, public exports and bin", { skip: npm ? false : "npm is not available on this host; run `npm run test:install` on the VM" }, () => {
  const tmp = mkdtempSync(join(tmpdir(), "sds-wk-n12-install-"));
  const env = { ...process.env, npm_config_cache: join(tmp, "npm-cache"), npm_config_update_notifier: "false", npm_config_audit: "false", npm_config_fund: "false" };
  const run = (args, cwd) => {
    const res = spawnSync(npm.cmd, [...npm.pre, ...args], { cwd, env, encoding: "utf8", timeout: 120000 });
    assert.equal(res.status, 0, `npm ${args.join(" ")} failed:\n${res.stdout}\n${res.stderr}`);
    return res.stdout;
  };
  try {
    const packDir = join(tmp, "pack");
    mkdirSync(packDir);
    const packed = JSON.parse(run(["pack", "--json", "--pack-destination", packDir], root));
    const files = packed[0].files.map((f) => f.path);
    for (const rel of [RECORDED.make.path, RECORDED.n8n.path, "index.mjs", "bin/workflow-kits-n12.mjs", "bin/serve.mjs", "README.md", "LICENSE-NOTES.md", "vendor/flowassert/LICENSE", "vendor/flowassert/NOTICE", "vendor/PINS.json", "scripts/build-artifacts.mjs", "package.json"]) {
      assert.ok(files.includes(rel), `tarball has ${rel}`);
    }
    for (const f of files) {
      assert.ok(!f.startsWith("test/") && !f.startsWith("install-check/"), `tarball excludes ${f}`);
    }
    const tgz = join(packDir, packed[0].filename);

    const app = join(tmp, "consumer");
    mkdirSync(app);
    writeFileSync(join(app, "package.json"), `${JSON.stringify({ name: "cold-consumer", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`);
    run(["install", "--no-audit", "--no-fund", tgz], app);
    const installed = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
    assert.ok(installed.dependencies[pkg.name], "consumer package.json records the dependency");

    const bin = join(app, "node_modules", ".bin", "workflow-kits-n12");
    const hashes = spawnSync(bin, ["hashes"], { cwd: app, encoding: "utf8" });
    assert.equal(hashes.status, 0, hashes.stderr);
    const digests = JSON.parse(hashes.stdout);
    assert.equal(digests.make.sha256, RECORDED.make.sha256);
    assert.equal(digests.n8n.sha256, RECORDED.n8n.sha256);
    assert.equal(digests.n8n.bytes, RECORDED.n8n.bytes);
    const direct = spawnSync(bin, ["direct"], { cwd: app, encoding: "utf8" });
    assert.equal(direct.status, 0, direct.stderr);
    assert.equal(JSON.parse(direct.stdout).duplicateEffects, 0);
    const usage = spawnSync(bin, ["nope"], { cwd: app, encoding: "utf8" });
    assert.equal(usage.status, 2);

    writeFileSync(join(app, "check.mjs"), CONSUMER);
    const res = spawnSync(process.execPath, ["check.mjs"], { cwd: app, encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);

    assert.ok(out.pkgRoot.startsWith(join(app, "node_modules")), "imports resolve inside the consumer's node_modules");
    assert.ok(!out.pkgRoot.startsWith(root), "imports do not resolve to the source tree");
    for (const name of ["make", "n8n"]) {
      const rel = RECORDED[name].path;
      assert.equal(out.resolved[rel], true, rel);
      assert.equal(out.hashes[rel].sha256, RECORDED[name].sha256, rel);
      assert.equal(out.digests[name].sha256, RECORDED[name].sha256, `artifactDigests ${name}`);
    }

    assert.deepEqual(out.retryable, {
      code: "uncommitted", retryable: true, effectsAfterUncommitted: 0, acceptedDecision: "accept", sameKey: true,
      replayRecovered: true, replaySameKey: true, replaySecondEffect: false, effects: 1,
    });
    assert.deepEqual(out.stale, {
      code: "capture_stale", retryable: true, freshDecision: "accept", replayRecovered: true, replaySameKey: true,
      replaySecondEffect: false, handOff: [201, true], effects: 1, deliveries: 1,
    });
    assert.deepEqual(out.nonRetryable, { code: "continuation_file_missing", retryable: false, effectsTotal: 1 });
    assert.deepEqual(out.schema, {
      code: "schema_changed", complete: false, effectsAfterChange: 1, adaptedDecision: "accept",
      adapter: "later-period-output-keys.v1", newKey: true, replayRecovered: true, replaySecondEffect: false,
      effects: 2, effectsOnPeriodN: 1,
    });
    assert.deepEqual(out.direct, { acceptedPathSteps: 2, retrySteps: 1, duplicateEffects: 0 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
