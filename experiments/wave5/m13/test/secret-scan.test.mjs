import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, into = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, into);
    else into.push(path);
  }
  return into;
}

test("owned kit files do not contain credential values", () => {
  const files = walk(KIT).filter((path) => !path.endsWith(".tgz"));
  const banned = [
    /sk_live_[A-Za-z0-9]+/,
    /sk_test_[A-Za-z0-9]{10,}/,
    /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/,
    /xox[baprs]-[A-Za-z0-9-]+/,
  ];
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${path} matched ${pattern}`);
    }
  }
});
