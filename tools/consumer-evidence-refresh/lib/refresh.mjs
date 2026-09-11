import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  BUNDLE_SCHEMA,
  COMPLETENESS,
  OWNED_DIR,
  PR50_ARCHIVE_BYTES,
  PR50_ARCHIVE_SHA256,
  PR50_MERGE,
  PR50_PACKAGE_ID,
  REQUIRED_PROHIBITED_INFERENCES,
  VENDOR_BUDGET_JOB,
} from "./pins.mjs";
import { bindDigest, bundleIdFor, sha256Text } from "./digest.mjs";
import { scanMany } from "./leak-scan.mjs";
import { inspectSample, sampleCustomerOwnedRejected } from "./sample-guard.mjs";
import { classifyWritePath, refusePublishCase } from "./public-path.mjs";
import { runPr50Job } from "./kit.mjs";
import { runVendorBudgetClass } from "./vendor-budget.mjs";
import {
  CaseRefuse,
  loadCaseFile,
  loadReferenced,
  resolveRelative,
  validateCaseObject,
  wantsPaidSale,
} from "./case.mjs";

function rejection({
  code,
  message,
  detail = null,
  sample = false,
  sampleReasons = [],
  privateLeak = false,
}) {
  return {
    ok: false,
    refused: true,
    code,
    error: message,
    detail,
    sample,
    sampleReasons,
    customer_owned: false,
    privateLeak,
    sold: false,
    purchaseAuthority: false,
    payment: { attempted: false },
    liveSettlement: "out-of-scope",
    wrote: false,
  };
}

function sanitizeJobResult(engine, artifactId) {
  const json = engine.json || {};
  const native = json.native && typeof json.native === "object" ? json.native : {};
  const packet = native.brief || native.packet || native;
  const disposition =
    packet?.disposition ||
    native?.disposition ||
    (Array.isArray(native?.datasets) ? native.datasets[0]?.disposition : null) ||
    null;
  return {
    artifactId,
    jobId: json.jobId || null,
    ok: json.ok !== false,
    decision: json.decision || "unknown",
    schemaRejected: Boolean(json.schemaRejected),
    resultDigest: sha256Text(JSON.stringify(json)),
    freshness: mapJobFreshness(json.freshness, disposition),
    engineStatus: engine.status,
  };
}

function mapJobFreshness(freshnessField, disposition) {
  if (typeof freshnessField === "string" && ["current", "stale", "unknown"].includes(freshnessField)) {
    return freshnessField;
  }
  if (freshnessField && typeof freshnessField === "object") {
    const status = freshnessField.status || freshnessField.disposition;
    if (["current", "stale", "unknown"].includes(status)) return status;
  }
  if (["current", "stale", "unknown"].includes(disposition)) return disposition;
  return "unknown";
}

/**
 * Unknown freshness stays unknown. Case claims of "current" are not copied.
 * current/stale is emitted only from a freshness-receipt engine disposition.
 */
export function mapBundleFreshness(jobResults) {
  const receipt = (jobResults || []).find((job) => job.artifactId === "freshness-receipt" && job.ok);
  if (!receipt) {
    return {
      status: "unknown",
      completeness: "unknown",
      source: "none",
    };
  }
  const status = ["current", "stale", "unknown"].includes(receipt.freshness) ? receipt.freshness : "unknown";
  return {
    status,
    completeness: status === "unknown" ? "unknown" : "sampled",
    source: "freshness-receipt",
  };
}

