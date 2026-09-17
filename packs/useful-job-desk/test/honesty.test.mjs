import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isPresentFile, outputsPresent } from "../lib/engine.mjs";
import { outputFingerprint, stripVolatile } from "../lib/hash.mjs";
import { honestDelivered } from "../lib/receipt.mjs";

test("directory named like an output is not a delivered file", () => {
  const outDir = mkdtempSync(join(tmpdir(), "uj-desk-dir-out-"));
  mkdirSync(join(outDir, "pin-delta.json"));
  writeFileSync(join(outDir, "pin-delta.md"), "md\n");
  assert.equal(isPresentFile(outDir, "pin-delta.json"), false);
  assert.equal(isPresentFile(outDir, "pin-delta.md"), true);
  assert.deepEqual(outputsPresent(outDir, ["pin-delta.json", "pin-delta.md"]), ["pin-delta.md"]);
  assert.equal(
    honestDelivered({
      status: 0,
      promisedOutputs: ["pin-delta.json", "pin-delta.md"],
      missingOutputs: ["pin-delta.json"],
    }),
    false,
  );
});

test("output names that leave out-dir are not present", () => {
  const parent = mkdtempSync(join(tmpdir(), "uj-desk-escape-"));
  const outDir = join(parent, "out");
  mkdirSync(outDir);
  writeFileSync(join(parent, "secret.txt"), "secret\n");
  assert.equal(isPresentFile(outDir, "../secret.txt"), false);
  assert.deepEqual(outputsPresent(outDir, ["../secret.txt"]), []);
});

test("missing promised output cannot report delivered", () => {
  assert.equal(
    honestDelivered({
      status: 0,
      engineJson: { ok: true },
      promisedOutputs: ["pin-delta.json", "pin-delta.md"],
      missingOutputs: ["pin-delta.md"],
    }),
    false,
  );
  assert.equal(
    honestDelivered({
      status: 0,
      engineJson: { ok: true },
      promisedOutputs: [],
      missingOutputs: [],
    }),
    false,
  );
});

test("stable fingerprint ignores generatedAt and outDir", () => {
  const outA = mkdtempSync(join(tmpdir(), "uj-desk-fp-a-"));
  const outB = mkdtempSync(join(tmpdir(), "uj-desk-fp-b-"));
  const bodyA = {
    counts: { changed: 1 },
    generatedAt: "2026-01-01T00:00:00.000Z",
    outDir: outA,
    caller: { after: "/tmp/a.json" },
    digest: "aaa",
  };
  const bodyB = {
    counts: { changed: 1 },
    generatedAt: "2026-01-02T00:00:00.000Z",
    outDir: outB,
    caller: { after: "/tmp/b.json" },
    digest: "bbb",
  };
  writeFileSync(join(outA, "pin-delta.json"), `${JSON.stringify(bodyA)}\n`);
  writeFileSync(join(outB, "pin-delta.json"), `${JSON.stringify(bodyB)}\n`);
  writeFileSync(join(outA, "pin-delta.md"), "same\n");
  writeFileSync(join(outB, "pin-delta.md"), "same\n");
  assert.deepEqual(stripVolatile(bodyA).counts, { changed: 1 });
  assert.equal(
    outputFingerprint(outA, ["pin-delta.json", "pin-delta.md"]),
    outputFingerprint(outB, ["pin-delta.json", "pin-delta.md"]),
  );
});
