import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { CorpusFixture } from "../src/corpus-types.ts";
import {
  NEO_DEFECT_NOT_PATCHED_ON_SDS,
  assertNotPatchedOnSds,
  scanPackClaimsNeoPatched,
  textClaimsNeoPatchedOnSds,
} from "../src/neo-scope.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(packRoot, "fixtures/corpus");
const briefsDir = join(packRoot, "briefs");

const rejection = {
  ok: false,
  rejected: true,
  code: NEO_DEFECT_NOT_PATCHED_ON_SDS,
} as const;

test("claiming F01 Neo defect was patched on SDS is rejected", () => {
  assert.deepEqual(assertNotPatchedOnSds("F01"), rejection);
  assert.deepEqual(assertNotPatchedOnSds("M-termsVersion"), rejection);
  assert.deepEqual(assertNotPatchedOnSds("termsVersion"), rejection);
});

test("claiming F07 Neo defect was patched on SDS is rejected", () => {
  assert.deepEqual(assertNotPatchedOnSds("F07"), rejection);
  assert.deepEqual(assertNotPatchedOnSds("M-F07"), rejection);
});

test("positive claim text for F01/F07/termsVersion is detected; negatives are not", () => {
  assert.equal(textClaimsNeoPatchedOnSds("F01 was patched on SDS"), true);
  assert.equal(textClaimsNeoPatchedOnSds("F07 harness_fixture was patched on SDS"), true);
  assert.equal(textClaimsNeoPatchedOnSds("termsVersion identity was patched on SDS"), true);
  assert.equal(textClaimsNeoPatchedOnSds("M-termsVersion is not patched on SDS"), false);
  assert.equal(textClaimsNeoPatchedOnSds("M-F07 must not be patched on SDS"), false);
  assert.equal(textClaimsNeoPatchedOnSds("F01 integer termsVersion vs F17/F02 content hash"), false);
});

test("briefs exist for M-termsVersion, M-F07, and M-F02-pr", () => {
  const terms = join(briefsDir, "M-termsVersion.md");
  const f07 = join(briefsDir, "M-F07.md");
  const f02 = join(briefsDir, "M-F02-pr.md");
  assert.equal(existsSync(terms), true);
  assert.equal(existsSync(f07), true);
  assert.equal(existsSync(f02), true);
  const termsText = readFileSync(terms, "utf8");
  const f07Text = readFileSync(f07, "utf8");
  const f02Text = readFileSync(f02, "utf8");
  assert.match(termsText, /not patched on SDS/);
  assert.match(f07Text, /not patched on SDS/);
  assert.match(termsText, /hash-based terms identity/i);
  assert.match(termsText, /do not silently coerce integer/i);
  assert.match(f07Text, /harness_fixture/);
  assert.match(f07Text, /not customer/);
  assert.match(f02Text, /PR create URL only/);
  assert.match(f02Text, /No SDS code change/);
  assert.equal(textClaimsNeoPatchedOnSds(termsText), false);
  assert.equal(textClaimsNeoPatchedOnSds(f07Text), false);
});

function loadCorpus(id: string): CorpusFixture {
  const path = join(corpusDir, `${id}.json`);
  assert.equal(existsSync(path), true, `missing fixture ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as CorpusFixture;
}

test("corpus fixtures dispositions match MONITOR out-of-scope briefs", () => {
  const terms = loadCorpus("M-termsVersion");
  assert.equal(terms.id, "M-termsVersion");
  assert.equal(terms.disposition, "briefed_out_of_scope");
  assert.equal(terms.inSdsScope, false);
  assert.equal(terms.kind, "brief");
  assert.equal(terms.briefPath, "briefs/M-termsVersion.md");
  assert.equal(terms.saleState, "not_a_sale");
  assert.equal(terms.provenance, "fixture");
  assert.equal(terms.authorized, false);

  const f07 = loadCorpus("M-F07");
  assert.equal(f07.id, "M-F07");
  assert.equal(f07.disposition, "briefed_out_of_scope");
  assert.equal(f07.inSdsScope, false);
  assert.equal(f07.kind, "brief");
  assert.equal(f07.briefPath, "briefs/M-F07.md");
  assert.equal(f07.saleState, "not_a_sale");
  assert.equal(f07.provenance, "fixture");
  assert.equal(f07.authorized, false);

  const f02 = loadCorpus("M-F02-pr");
  assert.equal(f02.id, "M-F02-pr");
  assert.equal(f02.disposition, "noted");
  assert.equal(f02.kind, "note");
  assert.equal(f02.briefPath, "briefs/M-F02-pr.md");
  assert.equal(f02.saleState, "not_a_sale");
  assert.equal(f02.provenance, "fixture");
  assert.equal(f02.authorized, false);
});

test("pack src and briefs do not claim F01/F07/termsVersion were patched on SDS", () => {
  const scan = scanPackClaimsNeoPatched();
  assert.equal(scan.ok, true);
  assert.equal(scan.rejected, false);
  assert.deepEqual(scan.hits, []);
  assert.ok(scan.files.some((name) => name === "src/neo-scope.ts"));
  assert.ok(scan.files.some((name) => name === "briefs/M-termsVersion.md"));
  assert.ok(scan.files.some((name) => name === "briefs/M-F07.md"));
});
