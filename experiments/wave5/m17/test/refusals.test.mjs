import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { co12Catalog, historyHomepageRecord, spaCatalog } from "../lib/catalogs.mjs";
import { QUERY_PROBE } from "../lib/pins.mjs";
import { runRouteDiffCli } from "../lib/run-engine.mjs";
import { tmpDir, writeJson } from "./helpers.mjs";

function refuse(afterDoc, extra = {}) {
  const dir = tmpDir("w5-m17-refuse-");
  const before = writeJson(dir, "before.json", spaCatalog());
  const after = writeJson(dir, "after.json", afterDoc);
  const result = runRouteDiffCli({ before, after, outDir: join(dir, "out"), extraArgs: extra.args || [] });
  assert.equal(result.status, 2, result.stdout);
  assert.equal(result.classification.kind, extra.kind || "analysis_refusal");
  return result;
}

test("React history homepage / is a valid Co12 refusal, not an engine crash", () => {
  const result = refuse(co12Catalog([historyHomepageRecord()]));
  assert.equal(result.classification.code, "homepage_rewrite_refused");
  assert.equal(result.json.ok, false);
  assert.equal(result.json.refused, true);
});

test("live MCP query string cannot be a Co12 path", () => {
  const result = refuse(
    co12Catalog([
      {
        path: `/mcp?cs=${QUERY_PROBE}`,
        title: "MCP license return | SameDayDesk",
        canonical: "https://samedaydesk.com/mcp",
      },
    ]),
  );
  assert.equal(result.classification.code, "invalid_path");
});

test("integer termsVersion is refused; hashes are not forced equal", () => {
  const spa = spaCatalog();
  spa.termsVersion = 1;
  const result = refuse(spa);
  assert.equal(result.classification.code, "integer_terms_version_refused");
});

test("public HTTPS catalog fetch is a refusal, not local-runtime success", () => {
  const dir = tmpDir("w5-m17-ext-");
  const after = writeJson(dir, "after.json", spaCatalog());
  const result = runRouteDiffCli({
    before: "https://samedaydesk.com/for-agents/useful-jobs/catalog.json",
    after,
    outDir: join(dir, "out"),
  });
  assert.equal(result.status, 2);
  assert.equal(result.classification.kind, "analysis_refusal");
  assert.equal(result.classification.code, "external_catalog_refused");
});
