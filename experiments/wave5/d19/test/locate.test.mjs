import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { CO16_SHA, CO20_SHA, D19_ROOT, PIN } from "../lib/pins.mjs";
import { Incomplete, ensureD19Deps, locateCo16, locateCo20 } from "../lib/locate.mjs";

describe("pin materialization", () => {
  it("installs pg and locates Co20/Co16 CLIs at the pinned SHAs or in-tree successors", () => {
    const deps = ensureD19Deps();
    assert.equal(existsSync(deps.pg), true);
    const co20 = locateCo20();
    const co16 = locateCo16();
    assert.equal(existsSync(co20.cli), true, co20.cli);
    assert.equal(existsSync(co16.cli), true, co16.cli);
    assert.equal(existsSync(D19_ROOT), true);
    if (co20.source === "pin-worktree") {
      assert.equal(co20.sha, CO20_SHA);
    }
    if (co16.source === "pin-worktree") {
      assert.equal(co16.sha, CO16_SHA);
    }
    assert.equal(PIN.unlikeTerms.forcedEquality, false);
  });

  it("names missing pins as incomplete rather than a passing skip", () => {
    assert.equal(new Incomplete("missing").code, "incomplete");
  });
});
