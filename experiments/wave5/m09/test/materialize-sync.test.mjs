import assert from "node:assert/strict";
import test from "node:test";
import { CASES } from "../lib/cases.mjs";
import { loadCase } from "../lib/corpus.mjs";

test("materialized snapshot files match authored case documents", () => {
  for (const authored of CASES) {
    const onDisk = loadCase(authored.id);
    assert.deepEqual(onDisk.before, authored.before, authored.id);
    assert.deepEqual(onDisk.after, authored.after, authored.id);
    assert.equal(onDisk.control, authored.control);
    assert.equal(onDisk.expected.verdict, authored.expected.verdict);
  }
});
