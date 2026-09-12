import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compareCorpus, loadCorpus } from "../src/compare.mjs";
import { OBSERVED } from "../src/digest.mjs";

const corpusPath = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus.json");

test("corpus is finite published GET /extract demos with path+query targets", () => {
  const corpus = loadCorpus(corpusPath);
  assert.ok(Array.isArray(corpus.candidates));
  assert.ok(corpus.candidates.length >= 8);
  for (const c of corpus.candidates) {
    assert.equal(c.method, "GET");
    assert.equal(c.target.startsWith("/extract"), true, c.id);
    assert.equal(c.target.includes("://agents."), false, c.id);
    assert.ok(c.source?.path, c.id);
  }
});

test("corpus replay: triple digest matches encoded example.com publications only", () => {
  const compared = compareCorpus(loadCorpus(corpusPath));
  assert.ok(compared.matches.triple.length >= 1);
  for (const id of compared.matches.triple) {
    const row = compared.rows.find((r) => r.id === id);
    assert.equal(row.target, "/extract?url=https%3A%2F%2Fexample.com");
    assert.equal(row.digest, OBSERVED.triple);
  }
  const unencoded = compared.rows.filter((r) => r.target === "/extract?url=https://example.com");
  assert.ok(unencoded.length >= 1);
  for (const row of unencoded) {
    assert.equal(row.matchTriple, false);
    assert.equal(row.matchFourth, false);
  }
});

test("corpus replay: fourth observed digest remains unresolved", () => {
  const compared = compareCorpus(loadCorpus(corpusPath));
  assert.deepEqual(compared.matches.fourth, []);
  for (const row of compared.rows) {
    assert.notEqual(row.digest, OBSERVED.fourth);
  }
});
