#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const archiveRoot = path.resolve(args["archive-root"] || process.env.USEFUL_JOBS_ROOT || "");
if (!archiveRoot || !fs.existsSync(path.join(archiveRoot, "bin", "useful-jobs.mjs"))) {
  process.stderr.write("Set --archive-root=/path/to/extracted/useful-jobs-1.4.0 or USEFUL_JOBS_ROOT.\n");
  process.exit(2);
}
const archivePackage = JSON.parse(fs.readFileSync(path.join(archiveRoot, "package.json"), "utf8"));
assert.equal(archivePackage.name, "useful-jobs");
assert.equal(archivePackage.version, "1.4.0");
const outputRoot = args["out-dir"] ? path.resolve(args["out-dir"]) : fs.mkdtempSync(path.join(os.tmpdir(), "cw10-schema-"));
fs.mkdirSync(outputRoot, { recursive: true });

const pairRoot = path.join(root, "fixtures", "upstream", "organization-renamed");
const before = path.join(pairRoot, "before", "schema.json");
const after = path.join(pairRoot, "after", "schema.json");
const used = path.join(root, "fixtures", "used.json");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "manifest.json"), "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(sha256(before), manifest.source.sha256.beforeSchema);
assert.equal(sha256(after), manifest.source.sha256.afterSchema);
assert.equal(
  sha256(path.join(root, "fixtures", "source-examples", "current-renamed.payload.json")),
  manifest.source.sha256.currentRenamedExample,
);
assert.equal(
  sha256(path.join(root, "fixtures", "source-examples", "current-member-added.payload.json")),
  manifest.source.sha256.currentMemberAddedExample,
);
const driftOut = path.join(outputRoot, "engine");
const run = spawnSync(process.execPath, [
  path.join(archiveRoot, "bin", "useful-jobs.mjs"),
  "run",
  "json-schema-webhook-drift",
  "--before", before,
  "--after", after,
  "--used", used,
  "--out-dir", driftOut,
], { encoding: "utf8" });
if (run.status !== 0) {
  process.stderr.write(run.stdout);
  process.stderr.write(run.stderr);
  process.exit(run.status ?? 1);
}
const engineStdout = JSON.parse(run.stdout);
const drift = JSON.parse(fs.readFileSync(path.join(driftOut, "drift-brief.json"), "utf8"));

function validatorFor(side) {
  const dir = path.join(root, "fixtures", "upstream", "organization-renamed", side);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of fs.readdirSync(path.join(dir, "common"))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, "common", name), "utf8")));
  }
  return ajv.compile(JSON.parse(fs.readFileSync(path.join(dir, "schema.json"), "utf8")));
}

const validateBefore = validatorFor("before");
const validateAfter = validatorFor("after");
const payloadNames = ["saved-membership.json", "migrated-changes.json"];
const witness = {};
for (const name of payloadNames) {
  const payload = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "payloads", name), "utf8"));
  const beforeValid = validateBefore(payload);
  const beforeErrors = validateBefore.errors;
  const afterValid = validateAfter(payload);
  const afterErrors = validateAfter.errors;
  witness[name] = {
    beforeValid,
    afterValid,
    beforeErrors,
    afterErrors,
  };
}

assert.equal(engineStdout.status, manifest.expected.engine.status);
assert.equal(engineStdout.breaking, manifest.expected.engine.breaking);
assert.equal(engineStdout.unknown, manifest.expected.engine.unknown);
for (const [name, expected] of Object.entries(manifest.expected.witnesses)) {
  assert.equal(witness[name].beforeValid, expected.before, `${name} before validity`);
  assert.equal(witness[name].afterValid, expected.after, `${name} after validity`);
}

const report = {
  schema: "cw10.real-schema-consumer.report.v1",
  ok: true,
  source: manifest.source,
  archive: {
    version: "1.4.0",
    cli: "bin/useful-jobs.mjs",
    result: {
      status: engineStdout.status,
      breaking: engineStdout.breaking,
      compatible: engineStdout.compatible,
      unknown: engineStdout.unknown,
      termsVersion: engineStdout.termsVersion
    }
  },
  witness,
  decision: {
    stoppedWorking: ["saved-membership.json"],
    minimalMigration: manifest.migration,
    effect: "The before-valid payload becomes current-valid after replacing membership with changes.login.from.",
    engineDisposition: "confirmed-false-negative: released 1.4.0 reports informational with zero breaking rows"
  },
  coverage: manifest.coverage
};
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, outputRoot, engine: report.archive.result, witnesses: Object.fromEntries(Object.entries(witness).map(([name, value]) => [name, { before: value.beforeValid, after: value.afterValid }])) }, null, 2)}\n`);
