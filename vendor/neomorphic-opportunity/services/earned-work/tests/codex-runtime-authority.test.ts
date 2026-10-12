import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createReproductionDispatcher, loadReproductionRuntime } from "../src/reproduction-verifier.js";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../experiments/wave5/e18");

test("configured custom spec is rechecked before verification; explicitly rebound terms work", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "ew-codex-authority-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(source, root, { recursive: true, filter: (p) => !p.includes("node_modules") });
  const specPath = path.join(root, "fixtures/custom-task.json");
  const spec = JSON.parse(readFileSync(path.join(root, "fixtures/task.sds52-stale-outdir.json"), "utf8"));
  writeFileSync(specPath, JSON.stringify(spec));
  const config = { root, specPath, executable: path.join(root, "bin/e18-repro.mjs"), timeoutMs: 15_000 };
  const loaded = loadReproductionRuntime(config);
  const hook = createReproductionDispatcher(loaded);
  const submission = JSON.parse(readFileSync(path.join(root, "fixtures/submissions/valid-reproduction.json"), "utf8"));
  delete submission.specDigest;
  const bytes = Buffer.from(JSON.stringify(submission));
  const input = (runtime: typeof loaded) => ({
    taskId: "tsk_custom", reservationId: "rsv_custom", termsVersion: `sha256:${"a".repeat(64)}`,
    contributorPublicId: "contrib-a", evidenceBytes: bytes,
    artifact: { ref: "inline:evidence", digestSha256: createHash("sha256").update(bytes).digest("hex"), mediaType: "application/json", bytes: bytes.length },
    terms: { version: `sha256:${"a".repeat(64)}`, schemaVersion: 1, termsRevision: 1,
      summary: `e18.specDigest:${runtime.specDigest} e18.runtimeDigest:${runtime.runtimeDigest}`,
      reward: { amount: "0.10", asset: "USDC", network: "base" }, claimTtlSeconds: 60,
      maxArtifactBytes: 4096, allowedMediaTypes: ["application/json"], slotLimit: 1, createdAt: "2026-09-12T00:00:00.000Z" },
  });
  assert.equal(hook(input(loaded)).outcome, "pass");
  spec.title = "Changed authoritative task";
  writeFileSync(specPath, JSON.stringify(spec));
  const stale = hook(input(loaded));
  assert.equal(stale.outcome, "fail", JSON.stringify(stale));
  const rebound = loadReproductionRuntime(config);
  assert.notEqual(rebound.specDigest, loaded.specDigest);
  assert.equal(hook(input(rebound)).outcome, "pass");
  const engine = path.join(root, "fixtures/engines", `${spec.scenarios[0].engine}.mjs`);
  const marker = path.join(root, "executed-engine-path.txt");
  writeFileSync(engine, readFileSync(engine, "utf8") + `\nawait import("node:fs").then(({writeFileSync}) => writeFileSync(${JSON.stringify(marker)}, import.meta.url));\n`);
  const snapshotted = loadReproductionRuntime(config);
  assert.equal(hook(input(snapshotted)).outcome, "pass");
  const executedEngine = fileURLToPath(readFileSync(marker, "utf8"));
  assert.notEqual(executedEngine, engine, "verification must execute the private frozen copy");
  assert.match(executedEngine, /ew-repro-evidence-[^/]+\/runtime\/fixtures\/engines\//);
  assert.equal(existsSync(executedEngine), false, "the frozen runtime is removed after verification");
  const executable = config.executable;
  const original = readFileSync(executable, "utf8");
  writeFileSync(executable, original.replace("#!/usr/bin/env node\n", '#!/usr/bin/env node\nprocess.on("exit", () => { if (process.argv[2] === "verify") process.exitCode = 7; });\n'));
  const changed = loadReproductionRuntime(config);
  assert.equal(hook(input(snapshotted)).outcome, "fail", "changed executable must refuse old terms");
  const crashed = hook(input(changed));
  assert.equal(crashed.outcome, "needs_review", JSON.stringify(crashed));
  assert.match(crashed.reasons.join(" "), /exited 7/);
});
