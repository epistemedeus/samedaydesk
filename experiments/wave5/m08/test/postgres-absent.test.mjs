import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  "bin/route-consumer.mjs",
  "lib/run-consumer.mjs",
  "lib/resolve-engine.mjs",
  "lib/read-locator.mjs",
  "lib/detect-format.mjs",
];

test("Postgres is not an input for this file/HTTP catalog consumer", () => {
  for (const rel of files) {
    const source = readFileSync(join(here, "..", rel), "utf8");
    assert.equal(source.includes("postgres"), false, rel);
    assert.equal(source.includes("DATABASE_URL"), false, rel);
  }
});
