import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SCHEMA_VERSION, SOURCE_IDS } from "../vendor/s12-observatory/contract.js";
import { parseSnapshot } from "../vendor/s12-observatory/envelope.js";
import { releaseGateIdentity } from "../src/consumers/release-gate.mjs";
import { assertProjectionProvenance, projectionIntegration } from "../src/consumers/source-projection.mjs";
import { RELEASE_GATE_PIN } from "../src/runtime/release-gate-pin.mjs";
import { packageRoot } from "./support.mjs";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(full);
  }
  return files;
}

test("pins match the public release-gate archive and the vendored projection", async () => {
  const pins = JSON.parse(await readFile(path.join(packageRoot, "PINS.json"), "utf8"));
  assert.equal(releaseGateIdentity.version, "0.1.4");
  assert.equal(releaseGateIdentity.sha256, RELEASE_GATE_PIN.sha256);
  assert.equal(releaseGateIdentity.bytes, 16254);
  assert.equal(releaseGateIdentity.url, RELEASE_GATE_PIN.url);
  assert.equal(releaseGateIdentity.receiptSchema, "release-gate.receipt.v1");
  assert.equal(releaseGateIdentity.acquiredFrom === "public-get" || releaseGateIdentity.acquiredFrom === "verified-cache", true);
  assert.equal(releaseGateIdentity.moduleResolved, true);
  assert.equal(releaseGateIdentity.executableBound, true);
  const gateArchive = path.join(packageRoot, "../../public/downloads/release-gate/0.1.4/release-gate-0.1.4.tgz");
  const archivedIndex = execFileSync("tar", ["-xOf", gateArchive, "package/src/index.mjs"], { maxBuffer: 1024 * 1024 });
  const consumedIndex = readFileSync(releaseGateIdentity.modulePath);
  assert.equal(releaseGateIdentity.moduleSha256, createHash("sha256").update(archivedIndex).digest("hex"));
  assert.equal(Buffer.compare(consumedIndex, archivedIndex), 0);
  assert.equal(pins.imports["release-gate"].schema, "release-gate.receipt.v1");
  assert.equal(pins.imports["release-gate"].version, "0.1.4");
  assert.equal(pins.imports["release-gate"].sha256, RELEASE_GATE_PIN.sha256);
  assert.equal(pins.imports["release-gate"].privateSibling, false);
  assert.equal(pins.imports["route-lock"].schema, "route-lock.decision.v1");
  assert.equal(pins.imports["route-lock"].loadedAtRuntime, false);
  assert.equal(pins.imports["route-lock"].path, null);
  const adapter = await readFile(path.join(packageRoot, "src/adapters/route-lock.mjs"), "utf8");
  assert.match(adapter, /export const DECISION_SCHEMA = "route-lock.decision.v1"/);
  assert.match(adapter, /"endpoint_availability"/);
  assert.equal(SCHEMA_VERSION, "pilot.external-observatory.v1");
  assert.deepEqual([...SOURCE_IDS], ["moltjobs", "x402stats", "smithery_mcp"]);
  assert.equal(pins.imports.observatory.schemaVersion, SCHEMA_VERSION);
  assert.equal(pins.imports.observatory.s12MaintainedProjection, "maintained");
  assert.equal(pins.imports.observatory.uiCopied, false);
  assert.equal(pins.imports.routeLockReleaseGateCompatibility.amendment.status, "superseded");
  assert.equal(pins.imports.routeLockReleaseGateCompatibility.consumedRuntime["release-gate"], "0.1.4");
  assert.equal(pins.imports.routeLockReleaseGateCompatibility.consumedRuntime.privateSibling, false);
  assert.equal(typeof parseSnapshot, "function");
  assert.equal(projectionIntegration.status, "maintained");
  assert.equal(projectionIntegration.tipIncludesS12Writer, false);
  assert.equal(projectionIntegration.consumedFrom.commit, "1d9e6eb50ded038acd9511bc689a23f2fbb15eac");
  const provenance = assertProjectionProvenance();
  assert.equal(provenance.projectionSha256, pins.imports.observatory.consumedFrom.sha256);
  const vendorNames = await readFile(path.join(packageRoot, "vendor/s12-observatory/PROVENANCE.json"), "utf8");
  assert.equal(vendorNames.includes("page.js"), true);
  assert.equal(JSON.parse(vendorNames).excluded.includes("page.js"), true);

  const publicContract = path.join(packageRoot, "../../public/labs/agent-economy-observatory/contract.js");
  try {
    const vendorContract = await readFile(path.join(packageRoot, "vendor/s12-observatory/contract.js"));
    const published = await readFile(publicContract);
    assert.equal(createHash("sha256").update(vendorContract).digest("hex"), createHash("sha256").update(published).digest("hex"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const sources = await sourceFiles(path.join(packageRoot, "src"));
  for (const file of sources) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /from\s+["'](?:\.\.\/)+release-gate\//, file);
    assert.doesNotMatch(text, /from\s+["'][^"']*packages\/release-gate/, file);
  }
});
