import { CALLBACK_SCHEMA, engineArchiveIdentity, USEFUL_JOBS_ARCHIVE_BYTES, USEFUL_JOBS_ARCHIVE_SHA256 } from "./pins.mjs";
import { outputRefs } from "./receipt-shape.mjs";

const SECRET_KEY = /(bearer|authorization|password|secret|token|apikey|api_key|privatekey)/i;

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = stripSecrets(v);
    }
    return out;
  }
  return value;
}

/**
 * Callback body: redacted result references only. No caller input contents,
 * payment payloads, filesystem paths, or bearer secrets.
 */
export function redactResultReferences({ eventId, receipt, termsHash, termsVersion, callbackOrigin }) {
  const engine = receipt.engine && typeof receipt.engine === "object" ? receipt.engine : {};
  return stripSecrets({
    schema: CALLBACK_SCHEMA,
    eventId,
    jobId: receipt.jobId,
    engineArchiveIdentity: engineArchiveIdentity(engine),
    engine: {
      package: engine.package || engine.extractedPackage || "useful-jobs",
      version: engine.version || null,
      purchaseAuthority: false,
      archiveSha256: engine.archiveSha256 || USEFUL_JOBS_ARCHIVE_SHA256,
      archiveBytes: engine.archiveBytes ?? USEFUL_JOBS_ARCHIVE_BYTES,
    },
    outputs: outputRefs(receipt),
    outputsDigest: receipt.outputsDigest,
    fundingState: receipt.fundingState,
    sold: false,
    sample: Boolean(receipt.sample),
    sampleReasons: Array.isArray(receipt.sampleReasons) ? receipt.sampleReasons : [],
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    buyerAccepted: false,
    sale: false,
    termsHash,
    termsVersion,
    callbackOrigin,
  });
}
