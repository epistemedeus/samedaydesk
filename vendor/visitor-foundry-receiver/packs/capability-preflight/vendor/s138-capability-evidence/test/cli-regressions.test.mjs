import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin/capability-evidence.mjs");
const BIND = pathToFileURL(join(ROOT, "src/bind-evidence.mjs")).href;

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    maxBuffer: 2 * 1024 * 1024,
  });
}

test("CLI resolve-prereqs: empty manifest is not ready", () => {
  const dir = mkdtempSync(join(tmpdir(), "s146-cli-"));
  const manifest = join(dir, "empty.json");
  writeFileSync(manifest, "{}\n");
  const r = run(["resolve-prereqs", "--manifest", manifest]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.readiness, "not_ready");
});

test("CLI bind path: mismatched sha256 is untested_declaration", () => {
  const dir = mkdtempSync(join(tmpdir(), "s146-cli-"));
  const source = join(dir, "src.mjs");
  const tap = join(dir, "out.tap");
  writeFileSync(source, "export const n = 1;\n");
  writeFileSync(tap, "ok 1 - x\n# tests 1\n# pass 1\n# fail 0\n");
  const probe = join(dir, "probe.mjs");
  writeFileSync(
    probe,
    `import { readFileSync } from "node:fs";
import { bindEvidence } from ${JSON.stringify(BIND)};
const content = readFileSync(${JSON.stringify(source)}, "utf8");
const r = bindEvidence({
  declaration: { capabilityId: "R2-CAPABILITIES-03", revision: "r1" },
  source: { path: ${JSON.stringify(source)}, content, sha256: ${JSON.stringify("0".repeat(64))} },
  testOutput: { path: ${JSON.stringify(tap)}, content: readFileSync(${JSON.stringify(tap)}, "utf8"), exitCode: 0 },
});
process.stdout.write(JSON.stringify(r));
`,
  );
  const r = spawnSync(process.execPath, [probe], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, "untested_declaration");
});

test("CLI compose-partial: missing job schema/scope is not universal", () => {
  const dir = mkdtempSync(join(tmpdir(), "s146-cli-"));
  const job = join(dir, "job.json");
  const part = join(dir, "part.json");
  writeFileSync(job, JSON.stringify({ requiredFields: ["x"] }) + "\n");
  writeFileSync(
    part,
    JSON.stringify({ id: "a", schema: "s1", scope: "alpha", payload: { x: 1 } }) + "\n",
  );
  const r = run(["compose-partial", "--job", job, "--parts", part]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.gaps.some((g) => g.kind === "job-schema-missing"));
  assert.ok(out.gaps.some((g) => g.kind === "job-scope-missing"));
  assert.notEqual(out.status, "complete");
});
