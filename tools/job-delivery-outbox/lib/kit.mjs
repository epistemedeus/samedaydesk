import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  F08_RECEIPT_SCHEMA,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_PACKAGE,
  USEFUL_JOBS_ROOT_NAME,
  USEFUL_JOBS_VERSION,
} from "./pins.mjs";
import { digestNamedBytes, fileEntry } from "./receipt-shape.mjs";
import { refuse } from "./errors.mjs";
import { sha256Bytes } from "./hash-terms.mjs";

export function extractUsefulJobsKit(destDir) {
  const buf = readFileSync(USEFUL_JOBS_ARCHIVE_PATH);
  if (buf.length !== USEFUL_JOBS_ARCHIVE_BYTES) {
    refuse("kit-bytes", "useful-jobs archive byte count does not match the published pin", {
      bytes: buf.length,
      expected: USEFUL_JOBS_ARCHIVE_BYTES,
    });
  }
  const sha = sha256Bytes(buf);
  if (sha !== USEFUL_JOBS_ARCHIVE_SHA256) {
    refuse("kit-sha256", "useful-jobs archive sha256 does not match the published pin", { sha });
  }
  mkdirSync(destDir, { recursive: true });
  const root = join(destDir, USEFUL_JOBS_ROOT_NAME);
  if (!existsSync(join(root, USEFUL_JOBS_CLI))) {
    const tar = spawnSync("tar", ["-xzf", USEFUL_JOBS_ARCHIVE_PATH, "-C", destDir], {
      encoding: "utf8",
    });
    if (tar.status !== 0) refuse("kit-extract", tar.stderr || "tar extract failed");
  }
  return root;
}

export function runUsefulJob(kitRoot, jobId, args, outDir) {
  const cli = join(kitRoot, USEFUL_JOBS_CLI);
  const result = spawnSync(process.execPath, [cli, "run", jobId, ...args, "--out-dir", outDir], {
    encoding: "utf8",
    cwd: kitRoot,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result;
}

export function buildF08ShapedReceipt({
  jobId,
  outputFiles,
  inputEntries = [],
  engineJson,
  sample = false,
  sampleReasons = [],
  fundingState = "unfunded",
  outDir = null,
}) {
  const outputs = outputFiles.map((f) => fileEntry(f.name, f.path));
  const inputs = inputEntries.map((e) => ({
    name: e.name,
    bytes: e.bytes,
    sha256: e.sha256,
  }));
  return {
    schema: F08_RECEIPT_SCHEMA,
    jobId,
    engine: {
      package: USEFUL_JOBS_PACKAGE,
      version: USEFUL_JOBS_VERSION,
      purchaseAuthority: false,
      cli: "node bin/useful-jobs.mjs run <id>",
      archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
      archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
    },
    inputsDigest: digestNamedBytes(inputs),
    outputsDigest: digestNamedBytes(outputs),
    inputs,
    outputs,
    fundingState,
    sold: false,
    sample: Boolean(sample),
    sampleReasons,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    fixturePrice: null,
    payment: {
      fixture: fundingState === "reserved-fixture",
      purchaseAuthority: false,
      liveSettleAttempted: false,
      liveSettleAllowed: false,
      fundingState,
    },
    continuity: null,
    engineResult: engineJson
      ? {
          ok: engineJson.ok !== false,
          status: engineJson.status || null,
          digest: engineJson.digest || null,
          refused: engineJson.refused === true,
        }
      : null,
    outDir,
  };
}
