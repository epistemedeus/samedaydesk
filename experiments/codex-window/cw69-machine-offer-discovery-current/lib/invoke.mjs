import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { classifyResult } from "../../../wave5/m12/lib/classify.mjs";
import { invokeCurrentJob } from "../../../wave5/m13/src/invoke.mjs";
import { EXPECTED_OUTPUTS, INVOCATION_SCHEMA, JOB_ID } from "./constants.mjs";
import { fingerprint } from "./canonical.mjs";
import { sha256File } from "./hash.mjs";
import { assertIdentityMatch, inspectLockfileOffer } from "./inspect.mjs";
import { assertMerchantPolicy, assertMethodAndAcquisition } from "./describe.mjs";
import { inspectCallerSample, loadKnownSampleIndex } from "./samples.mjs";
import { refuse } from "./refuse.mjs";

function loadDescriptionFile(path) {
  if (!path || !existsSync(path)) {
    throw refuse("missing-description", "invoke requires --description", { path });
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw refuse("invalid-description", `description is not JSON: ${err.message}`);
  }
  if (doc?.schema !== "cw69.machine-offer-description.v1") {
    throw refuse("invalid-description-schema", "description schema is not cw69.machine-offer-description.v1", {
      schema: doc?.schema || null,
    });
  }
  return doc;
}

function hashExisting(path) {
  if (!existsSync(path)) return null;
  const hashed = sha256File(path);
  return { path, sha256: hashed.sha256, bytes: hashed.bytes };
}

function snapshotInputs(beforePath, afterPath, scratch) {
  mkdirSync(scratch, { recursive: true });
  const beforeDest = join(scratch, "before.json");
  const afterDest = join(scratch, "after.json");
  copyFileSync(beforePath, beforeDest);
  copyFileSync(afterPath, afterDest);
  return {
    before: { path: beforeDest, ...sha256File(beforeDest) },
    after: { path: afterDest, ...sha256File(afterDest) },
  };
}

export function verifyBoundInvocation(description, invocation) {
  if (invocation.jobId !== description.jobId || invocation.jobId !== JOB_ID) {
    throw refuse("job-mismatch", "invocation job does not match description", {
      invocation: invocation.jobId,
      description: description.jobId,
    });
  }
  if (invocation.discoveryFingerprint !== description.discoveryFingerprint) {
    throw refuse("identity-changed", "invocation discovery fingerprint does not match description");
  }
  if (invocation.callerFingerprint !== description.callerFingerprint) {
    throw refuse("caller-body-changed", "invocation caller fingerprint does not match description");
  }
  if (invocation.purchaseAuthority === true || invocation.sold === true) {
    throw refuse("sale-claimed", "local invocation cannot claim sold or purchaseAuthority");
  }
  if (invocation.ok === true) {
    for (const name of description.promisedOutputs || EXPECTED_OUTPUTS) {
      const art = (invocation.artifacts || []).find((row) => row.name === name);
      if (!art || !art.sha256) {
        throw refuse("missing-promised-output", `promised output ${name} is missing`, { name });
      }
    }
  }
  return true;
}

export function assertUntamperedArtifacts(invocation, outDir) {
  for (const art of invocation.artifacts || []) {
    const path = join(outDir, art.name);
    const now = hashExisting(path);
    if (!now || now.sha256 !== art.sha256 || now.bytes !== art.bytes) {
      throw refuse("tampered-artifact", `artifact ${art.name} no longer matches bound digest`, {
        name: art.name,
        bound: art.sha256,
        observed: now?.sha256 || null,
      });
    }
  }
  if (invocation.receipt?.sha256) {
    const receiptPath = join(outDir, "receipt.json");
    const now = hashExisting(receiptPath);
    if (!now || now.sha256 !== invocation.receipt.sha256) {
      throw refuse("tampered-receipt", "receipt.json no longer matches bound digest", {
        bound: invocation.receipt.sha256,
        observed: now?.sha256 || null,
      });
    }
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (receipt.jobId && receipt.jobId !== invocation.jobId) {
      throw refuse("job-mismatch", "receipt jobId does not match invocation", {
        receipt: receipt.jobId,
        invocation: invocation.jobId,
      });
    }
    if (receipt.purchaseAuthority === true || receipt.sold === true) {
      throw refuse("sale-claimed", "receipt claimed sale or purchaseAuthority");
    }
  }
  return true;
}

