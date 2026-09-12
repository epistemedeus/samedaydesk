import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { acquireLocalArtifacts, portableAcquisitionUnsupported } from "../lib/acquire.mjs";
import { ConsumerRefuse } from "../lib/encode-inputs.mjs";
import { sha256Bytes } from "../lib/digest-named.mjs";
import { tmpWork } from "./helpers.mjs";

const jsonName = "budget-impact.json";
const mdName = "budget-impact.md";

function metaFor(buf, name) {
  return { name, bytes: buf.length, sha256: sha256Bytes(buf), path: "/host/should-be-ignored/" + name };
}

describe("W5-D14 local acquisition", () => {
  it("surfaces unsupported-portable-acquisition when only host paths exist", () => {
    const result = portableAcquisitionUnsupported();
    assert.equal(result.code, "unsupported-portable-acquisition");
    assert.equal(result.httpArtifactsDelivered, false);
    assert.equal(result.source, null);
    assert.match(result.reason, /not acquisition authority/);
  });

  it("copies exact local bytes and ignores HTTP path", () => {
    const work = tmpWork("d14-acq-");
    const localDir = join(work, "local");
    const destDir = join(work, "dest");
    mkdirSync(localDir);
    const json = Buffer.from('{"ok":true,"oracle":"changed"}\n');
    const md = Buffer.from("changed report\n");
    writeFileSync(join(localDir, jsonName), json);
    writeFileSync(join(localDir, mdName), md);
    const got = acquireLocalArtifacts({
      outputs: [
        { ...metaFor(json, jsonName), path: "/var/host/runOut/budget-impact.json" },
        { ...metaFor(md, mdName), path: "/var/host/runOut/budget-impact.md" },
      ],
      expectedNames: [jsonName, mdName],
      localDir,
      destDir,
    });
    assert.equal(got.code, "local-acquired");
    assert.equal(got.source, "local");
    assert.equal(got.httpArtifactsDelivered, false);
    assert.equal(readFileSync(join(destDir, jsonName)).equals(json), true);
    assert.equal(existsSync("/var/host/runOut/budget-impact.json"), false);
  });

  it("rejects missing, hash-mismatch (stale/corrupt), and symlink artifacts", () => {
    const work = tmpWork("d14-acq-bad-");
    const json = Buffer.from('{"ok":true}\n');
    const md = Buffer.from("md\n");
    const outputs = [metaFor(json, jsonName), metaFor(md, mdName)];

    const missingDir = join(work, "missing");
    mkdirSync(missingDir);
    writeFileSync(join(missingDir, jsonName), json);
    assert.throws(
      () => acquireLocalArtifacts({ outputs, expectedNames: [jsonName, mdName], localDir: missingDir, destDir: join(work, "d1") }),
      (err) => err instanceof ConsumerRefuse && err.code === "missing-artifact",
    );

    const staleDir = join(work, "stale");
    mkdirSync(staleDir);
    const stale = Buffer.from("x".repeat(json.length));
    writeFileSync(join(staleDir, jsonName), stale);
    writeFileSync(join(staleDir, mdName), md);
    assert.throws(
      () => acquireLocalArtifacts({ outputs, expectedNames: [jsonName, mdName], localDir: staleDir, destDir: join(work, "d2") }),
      (err) => err instanceof ConsumerRefuse && err.code === "artifact-hash-mismatch",
    );

    const corruptDir = join(work, "corrupt");
    mkdirSync(corruptDir);
    writeFileSync(join(corruptDir, jsonName), Buffer.from("y".repeat(json.length)));
    writeFileSync(join(corruptDir, mdName), md);
    assert.throws(
      () => acquireLocalArtifacts({ outputs, expectedNames: [jsonName, mdName], localDir: corruptDir, destDir: join(work, "d3") }),
      (err) => err instanceof ConsumerRefuse && err.code === "artifact-hash-mismatch",
    );

    const linkDir = join(work, "link");
    const outside = join(work, "outside.json");
    writeFileSync(outside, json);
    mkdirSync(linkDir);
    symlinkSync(outside, join(linkDir, jsonName));
    writeFileSync(join(linkDir, mdName), md);
    assert.throws(
      () => acquireLocalArtifacts({ outputs, expectedNames: [jsonName, mdName], localDir: linkDir, destDir: join(work, "d4") }),
      (err) => err instanceof ConsumerRefuse && err.code === "symlink-artifact",
    );
  });
});