export function refreshCase(request = {}) {
  const publish = refusePublishCase(request);
  if (publish) {
    return rejection({ code: publish.code, message: publish.message, detail: { path: publish.path } });
  }

  if (request.outPath) {
    const classified = classifyWritePath(resolve(request.outPath));
    if (!classified.ok) {
      return rejection({
        code: classified.code,
        message: classified.message,
        detail: { path: classified.path },
      });
    }
  }

  const example = request.example === true;
  const casePathArg = example && !request.casePath ? join(OWNED_DIR, "fixtures/example-sample.json") : request.casePath;
  if (!casePathArg) {
    return rejection({ code: "missing_case", message: "Pass --case <redacted.json> or --example" });
  }

  let loaded;
  try {
    loaded = loadCaseFile(casePathArg);
  } catch (err) {
    if (err instanceof CaseRefuse) {
      return rejection({ code: err.code, message: err.message, detail: err.detail });
    }
    throw err;
  }

  const caseObject = loaded.object;
  const sampleInfo = inspectSample(request, {
    caseObject,
    casePath: loaded.path,
  });

  const declaredOwned = caseObject.customer_owned === true;
  if (sampleCustomerOwnedRejected(sampleInfo.sample, declaredOwned)) {
    return rejection({
      code: "sample_customer_owned_rejected",
      message: "SAMPLE / --example cannot become customer_owned: true",
      sample: true,
      sampleReasons: sampleInfo.reasons,
    });
  }

  if (wantsPaidSale(request, caseObject)) {
    return rejection({
      code: "paid_sale_rejected",
      message: "Refresh is not a paid sale or settlement",
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  let validated;
  try {
    validated = validateCaseObject(caseObject, { clockOverride: request.clock || null });
  } catch (err) {
    if (err instanceof CaseRefuse) {
      return rejection({
        code: err.code,
        message: err.message,
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }
    throw err;
  }

  let referenced;
  try {
    referenced = loadReferenced(caseObject, loaded.path);
  } catch (err) {
    if (err instanceof CaseRefuse) {
      return rejection({
        code: err.code,
        message: err.message,
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }
    throw err;
  }

  const leak = scanMany([
    { source: "case", value: loaded.text },
    ...referenced.map((file) => ({ source: file.role, value: readFileSync(file.path, "utf8") })),
  ]);
  if (!leak.ok) {
    return rejection({
      code: "private_leak_rejected",
      message: "Case or referenced inputs contain email / phone / account id / token patterns",
      detail: { hits: leak.hits },
      privateLeak: true,
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const customerOwned = sampleInfo.sample ? false : declaredOwned === true;
  const jobResults = [];
  for (const job of validated.jobs) {
    const inputPath = resolveRelative(loaded.path, job.in);
    const engine = runPr50Job({
      artifactId: job.artifactId,
      inputPath,
      clock: validated.clock,
    });
    jobResults.push(sanitizeJobResult(engine, job.artifactId));
  }

  const optional = [];
  for (const item of caseObject.optionalInputClasses || []) {
    if (item.id !== VENDOR_BUDGET_JOB) {
      return rejection({
        code: "unknown_input_class",
        message: `Unknown optional input class ${JSON.stringify(item.id)}`,
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }
    const ran = runVendorBudgetClass({
      before: resolveRelative(loaded.path, item.before),
      after: resolveRelative(loaded.path, item.after),
    });
    if (ran.refused) {
      return rejection({
        code: ran.code,
        message: ran.message,
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }
    optional.push({
      id: VENDOR_BUDGET_JOB,
      kind: "customer_quantities",
      ok: ran.ok,
      status: ran.status,
      digest: ran.digest,
      purchaseAuthority: false,
      sold: false,
    });
  }

  const freshness = mapBundleFreshness(jobResults);
  const jobTokens = validated.jobs.map((job) => job.artifactId);
  const bundleId = bundleIdFor({
    caseDigest: loaded.digest,
    clock: validated.clock,
    archiveSha256: PR50_ARCHIVE_SHA256,
    jobTokens,
  });

  const unsigned = {
    schema: BUNDLE_SCHEMA,
    bundleId,
    caseDigest: loaded.digest,
    customer_owned: customerOwned,
    privateLeak: false,
    freshness: freshness.status,
    freshnessDetail: {
      status: freshness.status,
      completeness: COMPLETENESS.includes(freshness.completeness) ? freshness.completeness : "unknown",
      source: freshness.source,
    },
    clock: validated.clock,
    sample: sampleInfo.sample,
    sampleReasons: sampleInfo.reasons,
    sold: false,
    purchaseAuthority: false,
    payment: { attempted: false },
    liveSettlement: "out-of-scope",
    authorityClass: "seller_observed",
    prohibitedInferences: [...REQUIRED_PROHIBITED_INFERENCES],
    pr50: {
      merge: PR50_MERGE,
      packageId: PR50_PACKAGE_ID,
      bytes: PR50_ARCHIVE_BYTES,
      sha256: PR50_ARCHIVE_SHA256,
    },
    jobs: jobResults,
    optionalInputClasses: optional,
    inputDigests: referenced.map((file) => ({
      role: file.role,
      sha256: file.digest,
      bytes: file.bytes,
    })),
    claims: {
      inventsFacts: false,
      paidEndpoint: false,
      legalAttestation: false,
      copiesCaseBytes: false,
      silentCurrent: false,
    },
  };

  const digest = bindDigest(unsigned, loaded.digest);
  const bundle = { ...unsigned, digest };

  const marker = typeof caseObject.notes === "string" ? caseObject.notes : null;
  const serialized = JSON.stringify(bundle);
  if (marker && serialized.includes(marker)) {
    return rejection({
      code: "case_bytes_in_output_rejected",
      message: "Original case bytes must not appear in the public refresh bundle",
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const outLeak = scanMany([{ source: "output", value: serialized }]);
  if (!outLeak.ok) {
    return rejection({
      code: "private_leak_rejected",
      message: "Refresh output would leak email / phone / account id / token patterns",
      detail: { hits: outLeak.hits },
      privateLeak: true,
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  let wrote = false;
  let outPath = null;
  if (request.outPath) {
    const dest = resolve(request.outPath);
    const classified = classifyWritePath(dest);
    if (!classified.ok) {
      return rejection({
        code: classified.code,
        message: classified.message,
        detail: { path: classified.path },
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(bundle, null, 2)}\n`);
    wrote = true;
    outPath = dest;
  }

  return {
    ok: true,
    refused: false,
    bundle,
    wrote,
    outPath,
    sample: sampleInfo.sample,
    sampleReasons: sampleInfo.reasons,
    customer_owned: customerOwned,
    privateLeak: false,
    sold: false,
    purchaseAuthority: false,
  };
}
