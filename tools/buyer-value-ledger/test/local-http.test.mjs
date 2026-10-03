import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { fetchArchiveHttp, serveArchive } from "../lib/kit.mjs";
import { runLabelledJob } from "../lib/run.mjs";
import { USEFUL_JOBS_ARCHIVE_BYTES, USEFUL_JOBS_ARCHIVE_SHA256 } from "../lib/pins.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin/value.mjs");

function spawnAsync(args) {
  return new Promise((resolveP, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`cli timeout stderr=${stderr}`));
    }, 120_000);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolveP({ status, stdout, stderr });
    });
  });
}

describe("local HTTP archive (not external acceptance)", () => {
  test("127.0.0.1 archive fetch matches pin and labelled run stays local-http", async () => {
    const served = await serveArchive();
    try {
      const fetched = await fetchArchiveHttp(served.origin);
      assert.equal(fetched.via, "local-http");
      assert.equal(fetched.bytes, USEFUL_JOBS_ARCHIVE_BYTES);
      assert.equal(fetched.sha256, USEFUL_JOBS_ARCHIVE_SHA256);

      const libWork = mkdtempSync(join(tmpdir(), "bvl-http-lib-"));
      mkdirSync(join(libWork, "out"));
      const libResult = await runLabelledJob({
        jobId: "vendor-budget-impact",
        buyerClass: "owner-qa",
        example: true,
        outDir: join(libWork, "out"),
        kitOptions: { buffer: fetched.buf, kitSource: "local-http" },
      });
      assert.equal(libResult.ok, true, JSON.stringify(libResult));
      assert.equal(libResult.row.evidence.kitSource, "local-http");
      assert.equal(libResult.row.evidence.externalAcceptance, false);

      const work = mkdtempSync(join(tmpdir(), "bvl-http-cli-"));
      const outDir = join(work, "out");
      mkdirSync(outDir);
      const result = await spawnAsync([
        "run",
        "vendor-budget-impact",
        "--buyer-class",
        "owner-qa",
        "--example",
        "--archive-origin",
        served.origin,
        "--out-dir",
        outDir,
      ]);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const json = JSON.parse(result.stdout);
      assert.equal(json.ok, true);
      assert.equal(json.row.evidence.kitSource, "local-http");
      assert.equal(json.row.evidence.externalAcceptance, false);
      assert.equal(json.row.evidence.jobExecution, "local-runtime");
      assert.equal(json.row.independentDemand, false);
    } finally {
      await served.stop();
    }
  });
});
