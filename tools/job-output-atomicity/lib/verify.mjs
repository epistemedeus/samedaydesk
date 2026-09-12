import { closeSync, constants, openSync, readFileSync, fstatSync } from "node:fs";
import { RECEIPT_NAME, RECEIPT_SCHEMA } from "./pins.mjs";
import { loadCatalog, jobById } from "./catalog.mjs";
import { createDigestAdapter, normalizeSha256, sha256Bytes } from "./digest.mjs";
import {
  createHashTermsAdapter,
  identityDocument,
  integerTermsVersionRejected,
} from "./hash-terms.mjs";
import {
  bindUnderRoot,
  declaredRelativeEscapes,
  inspectBoundOutput,
  joinReceipt,
  realpathInsideRoot,
  resolveRoot,
} from "./paths.mjs";
import {
  TESTED_PRODUCER,
  VERIFY_CODES,
  analysisFromReceipt,
  engineArchiveFromReceipt,
  engineOriginMatches,
  expectedEngineArchive,
} from "./contract.mjs";

function verdict({ classification, code, message, extra = {} }) {
  const ok = classification === "complete";
  return {
    ok,
    classification,
    code: code || null,
    error: ok ? null : message || code,
    liveSettlement: "out-of-scope",
    purchaseAuthority: false,
    sold: false,
    testedProducer: TESTED_PRODUCER,
    ...extra,
  };
}

