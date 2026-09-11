import { join } from "node:path";
import { existsSync } from "node:fs";
import { digestNamedBytes, fileEntry, sha256File } from "./digest.mjs";
import { engineVersion } from "./engine.mjs";
import { fixturePriceNote } from "./funding.mjs";
import { USEFUL_JOBS_VERSION } from "./pins.mjs";

export function buildReceipt({
  jobId,
  kit,
  inputEntries,
  outputFiles,
  funding,
  sample,
  sampleReasons,
  engineJson,
  continuity,
  payment,
}) {
  const outputs = (outputFiles || []).map((f) => fileEntry(f.name, f.path));
  const inputs = (inputEntries || []).map((e) => ({
    name: e.name,
    bytes: e.bytes,
    sha256: e.path && existsSync(e.path) ? sha256File(e.path) : e.sha256,
  }));
  const version = kit ? engineVersion(kit) : { package: "useful-jobs", version: USEFUL_JOBS_VERSION, purchaseAuthority: false };

  return {
    schema: "samedaydesk.paid-useful-jobs.receipt.v1",
    jobId,
    engine: {
      ...version,
      cli: "node bin/useful-jobs.mjs run <id>",
    },
    inputsDigest: digestNamedBytes(inputs),
    outputsDigest: digestNamedBytes(outputs),
    inputs,
    outputs,
    fundingState: funding.fundingState,
    sold: false,
    sample: Boolean(sample),
    sampleReasons: sampleReasons || [],
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    fixturePrice: fixturePriceNote(jobId),
    payment: {
      fixture: payment ? payment.fixture === true || funding.fixture === true : false,
      purchaseAuthority: false,
      liveSettleAttempted: false,
      liveSettleAllowed: false,
      fundingState: funding.fundingState,
    },
    continuity: continuity || null,
    engineResult: engineJson
      ? {
          ok: engineJson.ok !== false,
          status: engineJson.status || null,
          digest: engineJson.digest || null,
          refused: engineJson.refused === true,
        }
      : null,
    outDir: outputFiles?.[0] ? join(outputFiles[0].path, "..") : null,
  };
}
