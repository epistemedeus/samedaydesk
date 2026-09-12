import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALLOWED_ACQUISITIONS,
  ALLOWED_METHODS,
  DESCRIPTION_SCHEMA,
  JOB_ID,
  LOCAL_ACQUISITION,
  LOCAL_METHOD,
  STALE_MERCHANT_VERSIONS,
} from "./constants.mjs";
import { fingerprint } from "./canonical.mjs";
import { sha256Bytes } from "./hash.mjs";
import { inspectLockfileOffer, assertIdentityMatch } from "./inspect.mjs";
import { loadKnownSampleIndex, inspectCallerSample } from "./samples.mjs";
import { refuse } from "./refuse.mjs";

function loadDiscoveryFile(path) {
  if (!path || !existsSync(path)) {
    throw refuse("missing-discovery", "describe requires --discovery", { path });
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw refuse("invalid-discovery", `discovery is not JSON: ${err.message}`);
  }
  if (doc?.schema !== "cw69.machine-offer-discovery.v1") {
    throw refuse("invalid-discovery-schema", "discovery schema is not cw69.machine-offer-discovery.v1", {
      schema: doc?.schema || null,
    });
  }
  return doc;
}

function readCallerFile(label, path) {
  if (!path) {
    throw refuse("missing-required-inputs", `Caller mode requires --${label}`, { missing: [label] });
  }
  const abs = resolve(String(path));
  if (!existsSync(abs)) {
    throw refuse("missing-input-file", `${label} not found: ${abs}`, { label, path: abs });
  }
  const buf = readFileSync(abs);
  return { path: abs, bytes: buf.length, sha256: sha256Bytes(buf), buf };
}

export function assertMethodAndAcquisition({ method, acquisition, engineRoot, example }) {
  if (engineRoot) {
    throw refuse("engine-root-override", "engine-root override is refused", { engineRoot });
  }
  const resolvedMethod = method || LOCAL_METHOD;
  const resolvedAcquisition = acquisition || LOCAL_ACQUISITION;
  if (resolvedMethod === "GET") {
    throw refuse("get-on-post-only-route", "GET is not supported on the published lockfile route or this offline adapter", {
      method: resolvedMethod,
    });
  }
  if (resolvedMethod === "POST" || resolvedAcquisition === "paid-http" || resolvedAcquisition === "published-paid-http") {
    throw refuse("paid-method-on-offline-adapter", "paid HTTP is not this adapter; local CLI only", {
      method: resolvedMethod,
      acquisition: resolvedAcquisition,
    });
  }
  if (!ALLOWED_METHODS.includes(resolvedMethod)) {
    throw refuse("unsupported-method", `method ${resolvedMethod} is not supported`, { method: resolvedMethod });
  }
  if (!ALLOWED_ACQUISITIONS.includes(resolvedAcquisition)) {
    throw refuse("unknown-acquisition", `acquisition ${resolvedAcquisition} is unknown`, {
      acquisition: resolvedAcquisition,
    });
  }
  if (example === true) {
    throw refuse("sample-not-caller-evidence", "explicit --example cannot become caller or customer evidence");
  }
  return { method: resolvedMethod, acquisition: resolvedAcquisition };
}

export function assertMerchantPolicy(identity) {
  const version = identity?.merchant?.version;
  if (STALE_MERCHANT_VERSIONS.includes(version)) {
    throw refuse("stale-merchant-version", "stale 1.23.45 identity is refused");
  }
  if (identity?.merchant?.isLatestAuthority === true) {
    throw refuse("false-latest-authority", "isLatest must not be treated as authority");
  }
}

export function buildDescription(options = {}) {
  const discovery = options.discoveryDoc || loadDiscoveryFile(options.discovery);
  const { method, acquisition } = assertMethodAndAcquisition(options);
  if (discovery.jobId !== JOB_ID || discovery.identity?.jobId !== JOB_ID) {
    throw refuse("unsupported-job", "description is not the lockfile-pin-delta path", {
      jobId: discovery.jobId,
    });
  }
  assertMerchantPolicy(discovery.identity);
  const inspected = inspectLockfileOffer({
    repoRoot: options.repoRoot,
    jobId: JOB_ID,
    engineRoot: options.engineRoot,
  });
  assertIdentityMatch(discovery.identity, inspected.identity, "discovery identity");
  if (discovery.identityFingerprint && discovery.identityFingerprint !== inspected.identityFingerprint) {
    throw refuse("identity-changed", "discovery fingerprint does not match fresh inspection");
  }

  const before = readCallerFile("before", options.before);
  const after = readCallerFile("after", options.after);
  const known = loadKnownSampleIndex(inspected.paths.repoRoot, inspected.paths.remoteEvidence);
  const sample = inspectCallerSample({
    beforePath: before.path,
    afterPath: after.path,
    beforeBytes: before.buf,
    afterBytes: after.buf,
    example: options.example === true,
    known,
  });
  if (sample.sample) {
    throw refuse("sample-not-caller-evidence", "known sample, example, or SAMPLE metadata cannot become caller evidence", {
      reasons: sample.reasons,
    });
  }

  const callerContent = {
    before: { sha256: before.sha256, bytes: before.bytes },
    after: { sha256: after.sha256, bytes: after.bytes },
    method,
    acquisition,
  };
  const caller = {
    before: { path: before.path, ...callerContent.before },
    after: { path: after.path, ...callerContent.after },
    method,
    acquisition,
  };
  const description = {
    schema: DESCRIPTION_SCHEMA,
    jobId: JOB_ID,
    discoveryFingerprint: inspected.identityFingerprint,
    identity: inspected.identity,
    caller,
    callerFingerprint: fingerprint(callerContent),
    sample,
    promisedOutputs: [...(inspected.resolved.outputs || [])],
    purchaseAuthority: false,
    sold: false,
    volatile: { generatedAt: new Date().toISOString() },
  };
  return { description, inspected, before, after };
}

export function writeDescription(description, outPath) {
  if (!outPath) throw refuse("missing-out", "--out is required for describe");
  writeFileSync(outPath, `${JSON.stringify(description, null, 2)}\n`);
  return outPath;
}
