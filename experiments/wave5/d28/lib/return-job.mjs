import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { domainDigestFromJson, stripGeneratedAt } from "./digest.mjs";
import { readFieldEvidence } from "./field.mjs";
import { expectedOutputsFor } from "./pins.mjs";
import { loadPacket, savePacket } from "./packet.mjs";
import { runWrapperJob } from "./wrapper-cli.mjs";
import { readFileSync, existsSync } from "node:fs";

function jsonArtifact(outDir, jobId) {
  const jsonName = expectedOutputsFor(jobId).find((n) => n.endsWith(".json"));
  if (!jsonName) return null;
  const p = join(outDir, jsonName);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function classifyReturn({ first, second, disjoint, field }) {
  if (!disjoint) {
    return {
      returnSignal: "shared-outdir-refused",
      usefulSecondJob: false,
      liveReturn: field.liveReturn,
    };
  }
  if (second.classified?.crashLike) {
    return {
      returnSignal: "transport-failure",
      usefulSecondJob: false,
      liveReturn: field.liveReturn,
    };
  }
  if (second.classified?.transport === "rejected" && !second.classified?.usefulDelivery) {
    return {
      returnSignal: "wrapper-refusal",
      usefulSecondJob: false,
      liveReturn: field.liveReturn,
      validRefusal: second.classified?.validRefusal === true,
    };
  }
  const inputChanged =
    first.inputsDigest &&
    second.classified?.inputsDigest &&
    first.inputsDigest !== second.classified.inputsDigest;
  if (!inputChanged && first.inputsDigest && second.classified?.inputsDigest) {
    return {
      returnSignal: "same-input-repeat",
      usefulSecondJob: false,
      liveReturn: field.liveReturn,
      generatedAtMayDiffer: first.outputsDigest !== second.classified.outputsDigest,
    };
  }
  const firstDomain = first.domain;
  const secondDomain = second.domain;
  const domainChanged =
    firstDomain &&
    secondDomain &&
    domainDigestFromJson(firstDomain) !== domainDigestFromJson(secondDomain);

  const usefulSecondJob =
    second.classified?.usefulDelivery === true && inputChanged === true && disjoint === true;

  let returnSignal = "incomplete";
  if (usefulSecondJob && domainChanged) returnSignal = "useful-second-job";
  else if (usefulSecondJob && !domainChanged) returnSignal = "second-job-unchanged-domain";
  else if (second.classified?.validNoChange && inputChanged) returnSignal = "useful-second-job";
  else if (second.classified?.validRefusal) returnSignal = "valid-analysis-refusal";

  return {
    returnSignal,
    usefulSecondJob,
    inputChanged: Boolean(inputChanged),
    domainChanged: Boolean(domainChanged),
    liveReturn: field.liveReturn,
    firstAnalysis: first.analysisStatus,
    secondAnalysis: second.classified?.analysis?.status || null,
  };
}

export function measureReturn({
  packetDir,
  inputs,
  funding = "unfunded",
  payment = null,
  evidencePath = null,
  returnDir: returnDirOpt = null,
} = {}) {
  const loaded = loadPacket(packetDir);
  if (!loaded.ok) return loaded;
  const { packet } = loaded;
  const firstDir = packet.firstJob?.outDir;
  const returnDir = resolve(returnDirOpt || join(resolve(packetDir), "return"));
  if (!firstDir) {
    return { ok: false, code: "missing-first-job", error: "packet has no firstJob.outDir" };
  }
  if (resolve(returnDir) === resolve(firstDir)) {
    return {
      ok: false,
      code: "shared-outdir-refused",
      error: "return job cannot reuse the first job outDir",
    };
  }
  mkdirSync(returnDir, { recursive: true });

  const jobId = packet.firstJob.jobId;
  const result = runWrapperJob({
    jobId,
    inputs,
    funding,
    payment,
    outDir: returnDir,
  });

  const firstDomain = jsonArtifact(firstDir, jobId);
  const secondDomain = jsonArtifact(returnDir, jobId);
  const field = evidencePath ? readFieldEvidence(evidencePath) : packet.field || readFieldEvidence(null);

  const comparison = classifyReturn({
    first: {
      inputsDigest: packet.firstJob.inputsDigest,
      outputsDigest: packet.firstJob.outputsDigest,
      analysisStatus: packet.firstJob.analysisStatus,
      domain: firstDomain,
    },
    second: {
      classified: result.classified,
      domain: secondDomain ? stripGeneratedAt(secondDomain) : null,
    },
    disjoint: resolve(returnDir) !== resolve(firstDir),
    field,
  });

  packet.returnJob = {
    role: "return",
    label: "owner-qa",
    jobId,
    outDir: returnDir,
    inputs,
    wrapperOk: result.ok === true,
    sold: result.sold === false ? false : result.sold,
    sample: result.sample === true,
    fundingState: result.fundingState || null,
    analysisStatus: result.classified?.analysis?.status || null,
    analysisOutcome: result.classified?.analysis?.outcome || null,
    transport: result.classified?.transport || null,
    delivery: result.classified?.delivery || null,
    usefulDelivery: result.classified?.usefulDelivery === true,
    engineDigest: result.classified?.engineDigest || null,
    inputsDigest: result.receipt?.inputsDigest || null,
    outputsDigest: result.receipt?.outputsDigest || null,
    domainStatus: secondDomain?.status || null,
    domainSummary: secondDomain?.summary || null,
    comparison,
  };
  packet.field = field;
  savePacket(packetDir, packet);

  return {
    ok: comparison.returnSignal !== "transport-failure" && comparison.returnSignal !== "shared-outdir-refused",
    packetDir: resolve(packetDir),
    packet,
    result,
    comparison,
    field,
  };
}
