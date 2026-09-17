import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT } from "../lib/paths.mjs";
import { seededFailurePrivateTerms } from "../lib/verify.mjs";

test("seeded failure private-terms-scrape is rejected by ingest", () => {
  const result = seededFailurePrivateTerms();
  assert.equal(result.rejected, true, JSON.stringify(result));
  assert.equal(result.accepted, false);
  assert.equal(result.code, "private_terms_scrape");
});

test("cli seeded-failure exits 0 because the work rejected the scrape", () => {
  const proc = spawnSync(process.execPath, [join(PACK_ROOT, "bin/work-terms.mjs"), "seeded-failure"], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.accepted, false);
  assert.equal(body.rejected, true);
  assert.equal(body.code, "private_terms_scrape");
  assert.equal(body.seededFailure, "private-terms-scrape");
});

test("cli ingest of the private scrape fixture exits 1 and does not accept", () => {
  const file = join(PACK_ROOT, "fixtures/seeded-failures/private-terms-scrape.json");
  const proc = spawnSync(
    process.execPath,
    [join(PACK_ROOT, "bin/work-terms.mjs"), "ingest", "--file", file],
    { encoding: "utf8" },
  );
  assert.equal(proc.status, 1, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.accepted, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "private_terms_scrape");
});
