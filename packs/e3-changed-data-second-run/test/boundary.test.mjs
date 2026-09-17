import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BIN, PACK_ROOT, REPO_ROOT } from "./helpers.mjs";

function walkFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walkFiles(path, acc);
    else acc.push(path);
  }
  return acc;
}

test("pack is disjoint from J6 useful-job-desk and E4 discovery", () => {
  const readme = readFileSync(join(PACK_ROOT, "README.md"), "utf8");
  assert.match(readme, /packs\/useful-job-desk/);
  assert.match(readme, /packs\/e4-maintained-runtime-discovery/);
  assert.match(readme, /does \*\*not\*\* reimplement page-change/i);
  const notice = readFileSync(join(PACK_ROOT, "SOURCE-NOTICE.txt"), "utf8");
  assert.match(notice, /packs\/useful-job-desk \(J6\)/);
  assert.match(notice, /packs\/e4-maintained-runtime-discovery \(E4\)/);
  const files = walkFiles(PACK_ROOT).filter((path) => path.endsWith(".mjs"));
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /from ["'].*packs\/useful-job-desk/);
    assert.doesNotMatch(text, /from ["'].*packs\/e4-maintained-runtime-discovery/);
    assert.doesNotMatch(text, /engines\/page-change-offline-job/);
  }
  const bin = readFileSync(BIN, "utf8");
  assert.doesNotMatch(bin, /packs\/useful-job-desk/);
  assert.doesNotMatch(bin, /packs\/e4-maintained-runtime-discovery/);
});

test("write boundary is this pack only: no payment, fetch, or scheduler", () => {
  const files = walkFiles(PACK_ROOT).filter(
    (path) => path.endsWith(".mjs") && !path.includes("/test/"),
  );
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /replayPayment\s*=\s*true/);
    assert.doesNotMatch(text, /schedulerDaemon\s*=\s*true/);
    assert.doesNotMatch(text, /\bfetch\(/);
  }
  const resultPaths = walkFiles(PACK_ROOT).map((path) => path.slice(REPO_ROOT.length + 1));
  for (const rel of resultPaths) {
    assert.match(rel, /^packs\/e3-changed-data-second-run\//);
  }
});

test("seeded failure is documented as the kill condition", () => {
  const readme = readFileSync(join(PACK_ROOT, "README.md"), "utf8");
  assert.match(readme, /same_fixture_labelled_repeat_demand/);
  assert.match(readme, /Same fixture twice labelled as repeat demand/);
});
