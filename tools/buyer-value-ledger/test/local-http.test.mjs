import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { fetchArchiveHttp, serveArchive } from "../lib/kit.mjs";
import { USEFUL_JOBS_ARCHIVE_BYTES, USEFUL_JOBS_ARCHIVE_SHA256 } from "../lib/pins.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin/value.mjs");

describe("local HTTP archive (not external acceptance)", () => {
  test("127.0.0.1 archive fetch matches pin and labelled run stays local-http", async () => {
    const served = await serveArchive();
    try {
      const fetched = await fetchArchiveHttp(served.origin);
      assert.equal(fetched.via, "local-http");
      assert.equal(fetched.bytes, USEFUL_JOBS_ARCHIVE_BYTES);
      assert.equal(fetched.sha256, USEFUL_JOBS_ARCHIVE_SHA256);

      const work = mkdtempSync(join(tmpdir(), "bvl-http-"));
      const outDir = join(work, "out");
      mkdirSync(outDir);
      const result = spawnSync(
        process.execPath,
        [
          BIN,
          "run",
          "vendor-budget-impact",
          "--buyer-class",
          "owner-qa",
          "--example",
          "--archive-origin",
          served.origin,
          "--out-dir",
          outDir,
        ],
        {
          encoding: "utf8",
          cwd: ROOT,
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
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
