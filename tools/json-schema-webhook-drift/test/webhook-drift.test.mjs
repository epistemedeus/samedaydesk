import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TERMS_VERSION_RE } from "../vendor/i01-hash-terms/hash.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "webhook-drift.mjs");
const fx = (...parts) => path.join(ROOT, "fixtures", ...parts);

function run(args, { cwd } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: cwd || ROOT,
    timeout: 20_000,
  });
}

function parseStdout(r) {
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

function readBrief(outDir) {
  return JSON.parse(fs.readFileSync(path.join(outDir, "drift-brief.json"), "utf8"));
}

function readMd(outDir) {
  return fs.readFileSync(path.join(outDir, "drift-brief.md"), "utf8");
}

test("journey CLI: amount type change is one breaking used-path; unused debug ignored", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-journey-"));
  const r = run([
    "--before",
    fx("journey", "before.json"),
    "--after",
    fx("journey", "after.json"),
    "--used",
    fx("journey", "used.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const summary = parseStdout(r);
  assert.equal(summary.ok, true);
  assert.equal(summary.customerBrief, false);
  assert.equal(summary.purchaseAuthority, false);
  assert.equal(summary.sold, false);
  assert.equal(summary.kind, "json-schema");
  assert.equal(summary.breaking, 1);
  assert.match(summary.termsVersion, TERMS_VERSION_RE);

  const brief = readBrief(outDir);
  assert.equal(brief.schema, "samedaydesk.json-schema-webhook-drift.v1");
  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.notOpenApi, true);
  assert.equal(brief.notApiUpgradeBrief, true);
  assert.equal(brief.customerBrief, false);
  assert.equal(brief.payment.settling, false);
  assert.equal(brief.impact.breaking.length, 1);
  assert.equal(brief.impact.breaking[0].pointer, "/properties/amount");
  assert.equal(brief.impact.breaking[0].reason, "type-change");
  assert.equal(brief.impact.breaking[0].before.type, "number");
  assert.equal(brief.impact.breaking[0].after.type, "string");
  const blob = JSON.stringify(brief);
  assert.equal(blob.includes("/properties/debug"), false);
  assert.equal(blob.includes("\"debug\""), false);
  const md = readMd(outDir);
  assert.match(md, /\/properties\/amount/);
  assert.doesNotMatch(md, /\/properties\/debug/);
  assert.match(md, /not api-upgrade-brief/i);
});

test("seeded: used path missing in both is unknown, not deleted", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-unknown-"));
  const r = run([
    "--before",
    fx("unknown-both", "before.json"),
    "--after",
    fx("unknown-both", "after.json"),
    "--used",
    fx("unknown-both", "used.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const summary = parseStdout(r);
  assert.equal(summary.status, "partial");
  assert.equal(summary.unknown, 1);
  const brief = readBrief(outDir);
  assert.equal(brief.impact.deleted.length, 0);
  assert.equal(brief.impact.unknown.length, 1);
  assert.equal(brief.impact.unknown[0].pointer, "/properties/missing-used-field");
  assert.equal(brief.impact.unknown[0].reason, "absent-in-both");
  assert.equal(brief.impact.unknown[0].class, "unknown");
  const md = readMd(outDir);
  assert.match(md, /unknown, not deleted/);
  assert.doesNotMatch(md, /Deleted used paths\n- `\/properties\/missing-used-field`/);
});

test("seeded: remote $ref refuses and does not write a customer brief", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-remote-"));
  const r = run([
    "--before",
    fx("remote-ref", "before.json"),
    "--after",
    fx("remote-ref", "after.json"),
    "--used",
    fx("remote-ref", "used.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(r.status, 2, r.stdout);
  const payload = parseStdout(r);
  assert.equal(payload.ok, false);
  assert.equal(payload.refused, true);
  assert.equal(payload.code, "remote-ref-refused");
  assert.equal(payload.customerBrief, false);
  assert.equal(fs.existsSync(path.join(outDir, "drift-brief.json")), false);
});

test("seeded: --example SAMPLE cannot be a customer brief", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-example-"));
  const r = run(["--example", "--out-dir", outDir]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const summary = parseStdout(r);
  assert.equal(summary.ok, true);
  assert.equal(summary.exampleMode, true);
  assert.equal(summary.sample, true);
  assert.equal(summary.customerBrief, false);
  const brief = readBrief(outDir);
  assert.equal(brief.customerBrief, false);
  assert.equal(brief.sample, true);
  assert.equal(brief.exampleMode, true);
  assert.equal(brief.caller.sampleLabel, "SAMPLE");
  assert.equal(brief.sold, false);
  const md = readMd(outDir);
  assert.match(md, /SAMPLE/);
  assert.match(md, /not a customer brief/i);
  assert.equal(brief.provenance, "fixture");
});

test("webhook payload example: used amount type change; unused debug ignored", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-payload-"));
  const r = run([
    "--before",
    fx("webhook-payload", "before.json"),
    "--after",
    fx("webhook-payload", "after.json"),
    "--used",
    fx("webhook-payload", "used.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const summary = parseStdout(r);
  assert.equal(summary.kind, "webhook-example");
  assert.equal(summary.breaking, 1);
  const brief = readBrief(outDir);
  assert.equal(brief.impact.breaking[0].pointer, "/data/object/amount");
  assert.equal(brief.impact.breaking[0].before.jsonType, "number");
  assert.equal(brief.impact.breaking[0].after.jsonType, "string");
  assert.equal(JSON.stringify(brief).includes("/data/object/debug"), false);
});

test("I01 contract: integer termsVersion on used.json is invalid_input", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-intterms-"));
  const r = run([
    "--before",
    fx("journey", "before.json"),
    "--after",
    fx("journey", "after.json"),
    "--used",
    fx("integer-terms", "used.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(r.status, 2);
  const payload = parseStdout(r);
  assert.equal(payload.code, "invalid_input");
  assert.equal(payload.ok, false);
});

test("OpenAPI input is refused as not this job", () => {
  const r = run([
    "--before",
    fx("openapi-refuse", "before.json"),
    "--after",
    fx("openapi-refuse", "after.json"),
    "--used",
    fx("openapi-refuse", "used.json"),
  ]);
  assert.equal(r.status, 2);
  const payload = parseStdout(r);
  assert.equal(payload.code, "not-this-job-openapi");
});

test("missing required flags refuse", () => {
  const r = run([]);
  assert.equal(r.status, 2);
  const payload = parseStdout(r);
  assert.equal(payload.code, "missing-required-inputs");
});

test("HTML input refuses", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-html-"));
  const html = path.join(dir, "before.html");
  fs.writeFileSync(html, "<html><body>not json</body></html>\n");
  const r = run([
    "--before",
    html,
    "--after",
    fx("journey", "after.json"),
    "--used",
    fx("journey", "used.json"),
  ]);
  assert.equal(r.status, 2);
  assert.equal(parseStdout(r).code, "html-or-markup");
});

test("--help prints public flags", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--before/);
  assert.match(r.stdout, /--used/);
  assert.match(r.stdout, /SAMPLE/);
  assert.match(r.stdout, /Not OpenAPI/);
});

test("YAML input refuses (no YAML parser in this job)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wd-yaml-"));
  const yamlPath = path.join(dir, "before.yaml");
  fs.writeFileSync(yamlPath, "---\ntitle: not-json\n");
  const r = run([
    "--before",
    yamlPath,
    "--after",
    fx("journey", "after.json"),
    "--used",
    fx("journey", "used.json"),
  ]);
  assert.equal(r.status, 2);
  assert.equal(parseStdout(r).code, "not-json");
});

test("schema vs webhook-example kind mismatch refuses", () => {
  const r = run([
    "--before",
    fx("journey", "before.json"),
    "--after",
    fx("webhook-payload", "after.json"),
    "--used",
    fx("journey", "used.json"),
  ]);
  assert.equal(r.status, 2);
  assert.equal(parseStdout(r).code, "kind-mismatch");
});
