import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertCatalogRowMatchesSpec,
  loadCase,
  loadCorpus,
  readJson,
  validateCaseSpec,
} from "./lib/load.mjs";
import { SCHEMA_PATH } from "./lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function sampleSpec() {
  return JSON.parse(readFileSync(join(here, "cases/s185-missing-input-exit0/case.json"), "utf8"));
}

test("loadCorpus applies schema.json and seeded class pins", () => {
  const corpus = loadCorpus();
  assert.equal(corpus.schema.$id, "https://samedaydesk.com/regression-sds/case.schema.json");
  assert.equal(corpus.cases.length, 16);
  assert.equal(corpus.catalog.seededFalseGreen, "archive-wrong-digest");
  assert.equal(corpus.catalog.seededFalseReject, "offer-routing-complete-issue");
  for (const loaded of corpus.cases) {
    validateCaseSpec(loaded.spec, corpus.schema, loaded.id);
    assert.equal(loaded.spec.boundary.paymentSent, false);
    assert.equal(loaded.spec.boundary.toolsCalled, false);
  }
});

test("validateCaseSpec rejects unknown root fields", () => {
  const schema = readJson(SCHEMA_PATH);
  const spec = sampleSpec();
  spec.unexpected = true;
  assert.throws(() => validateCaseSpec(spec, schema), /case_unknown_field:s185-missing-input-exit0:unexpected/);
});

test("validateCaseSpec rejects spawn without argv", () => {
  const schema = readJson(SCHEMA_PATH);
  const spec = sampleSpec();
  delete spec.execute.argv;
  assert.throws(() => validateCaseSpec(spec, schema), /case_argv:s185-missing-input-exit0/);
});

test("catalog row class must match spec class", () => {
  const spec = loadCase("s185-missing-input-exit0").spec;
  assert.throws(
    () =>
      assertCatalogRowMatchesSpec(
        { id: spec.id, surface: spec.surface, feature: spec.feature, class: "seeded-false-green" },
        spec,
      ),
    /catalog_row_mismatch:s185-missing-input-exit0/,
  );
});

test("every case is SDS-local and refuses payment/tools mutation", () => {
  const corpus = loadCorpus();
  for (const loaded of corpus.cases) {
    assert.equal(loaded.spec.repo, "samedaydesk");
    assert.equal(loaded.spec.boundary.paymentSent, false);
    assert.equal(loaded.spec.boundary.toolsCalled, false);
  }
});
