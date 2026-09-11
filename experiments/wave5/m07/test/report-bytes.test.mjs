import assert from "node:assert/strict";
import test from "node:test";
import { fixturePath } from "../lib/corpus.mjs";
import { runEngineCli } from "../lib/engine-cli.mjs";

test("stdout digest is the first changed pin hash, not the report bytes", () => {
  const cli = runEngineCli({
    before: fixturePath("fixtures/npm-v3-version/before.json"),
    after: fixturePath("fixtures/npm-v3-version/after.json"),
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.json.digest, /^[0-9a-f]{64}$/);
  assert.match(cli.reportSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(cli.json.digest, cli.reportSha256);
  assert.equal(cli.json.digest, cli.report.changed[0].after.termsHash);
  assert.notEqual(cli.json.digest, cli.report.changed[0].before.termsHash);
});
