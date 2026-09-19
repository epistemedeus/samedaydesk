import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT } from "./helpers.mjs";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

test("pack source does not import checkout, stripe, or live MCP", () => {
  const files = walk(join(PACK_ROOT, "src")).concat(walk(join(PACK_ROOT, "bin")));
  const forbidden =
    /seller-repair-checkout|create-payment-intent|from ["']stripe["']|new Stripe\(|fetch\(/;
  for (const file of files) {
    if (!file.endsWith(".mjs")) continue;
    const src = readFileSync(file, "utf8");
    assert.equal(forbidden.test(src), false, file);
  }
});

test("write boundary stays under packs/verifiers/mcp-iserror-not-settle", () => {
  const files = walk(PACK_ROOT);
  for (const file of files) {
    assert.match(file.replaceAll("\\", "/"), /packs\/verifiers\/mcp-iserror-not-settle\//);
  }
});
