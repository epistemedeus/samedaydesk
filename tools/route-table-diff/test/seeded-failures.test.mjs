import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { FIXTURES_DIR, JOURNEY_AFTER, JOURNEY_BEFORE, SAMPLE_AFTER, SAMPLE_BEFORE } from "../lib/constants.mjs";
import { parseStdout, runCli, tmpOut } from "./helpers.mjs";

function failCli(args) {
  const result = runCli(args);
  const body = parseStdout(result);
  assert.equal(result.status, 2, `expected refuse, stderr=${result.stderr}`);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  return body;
}

test("seeded failure: claiming homepage rewrite is refused", () => {
  const outDir = tmpOut();
  const body = failCli([
    "--before",
    join(FIXTURES_DIR, "failures", "homepage-rewrite.json"),
    "--after",
    JOURNEY_AFTER,
    "--out-dir",
    outDir,
  ]);
  assert.equal(body.code, "homepage_rewrite_refused");

  const flag = failCli([
    "--before",
    JOURNEY_BEFORE,
    "--after",
    JOURNEY_AFTER,
    "--out-dir",
    outDir,
    "--rewrite-homepage",
  ]);
  assert.equal(flag.code, "homepage_rewrite_refused");
});

test("seeded failure: treating SAMPLE as published route table is refused", () => {
  const outDir = tmpOut();
  const flagged = failCli([
    "--before",
    SAMPLE_BEFORE,
    "--after",
    SAMPLE_AFTER,
    "--out-dir",
    outDir,
    "--published",
  ]);
  assert.equal(flagged.code, "sample_not_published_route_table");

  const examplePublished = failCli(["--example", "--published", "--out-dir", outDir]);
  assert.equal(examplePublished.code, "sample_not_published_route_table");

  const claimed = failCli([
    "--before",
    join(FIXTURES_DIR, "failures", "sample-as-published.json"),
    "--after",
    SAMPLE_AFTER,
    "--out-dir",
    outDir,
  ]);
  assert.equal(claimed.code, "sample_not_published_route_table");
});

test("seeded failure: path-less records refuse", () => {
  const outDir = tmpOut();
  const body = failCli([
    "--before",
    join(FIXTURES_DIR, "failures", "pathless.json"),
    "--after",
    JOURNEY_AFTER,
    "--out-dir",
    outDir,
  ]);
  assert.equal(body.code, "pathless_record");
});

test("integer termsVersion is refused (I01 content-hash contract, not F01 integer dual-key)", () => {
  const outDir = tmpOut();
  const body = failCli([
    "--before",
    join(FIXTURES_DIR, "failures", "integer-terms-version.json"),
    "--after",
    JOURNEY_AFTER,
    "--out-dir",
    outDir,
  ]);
  assert.equal(body.code, "integer_terms_version_refused");
});

test("--example SAMPLE pair diffs without claiming publication", () => {
  const outDir = tmpOut();
  const result = runCli(["--example", "--out-dir", outDir]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.publishedRouteTable, false);
  assert.equal(body.sample, true);
  assert.equal(body.evidenceClass.before, "fixture");
  assert.ok(body.added.includes("/for-agents/useful-jobs/v2"));
  assert.ok(body.changed.some((item) => item.path === "/terms" && item.fields.includes("canonical")));
});
