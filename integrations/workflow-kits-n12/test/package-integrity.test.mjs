import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";

import { COMPARISON_ROWS } from "../vendor/payment-rail/recurring-journey/journey.mjs";
import { buildAll, serialize } from "../scripts/build-artifacts.mjs";
import { computeComparison } from "../scripts/compute-comparison.mjs";
import { readJson, root } from "./helpers.mjs";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("vendored bytes and generated artifacts", () => {
  const pins = readJson("vendor/PINS.json");

  test("every vendored file matches its pinned sha256 and every vendored file is pinned", () => {
    for (const file of pins.files) {
      const actual = createHash("sha256").update(readFileSync(join(root, "vendor", file.path))).digest("hex");
      assert.equal(actual, file.sha256, file.path);
    }
    const onDisk = walk(join(root, "vendor")).map((f) => relative(join(root, "vendor"), f)).filter((f) => f !== "PINS.json").sort();
    assert.deepEqual(onDisk, pins.files.map((f) => f.path).sort());
  });

  test("pins name the frozen interface heads", () => {
    const bySource = Object.fromEntries(pins.sources.map((s) => [s.name, s]));
    assert.equal(bySource["recurring-journey"].sha, "175245e38f86431dcdfcf6607580e3af0b999d68");
    assert.equal(bySource["job-contract"].sha, "fb8228a90a3f12221451ab27a3c9dc9eccc5ab6e");
    assert.equal(bySource["request-contract"].sha, "fb8228a90a3f12221451ab27a3c9dc9eccc5ab6e");
    assert.equal(bySource.flowassert.sha, "3960c04dc3ee39138ed918c2226194638e13422a");
  });

  test("committed blueprint, workflow and fixtures equal the builder output", () => {
    for (const [rel, value] of Object.entries(buildAll())) {
      assert.equal(readFileSync(join(root, rel), "utf8"), serialize(value), rel);
    }
  });

  test("COMPARISON.json equals the computed comparison and keeps the vendored native row", () => {
    const committed = readJson("COMPARISON.json");
    assert.deepEqual(committed, JSON.parse(JSON.stringify(computeComparison())));
    for (const column of committed.columns) {
      assert.equal(committed.rows.native[column], COMPARISON_ROWS.native[column]);
      assert.equal(typeof committed.rows.make[column], "string");
      assert.equal(typeof committed.rows.n8n[column], "string");
    }
  });
});

describe("kit source rules", () => {
  const own = walk(root).filter((f) => !f.includes(`${join(root, "vendor")}`) && !f.includes("node_modules"));

  test("kit source never computes a termsVersion locally", () => {
    for (const file of own.filter((f) => f.includes(`${join(root, "src")}`))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /hashTermsVersion|hash-terms-version/, relative(root, file));
    }
  });

  test("no em dashes in kit docs or source", () => {
    for (const file of own.filter((f) => /\.(md|mjs|json)$/.test(f))) {
      assert.ok(!readFileSync(file, "utf8").includes("\u2014"), relative(root, file));
    }
  });

  test("importable artifacts carry the SameDayDesk identity only", () => {
    for (const rel of ["make/record-to-accepted-output.blueprint.json", "n8n/record-to-accepted-output.workflow.json"]) {
      const text = readFileSync(join(root, rel), "utf8");
      assert.match(text, /SameDayDesk/);
      assert.doesNotMatch(text.replace(/\/\/ =====[\s\S]*?=====/g, ""), /\bpilot\b/i, rel);
    }
  });
});
