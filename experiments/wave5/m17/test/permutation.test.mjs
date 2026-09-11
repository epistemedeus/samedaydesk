import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { spaCatalog, permuteRecords } from "../lib/catalogs.mjs";
import { runRouteDiffCli } from "../lib/run-engine.mjs";
import { startLoopbackCatalogs } from "../lib/http.mjs";
import { tmpDir, writeJson } from "./helpers.mjs";

test("permutation of live SDS52 SPA_ROUTE_SHELLS is not a compatibility break", () => {
  const dir = tmpDir("w5-m17-perm-");
  const spa = spaCatalog();
  assert.ok(spa.routes.length >= 8, "SDS52 shell catalog is the real project table");
  const reversed = { ...spa, routes: permuteRecords(spa.routes, "reverse") };
  assert.equal(reversed.routes[0].path, spa.routes.at(-1).path);
  assert.notEqual(reversed.routes.map((row) => row.path).join(","), spa.routes.map((row) => row.path).join(","));
  const before = writeJson(dir, "before.json", spa);
  const after = writeJson(dir, "after.json", reversed);
  const result = runRouteDiffCli({ before, after, outDir: join(dir, "out") });
  assert.equal(result.classification.kind, "analysis_no_change", JSON.stringify(result.json));
  assert.equal(result.status, 0);
  assert.deepEqual(result.json.counts, { added: 0, removed: 0, changed: 0, titleOnly: 0 });
  assert.notEqual(result.json.tableDigest.before, result.json.tableDigest.after);
  assert.equal(result.classification.digestChanged, true);
  const written = JSON.parse(readFileSync(join(dir, "out", "route-diff.json"), "utf8"));
  assert.equal(written.counts.added, 0);
  assert.equal(written.publishedRouteTable, false);
});

test("loopback HTTP catalogs of the same permutation stay local-runtime no-change", async (t) => {
  const spa = spaCatalog();
  const reversed = { ...spa, routes: permuteRecords(spa.routes, "reverse") };
  const loop = await startLoopbackCatalogs(spa, reversed);
  t.after(() => loop.stop());
  const result = runRouteDiffCli({
    before: loop.beforeUrl,
    after: loop.afterUrl,
    outDir: join(tmpDir("w5-m17-loop-"), "out"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.evidenceClass.before, "local-runtime");
  assert.equal(result.json.evidenceClass.after, "local-runtime");
  assert.equal(result.classification.kind, "analysis_no_change");
  assert.notEqual(result.json.tableDigest.before, result.json.tableDigest.after);
});
