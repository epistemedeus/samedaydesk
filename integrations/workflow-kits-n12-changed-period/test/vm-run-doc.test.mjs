import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { readJson, readText, root } from "./helpers.mjs";

const doc = readText("VM-RUN.md");
const pkg = readJson("package.json");

describe("VM-RUN.md", () => {
  test("names the branch and sparse path of this package", () => {
    assert.match(doc, /BRANCH=codex\/n12-workflow-kits-changed-period-20261112/);
    assert.match(doc, /git sparse-checkout set integrations\/workflow-kits-n12-changed-period\n/);
    assert.ok(doc.indexOf("sparse-checkout set") < doc.indexOf("git checkout --detach"));
  });

  test("every script and bin it runs exists, and npm scripts match package.json", () => {
    for (const [, rel] of doc.matchAll(/^node ((?:scripts|bin)\/[\w.-]+\.mjs)/gm)) assert.ok(existsSync(join(root, rel)), rel);
    assert.match(doc, /npm test /);
    assert.match(doc, /npm run test:install /);
    assert.ok(pkg.scripts.test && pkg.scripts["test:install"]);
  });

  test("the vendored suite counts it states are the vendored test counts", () => {
    const count = (rel) => (readText(rel).match(/^\s*test\(/gm) ?? []).length;
    const rj = ["recurring-journey.test.mjs", "quote-continuity.test.mjs", "owed-reference.test.mjs"].map((f) => count(`vendor/payment-rail/recurring-journey/${f}`)).reduce((a, b) => a + b, 0);
    assert.match(doc, new RegExp(`recurring journey ${rj}`));
    assert.match(doc, /vendor check ok: 36 files/);
  });
});
