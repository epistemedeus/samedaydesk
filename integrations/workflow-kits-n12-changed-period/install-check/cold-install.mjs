/**
 * Cold-consumer install check. Packs this kit with `npm pack`, installs the tarball into
 * a fresh temporary project with `npm install --no-audit --no-fund <tgz>`, then, from
 * that project only, runs the bin and a fresh-operator flow through the public exports.
 *
 * Run on a VM: `npm run test:install`. It is not part of `npm test` and no test imports
 * it. It skips with a message when npm is not available. Zero dependencies, so the
 * install needs no registry access.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { RECORDED } from "./recorded.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function npmCommand() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) return { cmd: process.execPath, pre: [process.env.npm_execpath] };
  const probe = spawnSync("npm", ["--version"], { encoding: "utf8" });
  return probe.status === 0 ? { cmd: "npm", pre: [] } : null;
}
const npm = npmCommand();

const CONSUMER = `
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIENT_ENDPOINT, REQUEST_KIND, artifactDigests, createChangedPeriodEndpoint, kitPath, mappingRegistry,
  runNativeControl, runScenario, simulateN8n, simulateMake, validateMappingRegistry,
} from "${pkg.name}";

const NAME = "${pkg.name}";
const pkgRoot = dirname(fileURLToPath(import.meta.resolve(NAME + "/package.json")));
const json = (rel) => JSON.parse(readFileSync(join(pkgRoot, rel), "utf8"));
const out = { pkgRoot, digests: artifactDigests(), kitPathInside: kitPath("n8n/changed-period.workflow.json").startsWith(pkgRoot) };

out.registryValid = validateMappingRegistry(mappingRegistry()).ok;

// Fresh operator, n8n: period N, then the changed period with the old mapping, then v2.
const ep = createChangedPeriodEndpoint({ clock: "2026-11-12T10:30:00.000Z" });
const n8n = json("n8n/changed-period.workflow.json");
const a = simulateN8n(n8n, { body: json("fixtures/period-n.request.json"), endpoint: ep });
const b = simulateN8n(n8n, { body: json("fixtures/period-n-plus-1.unadapted.request.json"), endpoint: ep });
const c = simulateN8n(n8n, { body: json("fixtures/period-n-plus-1.rerun.request.json"), endpoint: ep });
const d = simulateN8n(n8n, { body: json("fixtures/period-n-plus-1.rerun.request.json"), endpoint: ep });
out.fresh = {
  periodN: [a.status, a.response.code, a.response.body.summary.ready],
  unadapted: [b.response.body.summary.exceptions, b.response.body.records[0].exception.code, b.response.body.records[0].exception.fieldPath, /new mappingVersion/.test(b.response.body.records[0].exception.suggestedAction)],
  adapted: [c.status, c.response.body.summary.ready, c.response.body.records[4].exception.code],
  rerun: [d.response.body.summary.alreadyApplied, d.response.body.summary.ready],
  effects: ep.externalEffects(),
  terms: [...new Set(ep.receipts.snapshot().map((r) => r.periodId + "@" + r.termsVersion.slice(7, 15)))],
};

// Make on the same request shape.
const ep2 = createChangedPeriodEndpoint({ clock: "2026-11-12T10:30:00.000Z" });
const make = json("make/changed-period.blueprint.json");
const m = simulateMake(make, { body: json("fixtures/period-n.request.json"), endpoint: ep2 });
out.make = [m.status, m.response.code, ep2.externalEffects()];

const runs = Object.fromEntries(["make", "n8n", "direct"].map((r) => [r, runScenario(r)]));
out.scenario = Object.fromEntries(Object.entries(runs).map(([r, run]) => [r, [run.externalEffects, run.maxAppliesPerKey]]));
out.sameReceipts = JSON.stringify(runs.make.receipts) === JSON.stringify(runs.n8n.receipts) && JSON.stringify(runs.n8n.receipts) === JSON.stringify(runs.direct.receipts);
out.native = runNativeControl().steps.laterSchemaChange.exception;
out.endpoint = CLIENT_ENDPOINT;
out.kind = REQUEST_KIND;
process.stdout.write(JSON.stringify(out));
`;

test("cold consumer: npm pack, npm install of the tarball, bin and a fresh-operator changed period", { skip: npm ? false : "npm is not available on this host; run `npm run test:install` on the VM" }, () => {
  const tmp = mkdtempSync(join(tmpdir(), "sds-wk-n12-cp-install-"));
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
    for (const rel of [RECORDED.make.path, RECORDED.n8n.path, "index.mjs", "bin/workflow-kits-n12-changed-period.mjs", "config/mapping-registry.json", "EFFORT.json", "OBSERVATIONS.json", "README.md", "vendor/PINS.json", "vendor/payment-rail/recurring-journey/journey.mjs", "package.json"]) {
      assert.ok(files.includes(rel), `tarball has ${rel}`);
    }
    for (const f of files) assert.ok(!f.startsWith("test/") && !f.startsWith("install-check/"), `tarball excludes ${f}`);
    const tgz = join(packDir, packed[0].filename);

    const app = join(tmp, "consumer");
    mkdirSync(app);
    writeFileSync(join(app, "package.json"), `${JSON.stringify({ name: "cold-consumer", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`);
    run(["install", "--no-audit", "--no-fund", tgz], app);

    const bin = join(app, "node_modules", ".bin", "workflow-kits-n12-changed-period");
    const hashes = spawnSync(bin, ["hashes"], { cwd: app, encoding: "utf8" });
    assert.equal(hashes.status, 0, hashes.stderr);
    const digests = JSON.parse(hashes.stdout);
    for (const name of ["make", "n8n"]) {
      assert.equal(digests[name].sha256, RECORDED[name].sha256, name);
      assert.equal(digests[name].bytes, RECORDED[name].bytes, name);
    }
    assert.equal(spawnSync(bin, ["validate"], { cwd: app }).status, 0);
    const sim = spawnSync(bin, ["simulate", "make"], { cwd: app, encoding: "utf8" });
    assert.equal(sim.status, 0, sim.stderr);
    assert.equal(JSON.parse(sim.stdout).maxAppliesPerKey, 1);
    assert.equal(spawnSync(bin, ["nope"], { cwd: app }).status, 2);

    writeFileSync(join(app, "check.mjs"), CONSUMER);
    const res = spawnSync(process.execPath, ["check.mjs"], { cwd: app, encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.ok(out.pkgRoot.startsWith(join(app, "node_modules")), "imports resolve inside the consumer's node_modules");
    assert.ok(!out.pkgRoot.startsWith(root), "imports do not resolve to the source tree");
    assert.equal(out.kitPathInside, true);
    assert.equal(out.digests.n8n.sha256, RECORDED.n8n.sha256);
    assert.equal(out.registryValid, true);
    assert.deepEqual(out.fresh, {
      periodN: ["success", 200, 3],
      unadapted: [5, "schema_changed", "records[0].captureRef", true],
      adapted: ["success", 4, "ingestion_not_permitted"],
      rerun: [4, 0],
      effects: 7,
      terms: ["period-N@a7d5f8c4", "period-N+1@23b6d18b"],
    });
    assert.deepEqual(out.make, ["success", 200, 3]);
    assert.deepEqual(out.scenario, { make: [7, 1], n8n: [7, 1], direct: [7, 1] });
    assert.equal(out.sameReceipts, true);
    assert.equal(out.native, "schema_changed");
    assert.match(out.endpoint, /client\.example\.invalid/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
