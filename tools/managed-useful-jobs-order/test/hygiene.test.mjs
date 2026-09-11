import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { OWNED_DIR, REPO_ROOT } from "../lib/pins.mjs";

function walk(dir, into = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into);
    else into.push(full);
  }
  return into;
}

describe("owned-path hygiene", () => {
  it("diff against startingRef stays inside tools/managed-useful-jobs-order/", () => {
    const r = spawnSync(
      "git",
      ["diff", "--name-only", "5b97d1b02e786acd1895cfa1508087ae3f7a1545"],
      { encoding: "utf8", cwd: REPO_ROOT },
    );
    assert.equal(r.status, 0, r.stderr);
    const files = r.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !f.endsWith(".cursor/skills/pstack-swarm/SKILL.md"));
    const untracked = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8", cwd: REPO_ROOT });
    const extra = untracked.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const all = [...new Set([...files, ...extra])];
    for (const file of all) {
      if (file === "node_modules" || file.startsWith("node_modules/") || file === "package-lock.json") continue;
      assert.ok(
        file.startsWith("tools/managed-useful-jobs-order/"),
        `unexpected path outside owned module: ${file}`,
      );
    }
  });

  it("module source does not fetch samedaydesk.com or import server/routes", () => {
    const files = walk(join(OWNED_DIR, "lib")).concat(walk(join(OWNED_DIR, "bin")));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(
        /(?:from|import)\s+['"][^'"]*server\/(?:routes|pricing\.js)/.test(text),
        false,
        file,
      );
      assert.equal(/fetch\(\s*['"`]https:\/\/(?:agents\.)?samedaydesk\.com/.test(text), false, file);
      assert.equal(text.includes("from \"express\"") || text.includes("from 'express'"), false, file);
    }
  });

  it("does not fork the F08 receipt schema", () => {
    const files = walk(join(OWNED_DIR, "lib"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(text.includes("samedaydesk.paid-useful-jobs.receipt.v1"), false, relative(OWNED_DIR, file));
    }
  });
});
