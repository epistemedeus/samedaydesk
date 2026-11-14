import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { readJson, root } from "./helpers.mjs";

const pins = readJson("vendor/PINS.json");
const FULL = /^[0-9a-f]{40}$/;

describe("vendored Useful Commerce source", () => {
  test("every vendored file matches its pinned sha256 (unchanged)", () => {
    assert.equal(pins.files.length, 36);
    for (const file of pins.files) {
      const actual = createHash("sha256").update(readFileSync(join(root, "vendor", file.path))).digest("hex");
      assert.equal(actual, file.sha256, file.path);
      assert.match(file.sha, FULL);
    }
  });

  test("pins are full SHAs at the current heads of the stack", () => {
    const heads = Object.fromEntries(pins.stack.map((s) => [s.pull, s.head]));
    assert.deepEqual(heads, {
      682: "fb8228a90a3f12221451ab27a3c9dc9eccc5ab6e",
      684: "175245e38f86431dcdfcf6607580e3af0b999d68",
      687: "0230cda1743a25840b808573b7be3a4b11d42b9a",
      689: "f04125452e8e75d4f6aa7932bb013709d4f4d53e",
    });
    const source = Object.fromEntries(pins.sources.map((s) => [s.name, s]));
    assert.equal(source["recurring-journey"].sha, heads[689]);
    assert.equal(source["job-contract"].sha, heads[682]);
    assert.equal(source["request-contract"].sha, heads[682]);
  });

  test("the owed-reference and quote-continuity modules are vendored", () => {
    const paths = pins.files.map((f) => f.path);
    for (const p of ["payment-rail/recurring-journey/owed-reference.mjs", "payment-rail/recurring-journey/quote-continuity.mjs", "payment-rail/recurring-journey/journey.mjs"]) assert.ok(paths.includes(p), p);
  });
});