function readStableFile(filePath, { maxAttempts = 4 } = {}) {
  let lastHash = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    let fd;
    try {
      fd = openSync(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
    } catch (err) {
      const wrapped = new Error(err.message || "cannot open output");
      wrapped.code =
        err.code === "ENXIO" || err.code === "EISDIR" ? "special-output-file" : err.code || "open-failed";
      throw wrapped;
    }
    try {
      const st1 = fstatSync(fd);
      if (!st1.isFile()) {
        const err = new Error("output is not a regular file");
        err.code = "special-output-file";
        throw err;
      }
      const buf = readFileSync(fd);
      const st2 = fstatSync(fd);
      const t1 = st1.mtimeNs ?? st1.mtimeMs;
      const t2 = st2.mtimeNs ?? st2.mtimeMs;
      if (st1.size !== st2.size || t1 !== t2) {
        lastHash = sha256Bytes(buf);
        continue;
      }
      const hash = sha256Bytes(buf);
      if (lastHash && lastHash !== hash) {
        const err = new Error("digest changed after initial read");
        err.code = "digest-changed-after-read";
        throw err;
      }
      const fd2 = openSync(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
      try {
        const buf2 = readFileSync(fd2);
        const hash2 = sha256Bytes(buf2);
        if (hash !== hash2) {
          lastHash = hash2;
          continue;
        }
        return { bytes: buf, sha256: hash, bytesLength: buf.length };
      } finally {
        closeSync(fd2);
      }
    } finally {
      closeSync(fd);
    }
  }
  const err = new Error("digest changed after initial read");
  err.code = "digest-changed-after-read";
  throw err;
}

function parseReceiptBytes(bytes) {
  const text = bytes.toString("utf8");
  if (!text.trim()) {
    const err = new Error("receipt is empty");
    err.code = "truncated-receipt";
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("receipt is not complete JSON");
    err.code = "truncated-receipt";
    throw err;
  }
}

function listedEntryName(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return typeof entry.name === "string" && entry.name.length ? entry.name : null;
}

export function verifyComplete(options = {}) {
  const digest = createDigestAdapter(options.digest);
  const terms = createHashTermsAdapter(options.hashTerms);
  const receiptName = options.receiptName || RECEIPT_NAME;
  const producerNotes = [];
  const evidenceClass = options.evidenceClass || "local-runtime";
  const expectedArchive = expectedEngineArchive(options);

  let root;
  try {
    root = resolveRoot(options.root);
  } catch (err) {
    return verdict({
      classification: "unknown",
      code: err.code || "missing-root",
      message: err.message,
      extra: { root: options.root || null, evidenceClass },
    });
  }

  let receiptPath;
  try {
    receiptPath = joinReceipt(root, receiptName);
  } catch (err) {
    return verdict({
      classification: "unknown",
      code: err.code || "receipt-path-escapes-root",
      message: err.message,
      extra: { root, evidenceClass },
    });
  }

  const receiptStat = realpathInsideRoot(root, receiptPath);
  if (!receiptStat.exists) {
    return verdict({
      classification: "partial",
      code: "missing-receipt",
      message: "receipt.json is missing; leftover outputs are not a complete result",
      extra: { root, receiptPath, evidenceClass, producerNotes },
    });
  }
  if (!receiptStat.inside) {
    return verdict({
      classification: "unknown",
      code: "receipt-path-escapes-root",
      message: "receipt realpath escapes selected root",
      extra: { root, receiptPath, evidenceClass },
    });
  }

  let receiptRead;
  try {
    receiptRead = readStableFile(receiptStat.real);
  } catch (err) {
    return verdict({
      classification: err.code === "digest-changed-after-read" ? "unknown" : "partial",
      code: err.code || "truncated-receipt",
      message: err.message,
      extra: { root, receiptPath, evidenceClass, producerNotes },
    });
  }

  let receipt;
  try {
    receipt = parseReceiptBytes(receiptRead.bytes);
  } catch (err) {
    return verdict({
      classification: "partial",
      code: err.code || "truncated-receipt",
      message: err.message,
      extra: { root, receiptPath, evidenceClass, producerNotes },
    });
  }

  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return verdict({
      classification: "partial",
      code: "truncated-receipt",
      message: "receipt JSON is not an object",
      extra: { root, receiptPath, evidenceClass, producerNotes },
    });
  }

  const analysis = analysisFromReceipt(receipt);

  if (integerTermsVersionRejected(receipt.termsVersion)) {
    return verdict({
      classification: "unknown",
      code: "integer-terms-version-not-a-claim-key",
      message: "integer termsVersion is not a public claim key (I01 content-hash contract)",
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes, ...analysis },
    });
  }

  if (receipt.schema !== RECEIPT_SCHEMA) {
    return verdict({
      classification: "unknown",
      code: VERIFY_CODES.UNRECOGNIZED_RECEIPT_SCHEMA,
      message: "receipt schema is not samedaydesk.paid-useful-jobs.receipt.v1",
      extra: {
        root,
        jobId: receipt.jobId || null,
        receiptSchema: receipt.schema || null,
        evidenceClass,
        producerNotes,
        ...analysis,
      },
    });
  }

  if (receipt.sold === true || receipt.purchaseAuthority === true) {
    return verdict({
      classification: "unknown",
      code: "sale-claim-not-accepted",
      message: "this consumer does not accept sold/purchaseAuthority receipts",
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes, ...analysis },
    });
  }

  const listed = Array.isArray(receipt.outputs) ? receipt.outputs : [];
  for (const entry of listed) {
    if (!listedEntryName(entry)) {
      return verdict({
        classification: "unknown",
        code: VERIFY_CODES.EMPTY_OUTPUT_OBJECT,
        message: "empty or nameless output objects cannot count complete",
        extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes, ...analysis },
      });
    }
  }

  let catalog;
  try {
    catalog = options.catalog || loadCatalog(options.catalogPath);
  } catch (err) {
    return verdict({
      classification: "unknown",
      code: err.code || VERIFY_CODES.MISSING_CATALOG,
      message: err.message,
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes, ...analysis },
    });
  }

  if (!receipt.jobId || !jobById(catalog, receipt.jobId)) {
    return verdict({
      classification: "unknown",
      code: VERIFY_CODES.UNKNOWN_JOB,
      message: "receipt jobId is not a catalog job; unknown jobs cannot count complete",
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes, ...analysis },
    });
  }

  const catalogNames = [...jobById(catalog, receipt.jobId).outputs];

  const listedNames = listed.map((e) => e.name);
  for (const name of listedNames) {
    if (!catalogNames.includes(name)) {
      return verdict({
        classification: "unknown",
        code: VERIFY_CODES.FOREIGN_OUTPUT_NAME,
        message: `listed output ${name} is not a catalog output for ${receipt.jobId}`,
        extra: { root, jobId: receipt.jobId, name, evidenceClass, producerNotes, ...analysis },
      });
    }
  }

  if (listed.length === 0 && catalogNames.length === 0) {
    return verdict({
      classification: "unknown",
      code: "no-output-identity",
      message: "receipt lists no outputs and catalog did not bind the job",
      extra: { root, jobId: receipt.jobId, evidenceClass, producerNotes, ...analysis },
    });
  }

  for (const name of catalogNames) {
    if (!listed.some((e) => e && e.name === name)) {
      return verdict({
        classification: "partial",
        code: "catalog-output-unlisted",
        message: `catalog output ${name} is not listed on the receipt`,
        extra: {
          root,
          jobId: receipt.jobId,
          name,
          evidenceClass,
          producerNotes: [
            ...producerNotes,
            {
              code: "producer-receipt-omits-catalog-output",
              owner: "I02",
              name,
            },
          ],
          ...analysis,
        },
      });
    }
  }

  const verified = [];
  for (const entry of listed) {
    const name = entry.name;
    if (declaredRelativeEscapes(root, entry.path)) {
      return verdict({
        classification: "unknown",
        code: "receipt-path-escapes-root",
        message: `receipt path for ${name} escapes selected root`,
        extra: {
          root,
          jobId: receipt.jobId,
          name,
          declaredPath: entry.path,
          evidenceClass,
          producerNotes,
          ...analysis,
        },
      });
    }
    if (typeof entry.path === "string" && entry.path.length && entry.path.startsWith("/")) {
      producerNotes.push({
        code: "absolute-path-not-portable",
        name,
        declaredPath: entry.path,
        binding: "basename-under-root",
      });
    }

    let bound;
    try {
      bound = bindUnderRoot(root, name);
    } catch (err) {
      return verdict({
        classification: "unknown",
        code: err.code || "receipt-path-escapes-root",
        message: err.message,
        extra: { root, jobId: receipt.jobId, name, evidenceClass, producerNotes, ...analysis },
      });
    }

    const kind = inspectBoundOutput(bound);
    if (!kind.exists) {
      return verdict({
        classification: "partial",
        code: "missing-output",
        message: `missing output file ${name}`,
        extra: { root, jobId: receipt.jobId, name, bound, evidenceClass, producerNotes, ...analysis },
      });
    }
    if (kind.special) {
      return verdict({
        classification: "unknown",
        code: VERIFY_CODES.SPECIAL_OUTPUT_FILE,
        message: `output ${name} is a ${kind.kind}, not a regular file`,
        extra: {
          root,
          jobId: receipt.jobId,
          name,
          kind: kind.kind,
          evidenceClass,
          producerNotes,
          ...analysis,
        },
      });
    }

    const loc = realpathInsideRoot(root, bound);
    if (!loc.exists) {
      return verdict({
        classification: "partial",
        code: "missing-output",
        message: `missing output file ${name}`,
        extra: { root, jobId: receipt.jobId, name, bound, evidenceClass, producerNotes, ...analysis },
      });
    }
    if (!loc.inside) {
      return verdict({
        classification: "unknown",
        code: "receipt-path-escapes-root",
        message: `output ${name} realpath escapes selected root`,
        extra: { root, jobId: receipt.jobId, name, evidenceClass, producerNotes, ...analysis },
      });
    }

    let fileRead;
    try {
      fileRead = readStableFile(loc.real);
    } catch (err) {
      return verdict({
        classification:
          err.code === "digest-changed-after-read"
            ? "unknown"
            : err.code === "special-output-file"
              ? "unknown"
              : "partial",
        code: err.code || "digest-changed-after-read",
        message: err.message,
        extra: { root, jobId: receipt.jobId, name, evidenceClass, producerNotes, ...analysis },
      });
    }

    const claimed = normalizeSha256(entry.sha256);
    if (!claimed) {
      return verdict({
        classification: "unknown",
        code: VERIFY_CODES.MISSING_OUTPUT_DIGEST,
        message: `output ${name} has no sha256; stable size alone is not origin`,
        extra: { root, jobId: receipt.jobId, name, evidenceClass, producerNotes, ...analysis },
      });
    }
    if (claimed !== fileRead.sha256) {
      return verdict({
        classification: "unknown",
        code: "output-digest-mismatch",
        message: `output ${name} digest does not match receipt`,
        extra: { root, jobId: receipt.jobId, name, evidenceClass, producerNotes, ...analysis },
      });
    }
    if (entry.bytes != null && Number(entry.bytes) !== fileRead.bytesLength) {
      return verdict({
        classification: "unknown",
        code: "output-size-mismatch",
        message: `output ${name} size does not match receipt`,
        extra: { root, jobId: receipt.jobId, name, evidenceClass, producerNotes, ...analysis },
      });
    }

    verified.push({
      name,
      kind: entry.kind || "file",
      bytes: fileRead.bytesLength,
      sha256: fileRead.sha256,
      path: bound,
    });
  }

  if (!receipt.outputsDigest) {
    return verdict({
      classification: "unknown",
      code: VERIFY_CODES.MISSING_OUTPUTS_DIGEST,
      message: "receipt omits outputsDigest; file bytes alone are not origin",
      extra: { root, jobId: receipt.jobId, evidenceClass, producerNotes, outputs: verified, ...analysis },
    });
  }

  const recomputed = digest.digestNamedBytes(
    verified.map((e) => ({
      name: e.name,
      kind: e.kind || "file",
      bytes: e.bytes,
      sha256: e.sha256,
    })),
  );
  if (receipt.outputsDigest !== recomputed) {
    producerNotes.push({
      code: "outputs-digest-mismatch",
      claimed: receipt.outputsDigest,
      recomputed,
      owner: "I02",
      note: "Consumer rejects. Producer digestNamedBytes at tested F08 SHA must match files bound under this root.",
    });
    return verdict({
      classification: "unknown",
      code: "outputs-digest-mismatch",
      message: "recomputed outputsDigest does not match receipt",
      extra: { root, jobId: receipt.jobId, evidenceClass, producerNotes, outputs: verified, ...analysis },
    });
  }

  const claimedArchive = engineArchiveFromReceipt(receipt);
  if (!engineOriginMatches(claimedArchive, expectedArchive)) {
    return verdict({
      classification: "unknown",
      code: VERIFY_CODES.FOREIGN_ENGINE_ARCHIVE,
      message: "receipt engine archive is not the pinned useful-jobs origin",
      extra: {
        root,
        jobId: receipt.jobId,
        claimedArchive,
        expectedArchive,
        evidenceClass,
        producerNotes,
        outputs: verified,
        ...analysis,
      },
    });
  }

  const identity = identityDocument({
    jobId: receipt.jobId,
    outputs: verified,
    outputsDigest: recomputed,
    engineArchiveSha256: claimedArchive.sha256,
  });
  const termsVersion = terms.hashTermsVersion(identity);
  if (!terms.isTermsVersionHash(termsVersion)) {
    return verdict({
      classification: "unknown",
      code: "terms-version-not-content-hash",
      message: "identity termsVersion is not sha256: + 64 hex",
      extra: { root, jobId: receipt.jobId, evidenceClass, producerNotes, ...analysis },
    });
  }

  const receiptTermsVersion =
    typeof receipt.termsVersion === "string" && terms.isTermsVersionHash(receipt.termsVersion)
      ? receipt.termsVersion
      : null;

  return verdict({
    classification: "complete",
    code: null,
    extra: {
      root,
      receiptPath,
      jobId: receipt.jobId,
      fundingState: receipt.fundingState || null,
      sample: receipt.sample === true,
      outputsDigest: recomputed,
      termsVersion,
      receiptTermsVersion,
      identity,
      outputs: verified,
      evidenceClass,
      producerNotes,
      receiptSchema: receipt.schema || null,
      ...analysis,
    },
  });
}
