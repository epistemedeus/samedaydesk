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
import { SCHEMA_PATH, USEFUL_JOBS_NEGATIVE_110, USEFUL_JOBS_PIN } from "./lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function sampleSpec() {
  return JSON.parse(readFileSync(join(here, "cases/archive-missing-args/case.json"), "utf8"));
}

test("loadCorpus applies schema.json and seeded class pins", () => {
  const corpus = loadCorpus();
  assert.equal(corpus.schema.$id, "https://samedaydesk.com/regression/corpus/case.schema.json");
  assert.equal(corpus.cases.length, 15);
  for (const loaded of corpus.cases) {
    validateCaseSpec(loaded.spec, corpus.schema, loaded.id);
  }
});

test("validateCaseSpec rejects unknown root fields", () => {
  const schema = readJson(SCHEMA_PATH);
  const spec = sampleSpec();
  spec.unexpected = true;
  assert.throws(() => validateCaseSpec(spec, schema), /case_unknown_field:archive-missing-args:unexpected/);
});

test("validateCaseSpec rejects spawn without argv", () => {
  const schema = readJson(SCHEMA_PATH);
  const spec = sampleSpec();
  delete spec.execute.argv;
  assert.throws(() => validateCaseSpec(spec, schema), /case_argv:archive-missing-args/);
});

test("catalog row class must match spec class", () => {
  const spec = loadCase("archive-missing-args").spec;
  assert.throws(
    () =>
      assertCatalogRowMatchesSpec(
        { id: spec.id, surface: spec.surface, feature: spec.feature, class: "seeded-false-accept" },
        spec,
      ),
    /catalog_row_mismatch:archive-missing-args/,
  );
});

test("1.1.0 negative control uses the 1.1.0 pin bytes and the live 1.4.7 digest", () => {
  const argv = loadCase("useful-jobs-negative-control-1.1.0").spec.execute.argv;
  assert.ok(argv.some((item) => item.endsWith(USEFUL_JOBS_NEGATIVE_110.archive)));
  assert.ok(argv.includes(String(USEFUL_JOBS_NEGATIVE_110.bytes)));
  assert.ok(argv.includes(USEFUL_JOBS_PIN.sha256));
});
