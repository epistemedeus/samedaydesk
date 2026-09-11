import { join } from "node:path";
import { existsSync } from "node:fs";
import { digestNamedBytes, fileEntry, sha256File } from "./digest.mjs";
import { engineProvenance } from "./engine.mjs";
import { fixturePriceNote } from "./funding.mjs";

function describeInput(entry) {
  if (entry.kind === "directory") {
    return {
      name: entry.name,
      kind: "directory",
      path: entry.path,
      bytes: null,
      sha256: null,
    };
  }
  return {
    name: entry.name,
    kind: entry.kind || "file",
    bytes: entry.bytes,
    sha256: entry.path && existsSync(entry.path) ? sha256File(entry.path) : entry.sha256,
  };
}

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
  void kit;
  const outputs = (outputFiles || []).map((f) => fileEntry(f.name, f.path));
  const inputs = (inputEntries || []).map(describeInput);
  const inputRoot = inputs.find((e) => e.name === "input-root" && e.kind === "directory")?.path || null;

  return {
    schema: "samedaydesk.paid-useful-jobs.receipt.v1",
    jobId,
    engine: engineProvenance(),
    inputsDigest: digestNamedBytes(inputs),
    outputsDigest: digestNamedBytes(outputs),
    inputs,
    inputRoot,
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
          identityVerified:
            typeof engineJson.identityVerified === "boolean" ? engineJson.identityVerified : null,
        }
      : null,
    outDir: outputFiles?.[0] ? join(outputFiles[0].path, "..") : null,
  };
}
