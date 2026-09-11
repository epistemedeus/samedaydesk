import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { OWNED_DIR, REPO_ROOT, SIBLINGS } from "../lib/pins.mjs";

function walkFiles(dir, into = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkFiles(abs, into);
    else into.push(abs);
  }
  return into;
}

describe("sibling ownership is not rewritten", () => {
  it("does not create F08, W2-06, or F11 trees on this branch", () => {
    assert.equal(existsSync(join(REPO_ROOT, SIBLINGS.F08.dir)), false);
    assert.equal(existsSync(join(REPO_ROOT, "tools/cold-start-assessment")), false);
    assert.equal(existsSync(join(REPO_ROOT, "tools/verify/cold-start")), false);
  });

  it("owned sources do not import or copy F08 wrappers", () => {
    const files = walkFiles(join(OWNED_DIR, "lib")).concat(walkFiles(join(OWNED_DIR, "bin")));
    const blob = files
      .filter((path) => path.endsWith(".mjs"))
      .map((path) => `${relative(OWNED_DIR, path)}\n${readFileSync(path, "utf8")}`)
      .join("\n");
    assert.doesNotMatch(blob, /server\/paid-useful-jobs\/lib\/wrapper/);
    assert.doesNotMatch(blob, /from ".*paid-useful-jobs/);
    assert.match(blob, /Do not rewrite F08 wrappers/);
    assert.match(blob, /listing-repair-packet/);
  });

  it("does not invent a paying maintainer in owned copy", () => {
    const readme = readFileSync(join(OWNED_DIR, "README.md"), "utf8");
    assert.doesNotMatch(readme, /paying customer exists/i);
    assert.match(readme, /Not a live second-customer purchase/);
  });
});
