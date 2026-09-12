import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { OWNED_DIR } from "../lib/pins.mjs";

function walk(dir, into = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into);
    else into.push(full);
  }
  return into;
}

describe("owned-path hygiene", () => {
  it("owned module files do not vendor a second wrapper kernel", () => {
    const files = walk(join(OWNED_DIR, "lib")).concat(walk(join(OWNED_DIR, "bin")));
    for (const file of files) {
      const rel = relative(OWNED_DIR, file);
      const text = readFileSync(file, "utf8");
      assert.equal(text.includes("export function buildReceipt"), false, rel);
      assert.equal(text.includes("export function createExecutor"), false, rel);
      assert.equal(text.includes("export function runEngineJob"), false, rel);
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
      assert.equal(text.includes("useful-jobs.mjs"), false, `${file} still spawns the competing useful-jobs CLI`);
    }
  });

  it("nests D01 receipt without forking a second wrapper kernel", () => {
    const files = walk(join(OWNED_DIR, "lib"));
    for (const file of files) {
      const rel = relative(OWNED_DIR, file);
      const text = readFileSync(file, "utf8");
      assert.equal(text.includes("export function buildReceipt"), false, rel);
      assert.equal(text.includes("export function createExecutor"), false, rel);
      assert.equal(text.includes("export function runEngineJob"), false, rel);
    }
    const client = readFileSync(join(OWNED_DIR, "lib/wrapper-client.mjs"), "utf8");
    assert.match(client, /createExecutor/);
    assert.match(client, /runPaidOffer/);
  });
});
