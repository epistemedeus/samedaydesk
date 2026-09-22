import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { PACK_ROOT, REPO_ROOT, parseReceipt, runDesk } from "./helpers.mjs";
import { H32_PRIVATE_MARKERS } from "../lib/paths.mjs";

const PIN = JSON.parse(readFileSync(join(PACK_ROOT, "PIN.json"), "utf8"));

test("pack does not vendor engines or reopen H32 private primitives", () => {
  assert.equal(existsSync(join(PACK_ROOT, "engines")), false);
  const skip = new Set(["PIN.json", "SOURCE.txt", "README.md", "lib/paths.mjs"]);
  function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === "out" || name.name === ".tmp" || name.name === "node_modules") continue;
      const abs = join(dir, name.name);
      const rel = abs.slice(PACK_ROOT.length + 1);
      if (name.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/\.(mjs|js|json|md|txt)$/.test(name.name)) continue;
      if (skip.has(rel) || rel.startsWith("test/")) continue;
      const text = readFileSync(abs, "utf8");
      for (const marker of H32_PRIVATE_MARKERS) {
        assert.equal(text.includes(marker), false, `${rel} mentions ${marker}`);
      }
    }
  }
  walk(PACK_ROOT);
});

test("verify binds published 1.4.7, leaves engines unmodified, records seeded refuse", () => {
  const archive = join(REPO_ROOT, PIN.engine.archivePath);
  const sha = createHash("sha256").update(readFileSync(archive)).digest("hex");
  assert.equal(sha, PIN.engine.sha256);

  const r = runDesk(["verify", "--receipt", join(PACK_ROOT, "out", "verify-run.json")]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseReceipt(r);
  assert.equal(body.ok, true);
  assert.equal(body.code, "verify-passed");
  assert.equal(body.delivered, true);
  assert.equal(body.engine.version, "1.4.7");
  assert.equal(body.engine.sha256, PIN.engine.sha256);
  assert.equal(body.engine.enginesModified, false);
  assert.equal(body.engine.enginesSha256Before, PIN.engine.enginesTreeSha256);
  assert.equal(body.engine.enginesSha256Before, body.engine.enginesSha256After);
  assert.equal(body.seededFailure.cliInvoked, true);
  assert.equal(body.seededFailure.status, 2);
  assert.equal(body.engine.cliInvoked, true);
  assert.equal(body.seededFailure.refused, true);
  assert.equal(body.seededFailure.delivered, false);
  assert.equal(body.seededFailure.code, "same-fixture-labelled-repeat-demand");
  assert.equal(body.repeatDemand, false);
  assert.equal(body.h32PrivatePrimitivesReopened, false);
  assert.equal(body.callerFilesUnchanged, true);
  assert.equal(existsSync(join(PACK_ROOT, "out/verify-run.json")), true);
  assert.equal(existsSync(join(PACK_ROOT, "receipts/verify-run.json")), true);
});
