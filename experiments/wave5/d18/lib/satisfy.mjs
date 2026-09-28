import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_PATH, D01_TESTED_SHA, D03_TESTED_SHA, RECEIPT_NAME } from "./pins.mjs";
import { listForeignSiblingArtifacts, loadCatalog } from "./catalog.mjs";

function verdict(fields) {
  return {
    liveSettlement: "out-of-scope",
    purchaseAuthority: false,
    sold: false,
    tested: {
      d01Sha: D01_TESTED_SHA,
      d03Sha: D03_TESTED_SHA,
    },
    ...fields,
  };
}

export function satisfyJob({
  root,
  expectedJobId,
  expectedInputsDigest = null,
  expectedOutputsDigest = null,
  verifyComplete,
  catalogPath = CATALOG_PATH,
  receiptName = RECEIPT_NAME,
  evidenceClass = "local-runtime",
  catalog = null,
} = {}) {
  if (typeof verifyComplete !== "function") {
    const err = new Error("verifyComplete is required (load D03; do not skip)");
    err.code = "missing-d03";
    throw err;
  }
  if (!root) {
    return verdict({
      ok: false,
      satisfied: false,
      code: "missing-root",
      reason: "package-root-required",
      completeness: null,
      foreignSiblingArtifacts: [],
    });
  }

  const loadedCatalog = catalog || loadCatalog(catalogPath);
  const completeness = verifyComplete({
    root,
    catalogPath,
    receiptName,
    evidenceClass,
  });

  const claimedJobId = expectedJobId || completeness.jobId || null;
  const siblings = listForeignSiblingArtifacts(root, claimedJobId, loadedCatalog);

  if (!completeness.ok) {
    const reason =
      completeness.classification === "partial" ? "partial-artifact-set" : "incomplete-package";
    return verdict({
      ok: false,
      satisfied: false,
      code: completeness.code || reason,
      reason,
      classification: completeness.classification,
      jobId: completeness.jobId || expectedJobId || null,
      completeness,
      foreignSiblingArtifacts: siblings,
    });
  }

  if (expectedJobId && completeness.jobId !== expectedJobId) {
    return verdict({
      ok: false,
      satisfied: false,
      code: "foreign-job-artifacts",
      reason: "complete-package-belongs-to-a-different-job",
      classification: completeness.classification,
      jobId: completeness.jobId,
      completeness,
      foreignSiblingArtifacts: listForeignSiblingArtifacts(root, expectedJobId, loadedCatalog),
    });
  }

  let receipt = null;
  const receiptPath = join(root, receiptName);
  if (existsSync(receiptPath)) {
    try {
      receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    } catch {
      receipt = null;
    }
  }

  if (expectedInputsDigest && receipt?.inputsDigest !== expectedInputsDigest) {
    return verdict({
      ok: false,
      satisfied: false,
      code: "stale-inputs-digest",
      reason: "package-inputsDigest-does-not-match-inspected-job-inputs",
      classification: completeness.classification,
      jobId: completeness.jobId,
      completeness,
      inputsDigest: receipt?.inputsDigest || null,
      expectedInputsDigest,
      foreignSiblingArtifacts: siblings,
    });
  }

  if (expectedOutputsDigest && completeness.outputsDigest !== expectedOutputsDigest) {
    return verdict({
      ok: false,
      satisfied: false,
      code: "foreign-or-mutated-bytes",
      reason: "package-outputsDigest-does-not-match-this-execution",
      classification: completeness.classification,
      jobId: completeness.jobId,
      completeness,
      outputsDigest: completeness.outputsDigest,
      expectedOutputsDigest,
      foreignSiblingArtifacts: siblings,
    });
  }

  return verdict({
    ok: true,
    satisfied: true,
    code: null,
    reason: siblings.length ? "complete-with-foreign-siblings" : "complete-for-expected-job",
    classification: completeness.classification,
    jobId: completeness.jobId,
    inputsDigest: receipt?.inputsDigest || null,
    outputsDigest: completeness.outputsDigest || null,
    mixedDirectory: siblings.length > 0,
    completeness,
    foreignSiblingArtifacts: siblings,
  });
}
