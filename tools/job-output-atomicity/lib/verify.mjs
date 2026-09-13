import { closeSync, openSync, readFileSync, fstatSync } from "node:fs";
import { RECEIPT_NAME, RECEIPT_SCHEMA } from "./pins.mjs";
import { loadCatalog, jobOutputs } from "./catalog.mjs";
import { createDigestAdapter, normalizeSha256, sha256Bytes } from "./digest.mjs";
import {
  createHashTermsAdapter,
  identityDocument,
  integerTermsVersionRejected,
} from "./hash-terms.mjs";
import {
  bindUnderRoot,
  declaredRelativeEscapes,
  joinReceipt,
  realpathInsideRoot,
  resolveRoot,
} from "./paths.mjs";

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
    ...extra,
  };
}

function readStableFile(filePath, { maxAttempts = 4 } = {}) {
  let lastHash = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    const fd = openSync(filePath, "r");
    try {
      const st1 = fstatSync(fd);
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
      const fd2 = openSync(filePath, "r");
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

export function verifyComplete(options = {}) {
  const digest = createDigestAdapter(options.digest);
  const terms = createHashTermsAdapter(options.hashTerms);
  const receiptName = options.receiptName || RECEIPT_NAME;
  const producerNotes = [];
  const evidenceClass = options.evidenceClass || "local-runtime";

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

  if (integerTermsVersionRejected(receipt.termsVersion)) {
    return verdict({
      classification: "unknown",
      code: "integer-terms-version-not-a-claim-key",
      message: "integer termsVersion is not a public claim key (I01 content-hash contract)",
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes },
    });
  }

  if (receipt.schema && receipt.schema !== RECEIPT_SCHEMA) {
    producerNotes.push({
      code: "unrecognized-receipt-schema",
      schema: receipt.schema,
    });
  }

  if (receipt.sold === true || receipt.purchaseAuthority === true) {
    return verdict({
      classification: "unknown",
      code: "sale-claim-not-accepted",
      message: "this consumer does not accept sold/purchaseAuthority receipts",
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes },
    });
  }

  const listed = Array.isArray(receipt.outputs) ? receipt.outputs : [];
  const catalogPath = options.catalogPath;
  let catalogNames = [];
  try {
    const catalog = loadCatalog(catalogPath);
    catalogNames = receipt.jobId ? jobOutputs(catalog, receipt.jobId) : [];
  } catch (err) {
    producerNotes.push({ code: err.code || "missing-catalog", message: err.message });
  }

  if (listed.length === 0 && catalogNames.length === 0) {
    return verdict({
      classification: "unknown",
      code: "no-output-identity",
      message: "receipt lists no outputs and catalog did not bind the job",
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes },
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
          jobId: receipt.jobId || null,
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
        },
      });
    }
  }

  const verified = [];
  for (const entry of listed) {
    const name = entry && entry.name;
    if (!name) continue;
    if (declaredRelativeEscapes(root, entry.path)) {
      return verdict({
        classification: "unknown",
        code: "receipt-path-escapes-root",
        message: `receipt path for ${name} escapes selected root`,
        extra: { root, jobId: receipt.jobId || null, name, declaredPath: entry.path, evidenceClass, producerNotes },
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
        extra: { root, jobId: receipt.jobId || null, name, evidenceClass, producerNotes },
      });
    }

    const loc = realpathInsideRoot(root, bound);
    if (!loc.exists) {
      return verdict({
        classification: "partial",
        code: "missing-output",
        message: `missing output file ${name}`,
        extra: { root, jobId: receipt.jobId || null, name, bound, evidenceClass, producerNotes },
      });
    }
    if (!loc.inside) {
      return verdict({
        classification: "unknown",
        code: "receipt-path-escapes-root",
        message: `output ${name} realpath escapes selected root`,
        extra: { root, jobId: receipt.jobId || null, name, evidenceClass, producerNotes },
      });
    }

    let fileRead;
    try {
      fileRead = readStableFile(loc.real);
    } catch (err) {
      return verdict({
        classification: err.code === "digest-changed-after-read" ? "unknown" : "partial",
        code: err.code || "digest-changed-after-read",
        message: err.message,
        extra: { root, jobId: receipt.jobId || null, name, evidenceClass, producerNotes },
      });
    }

    const claimed = normalizeSha256(entry.sha256);
    if (claimed && claimed !== fileRead.sha256) {
      return verdict({
        classification: "unknown",
        code: "output-digest-mismatch",
        message: `output ${name} digest does not match receipt`,
        extra: { root, jobId: receipt.jobId || null, name, evidenceClass, producerNotes },
      });
    }
    if (entry.bytes != null && Number(entry.bytes) !== fileRead.bytesLength) {
      return verdict({
        classification: "unknown",
        code: "output-size-mismatch",
        message: `output ${name} size does not match receipt`,
        extra: { root, jobId: receipt.jobId || null, name, evidenceClass, producerNotes },
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

  const recomputed = digest.digestNamedBytes(
    verified.map((e) => ({
      name: e.name,
      kind: e.kind || "file",
      bytes: e.bytes,
      sha256: e.sha256,
    })),
  );
  if (receipt.outputsDigest && receipt.outputsDigest !== recomputed) {
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
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes, outputs: verified },
    });
  }

  const archiveSha =
    receipt.engine?.archiveSha256 || receipt.engine?.archive?.sha256 || null;
  const identity = identityDocument({
    jobId: receipt.jobId,
    outputs: verified,
    outputsDigest: recomputed,
    engineArchiveSha256: archiveSha,
  });
  const termsVersion = terms.hashTermsVersion(identity);
  if (!terms.isTermsVersionHash(termsVersion)) {
    return verdict({
      classification: "unknown",
      code: "terms-version-not-content-hash",
      message: "identity termsVersion is not sha256: + 64 hex",
      extra: { root, jobId: receipt.jobId || null, evidenceClass, producerNotes },
    });
  }

  return verdict({
    classification: "complete",
    code: null,
    extra: {
      root,
      receiptPath,
      jobId: receipt.jobId || null,
      fundingState: receipt.fundingState || null,
      sample: receipt.sample === true,
      outputsDigest: recomputed,
      termsVersion,
      identity,
      outputs: verified,
      evidenceClass,
      producerNotes,
      receiptSchema: receipt.schema || null,
    },
  });
}
