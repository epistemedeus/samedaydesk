import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { artifactDigests, runDirectJourney } from "../index.mjs";
import { directRow } from "../scripts/direct-baseline.mjs";
import { RECORDED } from "../install-check/recorded.mjs";
import { readJson, readText, root } from "./helpers.mjs";

const pkg = readJson("package.json");

describe("package manifest", () => {
  test("installable, zero runtime dependencies, Node 20 or later", () => {
    assert.equal(pkg.name, "@samedaydesk/workflow-kits-n12");
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    assert.equal(pkg.type, "module");
    assert.equal(pkg.engines.node, ">=20");
    assert.deepEqual(pkg.dependencies ?? {}, {});
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.peerDependencies, undefined);
    assert.equal(pkg.scripts["test:install"], "node --test install-check/cold-install.mjs");
    assert.equal(pkg.scripts.test, "node --test");
  });

  test("files allowlist entries exist and cover runtime needs, not tests", () => {
    for (const entry of pkg.files) assert.ok(existsSync(join(root, entry)), entry);
    for (const needed of ["index.mjs", "src/", "bin/", "make/", "n8n/", "vendor/", "README.md", "LICENSE-NOTES.md"]) {
      assert.ok(pkg.files.includes(needed), needed);
    }
    assert.ok(!pkg.files.some((f) => f.startsWith("test") || f.startsWith("install-check")));
  });

  test("every relative import in shipped source stays inside the allowlist", () => {
    const shipped = ["index.mjs", "bin/workflow-kits-n12.mjs", "bin/serve.mjs", "scripts/build-artifacts.mjs", "scripts/direct-baseline.mjs",
      ...["artifacts", "client-endpoint", "direct-journey", "flowassert-bridge", "make-adapter", "n8n-adapter", "period-map", "schema-adapters", "vendor-paths", "workflow-request"].map((n) => `src/${n}.mjs`)];
    const allowed = (rel) => pkg.files.some((f) => (f.endsWith("/") ? rel.startsWith(f) : rel === f));
    for (const file of shipped) {
      for (const [, spec] of readText(file).matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
        const rel = join(file, "..", spec);
        assert.ok(allowed(rel), `${file} imports ${rel}, which is not packaged`);
      }
    }
  });

  test("exports map and bin targets exist; bins are executable with a node shebang", () => {
    for (const target of Object.values(pkg.exports)) {
      const path = target.replace(/\*$/, "");
      assert.ok(existsSync(join(root, path)), target);
    }
    for (const target of Object.values(pkg.bin)) {
      const file = join(root, target);
      assert.ok(readFileSync(file, "utf8").startsWith("#!/usr/bin/env node\n"), target);
      assert.ok(statSync(file).mode & 0o111, `${target} is executable`);
    }
  });
});

test("npm test never loads the install check (only test:install runs it)", () => {
  for (const file of ["packaging", "cold-consumer", "package-integrity", "vm-run-doc"].map((n) => `test/${n}.test.mjs`)) {
    assert.doesNotMatch(readText(file), /from "[^"]*cold-install\.mjs"/, file);
  }
});

describe("packaged artifacts", () => {
  test("Make and n8n files match the recorded sha256 values", () => {
    const d = artifactDigests();
    assert.equal(d.make.sha256, RECORDED.make.sha256);
    assert.equal(d.n8n.sha256, RECORDED.n8n.sha256);
    assert.equal(d.n8n.bytes, RECORDED.n8n.bytes);
  });

  test("bin hashes and usage", () => {
    const bin = join(root, "bin/workflow-kits-n12.mjs");
    const ok = spawnSync(process.execPath, [bin, "hashes"], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout), artifactDigests());
    const bad = spawnSync(process.execPath, [bin, "nope"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
  });
});

describe("direct baseline", () => {
  test("direct journey: retryable recovered on the same key, non-retryable, changed schema adapted, no duplicate effect", () => {
    const run = runDirectJourney();
    const s = run.steps;
    assert.equal(s.staleCapture.exception, "capture_stale");
    assert.equal(s.staleCapture.retryable, true);
    assert.equal(s.uncommitted.exception, "uncommitted");
    assert.equal(s.uncommitted.retryable, true);
    assert.equal(s.accepted.decision, "accept");
    assert.equal(s.uncommitted.sameIdempotencyKey, s.accepted.idempotencyKey);
    assert.equal(s.handOff.status, 201);
    assert.equal(s.replay.recovered, true);
    assert.equal(s.replay.secondEffect, false);
    assert.equal(s.handOffAgain.duplicate, true);
    assert.equal(s.nonRetryable.exception, "continuation_file_missing");
    assert.equal(s.nonRetryable.retryable, false);
    assert.equal(s.schemaChanged.exception, "schema_changed");
    assert.equal(s.schemaChanged.complete, false);
    assert.equal(s.adapted.decision, "accept");
    assert.equal(s.adapted.adapter, "later-period-output-keys.v1");
    assert.notEqual(s.adapted.idempotencyKey, s.accepted.idempotencyKey);
    assert.equal(s.adaptedReplay.recovered, true);
    assert.equal(s.adaptedReplay.secondEffect, false);
    assert.equal(run.acceptedPathSteps, 2);
    assert.equal(run.retrySteps, 1);
    assert.equal(run.acceptanceEffects, 2);
    assert.equal(run.deliveries, 2);
    assert.equal(run.duplicateEffects, 0);
  });

  test("COMPARISON.json carries the direct row as computed and leaves native unchanged", () => {
    const committed = readJson("COMPARISON.json");
    assert.deepEqual(committed.rows.direct, JSON.parse(JSON.stringify(directRow())));
    for (const column of committed.columns) assert.equal(typeof committed.rows.direct[column], "string", column);
    assert.match(committed.rows.direct.source, /measured by local simulation/);
    assert.deepEqual(Object.keys(committed.rows), ["native", "make", "n8n", "direct"]);
  });
});
