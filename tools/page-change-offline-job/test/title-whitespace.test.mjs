import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { normalizeTitleFact } from "../lib/fields.mjs";
import { PACKAGE_ROOT } from "../lib/cli.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const customer = join(PACKAGE_ROOT, "fixtures/customer-job");
const bin = join(PACKAGE_ROOT, "bin/page-change.mjs");

test("title fact folds ASCII space runs and trims; it does not flatten other fields", () => {
  assert.equal(
    normalizeTitleFact("SameDayDesk AI search readiness — 189  companies scored across 10 industries"),
    normalizeTitleFact("SameDayDesk AI search readiness — 189 companies scored across 10 industries"),
  );
  assert.notEqual(normalizeTitleFact("line one\nline two"), normalizeTitleFact("line one line two"));
});

test("CLI: extra ASCII space only in title is unchanged, not a useful title replace", () => {
  const work = mkdtempSync(join(tmpdir(), "pc-title-ws-"));
  const before = JSON.parse(readFileSync(join(customer, "before.json"), "utf8"));
  const after = JSON.parse(JSON.stringify(before));
  const title = String(after.sources[0].data.title);
  after.sources[0].data.title = title.includes("  ") ? title.replace(/[ \t]+/g, " ") : title.replace(/ /, "  ");
  const beforePath = join(work, "before.json");
  const afterPath = join(work, "after.json");
  writeFileSync(beforePath, `${JSON.stringify(before)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(after)}\n`);
  assert.notEqual(after.sources[0].data.title, before.sources[0].data.title);
  const outDir = join(work, "out");
  const r = spawnSync(
    process.execPath,
    [
      bin,
      "compare",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--fields",
      "title,description",
      "--clock",
      "2026-09-11T12:00:00.000Z",
      "--out-dir",
      outDir,
    ],
    { encoding: "utf8", cwd: PACKAGE_ROOT },
  );
  assert.equal(r.status, 0, r.stderr);
  const stdout = JSON.parse(r.stdout);
  assert.equal(stdout.report.verdict, "unchanged");
  assert.equal(stdout.report.changes.some((row) => row.path === "/title"), false);
  assert.equal(stdout.report.claims.contentUnchangedProven, true);
  void here;
});
