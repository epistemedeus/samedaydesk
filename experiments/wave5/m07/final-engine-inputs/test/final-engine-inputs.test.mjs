import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { loadCases, fixturePath } from "../lib/corpus.mjs";
import { runShippedCli } from "../lib/run-shipped.mjs";
import { classifyFinal } from "../lib/classify-final.mjs";
import { ensureShippedEngines, incomplete, pin } from "../lib/ensure-shipped.mjs";

test("shipped merchant and kit engines are present; missing engine is incomplete", () => {
  const engines = ensureShippedEngines();
  assert.match(engines.merchantBin, /lockfile-delta\.mjs$/);
  assert.match(engines.kitBin, /useful-jobs\.mjs$/);
  assert.equal(pin.merchant.sha, "ca38205279f0d543515b81b7261909e55ea2600f");
  assert.equal(pin.publicKit.sha256, "dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb");
});

test("missing merchant env path is incomplete, not a skipped pass", () => {
  const prev = process.env.MERCHANT_LOCKFILE_PIN_DELTA_ROOT;
  process.env.MERCHANT_LOCKFILE_PIN_DELTA_ROOT = join("/tmp", "w5-m07-final-missing-engine");
  try {
    assert.throws(() => ensureShippedEngines(), (err) => err && err.code === "engine-incomplete");
  } finally {
    if (prev === undefined) delete process.env.MERCHANT_LOCKFILE_PIN_DELTA_ROOT;
    else process.env.MERCHANT_LOCKFILE_PIN_DELTA_ROOT = prev;
  }
});

test("new identity fixtures on merchant vendor CLI and public kit 1.2.0", () => {
  const corpus = loadCases();
  assert.equal(corpus.cases.length, 8);
  const kinds = { match: 0, "supported-unknown": 0, "incorrect-named-delta": 0, "engine-failure": 0 };
  for (const caseSpec of corpus.cases) {
    const perEngine = [];
    for (const kind of corpus.engines) {
      const cli = runShippedCli(kind, {
        before: fixturePath(caseSpec.before),
        after: fixturePath(caseSpec.after),
      });
      const finding = classifyFinal(caseSpec, cli);
      kinds[finding.kind] = (kinds[finding.kind] || 0) + 1;
      perEngine.push(finding);
      assert.equal(finding.nBty003, false, caseSpec.id);
      assert.equal(
        finding.ok,
        true,
        `${caseSpec.id}/${kind}: ${finding.kind} ${finding.detail} exit=${cli.status} stdout=${cli.stdout}`,
      );
    }
    assert.equal(perEngine[0].kind, perEngine[1].kind, `${caseSpec.id} merchant/kit kind split`);
  }
  assert.equal(kinds["engine-failure"], 0);
  assert.equal(kinds["incorrect-named-delta"], 0);
  assert.equal(kinds["supported-unknown"], 2);
  assert.equal(kinds.match, 14);
});

test("incomplete helper is not a skip", () => {
  const err = incomplete("engine missing");
  assert.equal(err.code, "engine-incomplete");
});
