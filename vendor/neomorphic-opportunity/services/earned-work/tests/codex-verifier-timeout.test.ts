import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createReproductionDispatcher, loadReproductionRuntime } from "../src/reproduction-verifier.js";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../experiments/wave5/e18");

test("outer verifier timeout removes subject work and stops its owned engine process", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "ew-codex-timeout-"));
  const marker = path.join(root, "owned-engine.json");
  t.after(() => {
    if (existsSync(marker)) {
      const owned = JSON.parse(readFileSync(marker, "utf8"));
      try { process.kill(owned.pid, "SIGKILL"); } catch { /* already exited */ }
      const work = path.dirname(owned.outDir);
      if (path.basename(work).startsWith("e18-subject-")) rmSync(work, { recursive: true, force: true });
    }
    rmSync(root, { recursive: true, force: true });
  });
  cpSync(source, root, { recursive: true, filter: (p) => !p.includes("node_modules") });
  const spec = JSON.parse(readFileSync(path.join(root, "fixtures/task.sds52-stale-outdir.json"), "utf8"));
  writeFileSync(path.join(root, "fixtures/engines", `${spec.scenarios[0].engine}.mjs`),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, JSON.stringify({pid:process.pid,outDir:process.env.E18_OUT_DIR}));\nsetInterval(() => {}, 1000);\n`);
  const loaded = loadReproductionRuntime({ root, specPath: path.join(root, "fixtures/task.sds52-stale-outdir.json"),
    executable: path.join(root, "bin/e18-repro.mjs"), timeoutMs: 1000 });
  const bytes = readFileSync(path.join(root, "fixtures/submissions/valid-reproduction.json"));
  const hash = `sha256:${"a".repeat(64)}`;
  const result = createReproductionDispatcher(loaded)({
    taskId: "tsk_timeout", reservationId: "rsv_timeout", termsVersion: hash, contributorPublicId: "alice", evidenceBytes: bytes,
    artifact: { ref: "inline:evidence", digestSha256: createHash("sha256").update(bytes).digest("hex"), mediaType: "application/json", bytes: bytes.length },
    terms: { version: hash, schemaVersion: 1, termsRevision: 1,
      summary: `e18.specDigest:${loaded.specDigest} e18.runtimeDigest:${loaded.runtimeDigest}`,
      reward: { amount: "0.10", asset: "USDC", network: "base" }, claimTtlSeconds: 60,
      maxArtifactBytes: 4096, allowedMediaTypes: ["application/json"], slotLimit: 1, createdAt: "2026-09-12T00:00:00.000Z" },
  });
  assert.equal(result.outcome, "needs_review");
  assert.ok(existsSync(marker), "the engine must actually have started");
  const owned = JSON.parse(readFileSync(marker, "utf8"));
  assert.equal(existsSync(path.dirname(owned.outDir)), false, "outer timeout must remove the E18 subject directory");
  let live = true;
  for (let i = 0; i < 20; i += 1) {
    try {
      process.kill(owned.pid, 0);
      if (process.platform === "linux" && readFileSync(`/proc/${owned.pid}/stat`, "utf8").split(") ")[1]?.startsWith("Z")) live = false;
    } catch { live = false; }
    if (!live) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(live, false, "the timed-out verifier must not leave an engine running");
});
