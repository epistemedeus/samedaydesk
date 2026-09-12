import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PACKAGE_ROOT } from "../lib/cli.mjs";

const libDir = join(PACKAGE_ROOT, "lib");

test("does not import merchant compare.mjs or MERCHANT_INPUT_ROOT", () => {
  const files = readdirSync(libDir).filter((name) => name.endsWith(".mjs"));
  const joined = files.map((name) => `${name}\n${readFileSync(join(libDir, name), "utf8")}`).join("\n");
  assert.doesNotMatch(joined, /examples\/customer-x402\/src\/page-change\/compare\.mjs/);
  assert.doesNotMatch(joined, /MERCHANT_INPUT_ROOT/);
  assert.doesNotMatch(joined, /vendor\/page-change-bridge/);
  assert.doesNotMatch(joined, /page-change\/vendor\/change-digest/);
});

test("bin is the public CLI", () => {
  const bin = readFileSync(join(PACKAGE_ROOT, "bin/page-change.mjs"), "utf8");
  assert.match(bin, /runCli/);
});
