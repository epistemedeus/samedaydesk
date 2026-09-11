import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runEngineCli } from "../lib/engine-cli.mjs";

const pkg = fileURLToPath(new URL("..", import.meta.url));

function repoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", cwd: pkg });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test("local-runtime SDS package-lock integrity bump lists only that pin", () => {
  const lockPath = join(repoRoot(), "package-lock.json");
  assert.equal(existsSync(lockPath), true, "SDS package-lock.json missing; local-runtime is incomplete");
  const original = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.equal(original.lockfileVersion, 3);
  const zod = original.packages["node_modules/zod"];
  assert.ok(zod?.integrity, "zod pin missing from SDS lock");
  const after = structuredClone(original);
  after.packages["node_modules/zod"].integrity = "sha512-m07-local-runtime-zod-integrity-only";
  const dir = mkdtempSync(join(tmpdir(), "w5-m07-sds-"));
  const afterPath = join(dir, "package-lock.after.json");
  writeFileSync(afterPath, `${JSON.stringify(after)}\n`);
  const cli = runEngineCli({ before: lockPath, after: afterPath, outDir: dir });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(cli.json.ok, true);
  assert.equal(cli.report.changed[0].name, "zod");
  assert.deepEqual(cli.report.changed[0].changeKinds, ["integrity"]);
  assert.equal(cli.report.changed[0].before.version, zod.version);
  const blob = JSON.stringify({ added: cli.report.added, removed: cli.report.removed, changed: cli.report.changed });
  assert.equal(blob.includes("express"), false);
  assert.equal(cli.report.purchaseAuthority, false);
});
