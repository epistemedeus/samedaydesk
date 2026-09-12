import assert from "node:assert/strict";
import test from "node:test";
import { loadCorpus, fixturePath } from "../lib/corpus.mjs";
import { runEngineCli } from "../lib/engine-cli.mjs";
import { classifyReplay } from "../lib/classify.mjs";
import { enginePin, ensureEngineRoot } from "../lib/ensure-engine.mjs";

test("pinned Co11 engine is present; missing engine is incomplete", () => {
  const root = ensureEngineRoot();
  assert.match(root, /lockfile-pin-delta/);
  assert.equal(enginePin().sha, "e81efc8ab71b1bde88eca743d297149e61bbb6f2");
});

test("corpus replay against current Co11 CLI", () => {
  const corpus = loadCorpus();
  assert.equal(corpus.cases.length >= 20, true);
  const kinds = { match: 0, gap: 0, "valid-refusal": 0, "engine-failure": 0 };
  for (const caseSpec of corpus.cases) {
    const cli = runEngineCli({
      before: fixturePath(caseSpec.before),
      after: fixturePath(caseSpec.after),
    });
    const finding = classifyReplay(caseSpec, cli);
    kinds[finding.kind] = (kinds[finding.kind] || 0) + 1;
    assert.equal(
      finding.ok,
      true,
      `${caseSpec.id}: ${finding.detail} exit=${cli.status} stdout=${cli.stdout}`,
    );
    assert.notEqual(finding.kind, "engine-failure", caseSpec.id);
    if (caseSpec.engineAtPin.kind === "gap") {
      assert.equal(finding.kind, "gap");
      assert.equal(finding.finding, "resolved-source-omitted");
      assert.equal(finding.domainOutcome, "explained-change");
    }
    if (caseSpec.domain.outcome === "valid-refusal") {
      assert.equal(finding.kind, "valid-refusal");
      assert.equal(cli.json.ok, false);
      assert.equal(cli.json.refused, true);
    }
    if (finding.kind === "match" && caseSpec.domain.outcome === "explained-change") {
      assert.equal(cli.json.ok, true);
      assert.equal(cli.json.status, "actionable");
      assert.equal(cli.json.purchaseAuthority, false);
    }
  }
  assert.equal(kinds["engine-failure"], 0);
  assert.equal(kinds.gap, 2);
  assert.ok(kinds.match >= 6);
  assert.ok(kinds["valid-refusal"] >= 10);
});
