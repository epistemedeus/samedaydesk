import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CLASSIFICATION_REASONS, IMPACT_CLASSES, SCHEMA, SCHEMA_VERSION } from "../lib/contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "webhook-drift.mjs");
const fx = (...parts) => path.join(ROOT, "fixtures", "compatibility", ...parts);

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 20_000,
  });
}

function parseStdout(r) {
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

function runCase(name) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `wd-co10-${name}-`));
  const r = run([
    "--before",
    fx(name, "before.json"),
    "--after",
    fx(name, "after.json"),
    "--used",
    fx(name, "used.json"),
    "--out-dir",
    outDir,
  ]);
  const summary = parseStdout(r);
  const briefPath = path.join(outDir, "drift-brief.json");
  const brief = fs.existsSync(briefPath) ? JSON.parse(fs.readFileSync(briefPath, "utf8")) : null;
  const md = fs.existsSync(path.join(outDir, "drift-brief.md"))
    ? fs.readFileSync(path.join(outDir, "drift-brief.md"), "utf8")
    : null;
  return { r, summary, brief, md, outDir };
}

function firstRow(brief, cls) {
  const rows = brief.impact[cls] || [];
  assert.equal(rows.length, 1, `expected one ${cls} row, got ${JSON.stringify(brief.impact)}`);
  return rows[0];
}

test("contract export lists the public classes and reasons consumers can pin", () => {
  assert.equal(SCHEMA, "samedaydesk.json-schema-webhook-drift.v1");
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(IMPACT_CLASSES.includes("compatible"), true);
  assert.equal(CLASSIFICATION_REASONS.booleanSchemaWeakened, "boolean-schema-weakened");
  assert.equal(CLASSIFICATION_REASONS.requiredRemoved, "required-removed");
  assert.equal(CLASSIFICATION_REASONS.numericTightened, "numeric-tightened");
});

test("CLI: false schema to true is compatible, exit 0, not a refuse", () => {
  const { r, summary, brief, md } = runCase("boolean-false-to-true");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.breaking, 0);
  assert.equal(summary.compatible, 1);
  assert.equal(summary.status, "informational");
  assert.equal(brief.ok, true);
  assert.equal(brief.schemaVersion, SCHEMA_VERSION);
  const row = firstRow(brief, "compatible");
  assert.equal(row.pointer, "/properties/x");
  assert.equal(row.class, "compatible");
  assert.equal(row.reason, "boolean-schema-weakened");
  assert.equal(row.before.kind, "boolean-schema");
  assert.equal(row.before.allows, false);
  assert.equal(row.after.kind, "boolean-schema");
  assert.equal(row.after.allows, true);
  assert.match(md, /boolean-schema-weakened/);
  assert.match(md, /Valid analysis, not a transport failure/);
});

test("CLI: true schema to false is breaking boolean-schema-tightened", () => {
  const { r, summary, brief } = runCase("boolean-true-to-false");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.breaking, 1);
  assert.equal(summary.compatible, 0);
  const row = firstRow(brief, "breaking");
  assert.equal(row.reason, "boolean-schema-tightened");
  assert.equal(row.before.allows, true);
  assert.equal(row.after.allows, false);
});

test("CLI: false schema to object schema is compatible weakening", () => {
  const { r, summary, brief } = runCase("boolean-false-to-schema");
  assert.equal(r.status, 0);
  assert.equal(summary.ok, true);
  assert.equal(summary.compatible, 1);
  assert.equal(summary.breaking, 0);
  const row = firstRow(brief, "compatible");
  assert.equal(row.reason, "boolean-schema-weakened");
  assert.equal(row.before.kind, "boolean-schema");
  assert.equal(row.after.kind, "schema-object");
});

test("CLI: object schema to false is breaking", () => {
  const { r, summary, brief } = runCase("boolean-schema-to-false");
  assert.equal(r.status, 0);
  assert.equal(summary.breaking, 1);
  const row = firstRow(brief, "breaking");
  assert.equal(row.reason, "boolean-schema-tightened");
});

test("CLI: $ref sibling minimum 0.5 is numeric-tightened, not ignored", () => {
  const { r, summary, brief } = runCase("ref-sibling-minimum");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.breaking, 1);
  const row = firstRow(brief, "breaking");
  assert.equal(row.pointer, "/properties/amount");
  assert.equal(row.reason, "numeric-tightened");
  assert.equal(row.before.kind, "local-ref");
  assert.equal(row.after.kind, "local-ref");
  assert.equal(row.after.siblings.minimum, "0.5");
});

test("CLI: $ref description sibling is unchanged instance-set, not breaking", () => {
  const { r, summary, brief } = runCase("ref-sibling-description");
  assert.equal(r.status, 0);
  assert.equal(summary.ok, true);
  assert.equal(summary.breaking, 0);
  assert.equal(summary.compatible, 0);
  assert.equal(brief.impact.breaking.length, 0);
  assert.equal(brief.impact.compatible.length, 0);
  assert.equal(brief.impact.unchangedCount, 1);
  assert.equal(brief.status, "informational");
});

test("CLI: required field added is breaking required-added", () => {
  const { r, summary, brief } = runCase("required-added");
  assert.equal(r.status, 0);
  assert.equal(summary.breaking, 1);
  const row = firstRow(brief, "breaking");
  assert.equal(row.pointer, "");
  assert.equal(row.reason, "required-added");
});

test("CLI: required field removed is compatible, not breaking", () => {
  const { r, summary, brief, md } = runCase("required-removed");
  assert.equal(r.status, 0);
  assert.equal(summary.ok, true);
  assert.equal(summary.breaking, 0);
  assert.equal(summary.compatible, 1);
  const row = firstRow(brief, "compatible");
  assert.equal(row.reason, "required-removed");
  assert.equal(brief.impact.breaking.length, 0);
  assert.match(md, /required-removed/);
});

test("CLI: float minimum 0.5 to 1.5 is numeric-tightened, not unchanged", () => {
  const { r, summary, brief } = runCase("numeric-float-tighten");
  assert.equal(r.status, 0);
  assert.equal(summary.breaking, 1);
  const row = firstRow(brief, "breaking");
  assert.equal(row.reason, "numeric-tightened");
  assert.equal(row.before.minimum, "0.5");
  assert.equal(row.after.minimum, "1.5");
});

test("CLI: float minimum 0.5 to 0.1 is compatible numeric-weakened", () => {
  const { r, summary, brief } = runCase("numeric-float-weaken");
  assert.equal(r.status, 0);
  assert.equal(summary.ok, true);
  assert.equal(summary.breaking, 0);
  assert.equal(summary.compatible, 1);
  const row = firstRow(brief, "compatible");
  assert.equal(row.reason, "numeric-weakened");
  assert.equal(row.before.minimum, "0.5");
  assert.equal(row.after.minimum, "0.1");
});

test("CLI: exclusiveMinimum 0 to 1 is numeric-tightened", () => {
  const { r, summary, brief } = runCase("numeric-exclusive-tighten");
  assert.equal(r.status, 0);
  assert.equal(summary.breaking, 1);
  const row = firstRow(brief, "breaking");
  assert.equal(row.reason, "numeric-tightened");
  assert.equal(row.before.exclusiveMinimum, 0);
  assert.equal(row.after.exclusiveMinimum, 1);
});
