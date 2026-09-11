import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { compareCatalogOutputs } from "../lib/compare.mjs";
import { harnessRoot, tmpDir } from "./helpers.mjs";

function pairDirs(prefix, filesA, filesB) {
  const root = tmpDir(prefix);
  const a = join(root, "a");
  const b = join(root, "b");
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  for (const [name, src] of Object.entries(filesA)) copyFileSync(src, join(a, name));
  for (const [name, src] of Object.entries(filesB)) copyFileSync(src, join(b, name));
  return { a, b };
}

test("fixture: generatedAt-only JSON plus markdown timestamps is labelled-drift", () => {
  const fx = join(harnessRoot, "fixtures/labelled-drift");
  const { a, b } = pairDirs("orh-ld-", {
    "upgrade-brief.json": join(fx, "upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.md"),
  }, {
    "upgrade-brief.json": join(fx, "upgrade-brief.b.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.b.md"),
  });
  const r = compareCatalogOutputs({
    outA: a,
    outB: b,
    outputNames: ["upgrade-brief.json", "upgrade-brief.md"],
  });
  assert.equal(r.classification, "labelled-drift");
  assert.equal(r.jsonIdentical, true);
  assert.equal(r.allBytesEqual, false);
  assert.equal(r.files.find((f) => f.name === "upgrade-brief.json").timestampChatterOnly, true);
});

test("fixture: identity JSON change is identity-break even with generatedAt present", () => {
  const fx = join(harnessRoot, "fixtures");
  const { a, b } = pairDirs("orh-ib-", {
    "upgrade-brief.json": join(fx, "labelled-drift/upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "labelled-drift/upgrade-brief.md"),
  }, {
    "upgrade-brief.json": join(fx, "identity-break/upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "labelled-drift/upgrade-brief.md"),
  });
  const r = compareCatalogOutputs({
    outA: a,
    outB: b,
    outputNames: ["upgrade-brief.json", "upgrade-brief.md"],
  });
  assert.equal(r.classification, "identity-break");
  assert.equal(r.jsonIdentical, false);
});

test("fixture: byte-identical catalog files are identical", () => {
  const fx = join(harnessRoot, "fixtures/labelled-drift");
  const { a, b } = pairDirs("orh-id-", {
    "upgrade-brief.json": join(fx, "upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.md"),
  }, {
    "upgrade-brief.json": join(fx, "upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.md"),
  });
  const r = compareCatalogOutputs({
    outA: a,
    outB: b,
    outputNames: ["upgrade-brief.json", "upgrade-brief.md"],
  });
  assert.equal(r.classification, "identical");
  assert.equal(r.jsonIdentical, true);
  assert.equal(readFileSync(join(a, "upgrade-brief.json")).equals(readFileSync(join(b, "upgrade-brief.json"))), true);
});

test("markdown body change is identity-break; timestamp chatter is not proof of equivalence", () => {
  const fx = join(harnessRoot, "fixtures/labelled-drift");
  const { a, b } = pairDirs("orh-md-body-", {
    "upgrade-brief.json": join(fx, "upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.md"),
  }, {
    "upgrade-brief.json": join(fx, "upgrade-brief.b.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.md"),
  });
  writeFileSync(
    join(b, "upgrade-brief.md"),
    "# API upgrade brief\n\nStatus: **informational**\n\nTHIS BODY IS DIFFERENT AND NOT A TIMESTAMP\n",
  );
  const r = compareCatalogOutputs({
    outA: a,
    outB: b,
    outputNames: ["upgrade-brief.json", "upgrade-brief.md"],
  });
  assert.equal(r.classification, "identity-break");
  assert.equal(r.jsonIdentical, true);
  assert.equal(r.files.find((f) => f.name === "upgrade-brief.md").bytesEqual, false);
  assert.equal(r.files.find((f) => f.name === "upgrade-brief.md").timestampChatterOnly, false);
  assert.equal(r.files.find((f) => f.name === "upgrade-brief.md").jsonIdentical, false);
});

test("non-catalog extra files are ignored", () => {
  const fx = join(harnessRoot, "fixtures/labelled-drift");
  const { a, b } = pairDirs("orh-extra-", {
    "upgrade-brief.json": join(fx, "upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.md"),
    "noise.txt": join(fx, "upgrade-brief.md"),
  }, {
    "upgrade-brief.json": join(fx, "upgrade-brief.json"),
    "upgrade-brief.md": join(fx, "upgrade-brief.md"),
  });
  const r = compareCatalogOutputs({
    outA: a,
    outB: b,
    outputNames: ["upgrade-brief.json", "upgrade-brief.md"],
  });
  assert.equal(r.classification, "identical");
  assert.equal(r.files.some((f) => f.name === "noise.txt"), false);
});