export function buildInvocation(options = {}) {
  const description = options.descriptionDoc || loadDescriptionFile(options.description);
  const { method, acquisition } = assertMethodAndAcquisition(options);
  if (description.jobId !== JOB_ID) {
    throw refuse("unsupported-job", "invocation is not the lockfile-pin-delta path");
  }
  assertMerchantPolicy(description.identity);
  const inspected = inspectLockfileOffer({
    repoRoot: options.repoRoot,
    jobId: JOB_ID,
    engineRoot: options.engineRoot,
  });
  assertIdentityMatch(description.identity, inspected.identity, "description identity");
  if (description.discoveryFingerprint !== inspected.identityFingerprint) {
    throw refuse("identity-changed", "description fingerprint does not match fresh inspection");
  }
  if (method !== description.caller.method || acquisition !== description.caller.acquisition) {
    throw refuse("method-changed", "invoke method/acquisition does not match description", {
      method,
      acquisition,
      describedMethod: description.caller.method,
      describedAcquisition: description.caller.acquisition,
    });
  }

  const beforePath = resolve(String(options.before || description.caller.before.path));
  const afterPath = resolve(String(options.after || description.caller.after.path));
  if (!existsSync(beforePath) || !existsSync(afterPath)) {
    throw refuse("missing-input-file", "invoke caller files are missing", { beforePath, afterPath });
  }
  const beforeNow = sha256File(beforePath);
  const afterNow = sha256File(afterPath);
  if (beforeNow.sha256 !== description.caller.before.sha256 || afterNow.sha256 !== description.caller.after.sha256) {
    throw refuse("caller-body-changed", "caller before/after bytes changed between describe and invoke", {
      before: { described: description.caller.before.sha256, observed: beforeNow.sha256 },
      after: { described: description.caller.after.sha256, observed: afterNow.sha256 },
    });
  }
  const callerContent = {
    before: { sha256: beforeNow.sha256, bytes: beforeNow.bytes },
    after: { sha256: afterNow.sha256, bytes: afterNow.bytes },
    method,
    acquisition,
  };
  if (fingerprint(callerContent) !== description.callerFingerprint) {
    throw refuse("caller-body-changed", "caller fingerprint does not match description");
  }

  const known = loadKnownSampleIndex(inspected.paths.repoRoot, inspected.paths.remoteEvidence);
  const sample = inspectCallerSample({
    beforePath,
    afterPath,
    beforeBytes: readFileSync(beforePath),
    afterBytes: readFileSync(afterPath),
    example: options.example === true,
    known,
  });
  if (sample.sample) {
    throw refuse("sample-not-caller-evidence", "known sample cannot be invoked as caller evidence", {
      reasons: sample.reasons,
    });
  }

  const outDir = options.outDir ? resolve(String(options.outDir)) : null;
  if (!outDir) throw refuse("missing-out-dir", "invoke requires --out-dir");
  mkdirSync(outDir, { recursive: true });

  const scratchRoot = options.tmpdir || process.env.TMPDIR || tmpdir();
  const scratch = mkdtempSync(join(scratchRoot, "cw69-offer-"));
  let spawn;
  try {
    const admitted = snapshotInputs(beforePath, afterPath, scratch);
    spawn = invokeCurrentJob({
      repoRoot: inspected.paths.repoRoot,
      cli: inspected.paths.wrapperCli,
      jobId: JOB_ID,
      inputs: { before: admitted.before.path, after: admitted.after.path },
      outDir,
    });
  } finally {
    if (!options.keepScratch) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  const body = spawn.body || null;
  const classified = classifyResult(body, description.promisedOutputs || EXPECTED_OUTPUTS);
  const artifacts = (description.promisedOutputs || EXPECTED_OUTPUTS)
    .map((name) => {
      const path = join(outDir, name);
      if (!existsSync(path)) return { name, path, missing: true };
      const hashed = sha256File(path);
      return { name, path, sha256: hashed.sha256, bytes: hashed.bytes, missing: false };
    });
  const receiptPath = join(outDir, "receipt.json");
  const receiptHash = existsSync(receiptPath) ? sha256File(receiptPath) : null;
  const receiptDoc = receiptHash ? JSON.parse(readFileSync(receiptPath, "utf8")) : null;

  const useful =
    spawn.status === 0 &&
    body?.ok === true &&
    classified.transport === "ok" &&
    artifacts.every((row) => row.missing === false);

  const invocation = {
    schema: INVOCATION_SCHEMA,
    ok: useful,
    refused: useful ? false : true,
    jobId: JOB_ID,
    discoveryFingerprint: inspected.identityFingerprint,
    callerFingerprint: description.callerFingerprint,
    admitted: {
      before: { sha256: beforeNow.sha256, bytes: beforeNow.bytes },
      after: { sha256: afterNow.sha256, bytes: afterNow.bytes },
    },
    engine: {
      pinSha: inspected.identity.engine.pinSha,
      binSha256: inspected.identity.engine.binSha256,
      sourceCommit: receiptDoc?.engine?.sourceCommit || inspected.identity.engine.pinSha,
      executable: receiptDoc?.engine?.executable || null,
    },
    spawn: {
      status: spawn.status,
      code: spawn.code,
      outcome: spawn.outcome,
      failureClass: spawn.failureClass,
    },
    transport: classified.transport,
    analysis: classified.analysis,
    delivery: classified.delivery,
    payment: {
      sold: body?.sold === true,
      purchaseAuthority: body?.purchaseAuthority === true,
      liveSettlement: body?.liveSettlement || "out-of-scope",
      fundingState: body?.fundingState || body?.receipt?.fundingState || null,
    },
    artifacts,
    receipt: receiptHash
      ? { path: receiptPath, sha256: receiptHash.sha256, bytes: receiptHash.bytes, jobId: receiptDoc?.jobId || null }
      : null,
    engineStatus: body?.engine?.status || body?.engine?.json?.status || receiptDoc?.engineResult?.status || null,
    purchaseAuthority: false,
    sold: false,
    sample,
    volatile: { generatedAt: new Date().toISOString(), outDir },
  };

  if (body && (body.sold === true || body.purchaseAuthority === true)) {
    throw refuse("sale-claimed", "wrapper claimed sold or purchaseAuthority");
  }
  if (receiptDoc && (receiptDoc.sold === true || receiptDoc.purchaseAuthority === true)) {
    throw refuse("sale-claimed", "receipt claimed sold or purchaseAuthority");
  }
  if (receiptDoc?.jobId && receiptDoc.jobId !== JOB_ID) {
    throw refuse("job-mismatch", "receipt jobId is not lockfile-pin-delta", { jobId: receiptDoc.jobId });
  }

  if (!useful) {
    invocation.code = body?.code || spawn.code || classified.analysis?.code || "invoke-refused";
    invocation.error = body?.error || spawn.error || "local invoke did not produce promised outputs";
    invocation.detail = body?.detail || null;
  } else {
    invocation.code = null;
    const delta = artifacts.find((row) => row.name === "pin-delta.json" && !row.missing);
    if (delta) {
      const report = JSON.parse(readFileSync(delta.path, "utf8"));
      invocation.pinDelta = {
        schema: report.schema || null,
        status: report.status || null,
        changed: Array.isArray(report.changed) ? report.changed.length : null,
        added: Array.isArray(report.added) ? report.added.length : null,
        removed: Array.isArray(report.removed) ? report.removed.length : null,
        changedNames: Array.isArray(report.changed) ? report.changed.map((row) => row.name) : [],
        purchaseAuthority: report.purchaseAuthority === true,
      };
    }
  }

  verifyBoundInvocation(description, invocation);
  writeFileSync(join(outDir, "cw69-invocation.json"), `${JSON.stringify(invocation, null, 2)}\n`);
  return { invocation, inspected, spawn, classified };
}

export function writeInvocation(invocation, outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "cw69-invocation.json");
  writeFileSync(path, `${JSON.stringify(invocation, null, 2)}\n`);
  return path;
}
