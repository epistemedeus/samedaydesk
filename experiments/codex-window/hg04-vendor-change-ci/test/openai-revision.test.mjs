import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { lastJson, ROOT, runNode, sha256File, tmpOut } from "./helpers.mjs";

const FIXTURE = "openai-gpt35-turbo-20230613-20240125";
const expectedPath = join(ROOT, "fixtures", FIXTURE, "expected.json");
const sourcePath = join(ROOT, "fixtures", FIXTURE, "SOURCE.json");

test("public OpenAI GPT-3.5 Turbo pair matches frozen baseline via 1.4.0 kit", () => {
  const beforeHash = sha256File(expectedPath);
  const outDir = tmpOut("hg04-openai-");
  const proc = runNode(["run", "--fixture", FIXTURE, "--out-dir", outDir]);
  const receipt = lastJson(proc.stdout);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  assert.equal(receipt.wrapperStatus, "actionable");
  assert.equal(receipt.kitStatus, "actionable");
  assert.equal(receipt.machineAction, "review-list-price-fields");
  assert.equal(receipt.ci, "pass");
  assert.equal(receipt.updateBaseline, false);
  assert.equal(receipt.invoiceClaim, false);
  assert.equal(receipt.forecast, false);
  assert.equal(receipt.purchaseAuthority, false);

  const result = JSON.parse(readFileSync(join(outDir, "vendor-change-ci.json"), "utf8"));
  assert.equal(result.truth.coverage.complete, true);
  assert.equal(result.independentArithmetic.length, 2);
  assert.equal(result.kitCounts.fieldChanges, 2);
  assert.equal(result.baseline.matched, true);
  assert.equal(result.baseline.updated, false);
  assert.equal(sha256File(expectedPath), beforeHash);

  const action = JSON.parse(readFileSync(join(outDir, "machine-action.json"), "utf8"));
  assert.equal(action.kind, "review-list-price-fields");
  assert.equal(action.updateBaseline, false);
  assert.equal(action.invoiceClaim, false);

  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  assert.match(source.before.quote, /\$0\.0015 per 1K input tokens and \$0\.002 per 1K output tokens/);
  assert.match(source.after.quote, /\$0\.0005 \/1K tokens/);
  assert.equal(source.before.url, "https://openai.com/index/function-calling-and-other-api-updates/");
  assert.equal(source.after.url, "https://openai.com/index/new-embedding-models-and-api-updates/");
});
