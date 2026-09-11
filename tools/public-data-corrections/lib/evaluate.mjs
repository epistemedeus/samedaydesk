import { CODES, FEATURE_ID, RIGHTS, SCHEMA, WAVE_ID } from "./pins.mjs";
import { findPrivateData, isCustomerOwned, isSampleMarked } from "./private-data.mjs";
import { isPlainObject, pathKey, walk } from "./walk.mjs";
import { readCitation, verifyLocalDigest } from "./citation.mjs";

const PAYING_HOLDER_KEYS = new Set([
  "stripecustomerid",
  "payingrightsholder",
  "paidcustomer",
  "paidlicensee",
  "inventedpayer",
  "inventedpayingrightsholder",
  "payingcustomer",
]);

const AUTO_PUBLISH_KEYS = new Set([
  "autopublish",
  "publishnow",
  "livepublish",
]);

const NEO_KEY_RE = /^(h3neo|h3_neo|neoledger|neo_ledger|h3neoledger|h3neopack)$/i;
const NEO_TEXT_RE = /\bh3[\s_-]?neo\b|\bneo[\s_-]?ledger\b/;

function reject(code, error, extra = {}) {
  return {
    ok: false,
    rights: extra.rights ?? null,
    privateData: extra.privateData === true,
    wave: WAVE_ID,
    id: FEATURE_ID,
    code,
    error,
    ...extra,
    publishAuthorized: false,
    purchaseAuthorized: false,
  };
}

function mentionsH3Neo(packet) {
  const reasons = [];
  walk(packet, (value, path) => {
    const key = pathKey(path);
    if (NEO_KEY_RE.test(String(key).replace(/-/g, ""))) {
      reasons.push(`key:${key}`);
    }
    if (typeof value === "string" && NEO_TEXT_RE.test(value)) {
      reasons.push("text-h3-neo");
    }
  });
  return [...new Set(reasons)];
}

function inventsPayingRightsHolder(packet) {
  const reasons = [];
  if (packet?.rightsClearance?.payingRightsHolder === true) {
    reasons.push("rightsClearance.payingRightsHolder");
  }
  const holder = packet?.rightsHolder;
  if (isPlainObject(holder)) {
    if (holder.paying === true || holder.paid === true || holder.paidCustomer === true) {
      reasons.push("rightsHolder.paying");
    }
    if (holder.stripeCustomerId || holder.customerId) {
      reasons.push("rightsHolder.customer-id");
    }
    if (typeof holder.amountUsdc === "number" && holder.amountUsdc > 0) {
      reasons.push("rightsHolder.amount");
    }
  }
  walk(packet, (value, path) => {
    const key = String(pathKey(path)).toLowerCase().replace(/[_-]/g, "");
    if (PAYING_HOLDER_KEYS.has(key) && value != null && value !== false && value !== "") {
      reasons.push(`key:${pathKey(path)}`);
    }
  });
  return [...new Set(reasons)];
}

function autoPublishAttempts(packet) {
  const reasons = [];
  if (packet?.autoPublish === true) reasons.push("autoPublish");
  if (packet?.publish === true || packet?.publish === "auto") reasons.push("publish");
  if (packet?.publishNow === true) reasons.push("publishNow");
  if (packet?.livePublish === true) reasons.push("livePublish");
  if (packet?.publishAuthorized === true) reasons.push("publishAuthorized");
  walk(packet, (value, path) => {
    const key = String(pathKey(path)).toLowerCase().replace(/[_-]/g, "");
    if (AUTO_PUBLISH_KEYS.has(key) && value === true) {
      reasons.push(pathKey(path));
    }
  });
  return [...new Set(reasons)];
}

function remoteScrapeAttempts(packet) {
  if (
    packet?.scrape === true ||
    packet?.fetchRemote === true ||
    packet?.liveFetch === true ||
    packet?.document?.fetch === true ||
    packet?.document?.scrape === true
  ) {
    return true;
  }
  return false;
}

function rightsClearanceIsCleared(packet) {
  const clearance = packet?.rightsClearance;
  if (!isPlainObject(clearance)) return false;
  if (clearance.status !== "cleared") return false;
  if (!String(clearance.basis || "").trim()) return false;
  return true;
}

function readCorrection(packet) {
  const correction = packet?.correction;
  if (!isPlainObject(correction)) {
    return { ok: false, code: CODES.MISSING_CORRECTION, error: "one field correction is required" };
  }
  const field = String(correction.field || "").trim();
  if (!field) {
    return { ok: false, code: CODES.MISSING_CORRECTION, error: "correction.field is required" };
  }
  const hasTo = Object.prototype.hasOwnProperty.call(correction, "to");
  const hasCorrected = Object.prototype.hasOwnProperty.call(correction, "corrected");
  if (!hasTo && !hasCorrected) {
    return { ok: false, code: CODES.MISSING_CORRECTION, error: "correction.to is required" };
  }
  const citation = readCitation(correction.citation, { role: "correction" });
  if (!citation.ok) {
    return {
      ok: false,
      code: citation.code || CODES.MISSING_CITATION,
      error: citation.error,
    };
  }
  return {
    ok: true,
    field,
    from: Object.prototype.hasOwnProperty.call(correction, "from")
      ? correction.from
      : correction.observed,
    to: hasTo ? correction.to : correction.corrected,
    citation: {
      url: citation.url,
      observedAt: citation.observedAt,
      digest: citation.digestFormatted,
    },
    digestHex: citation.digest,
  };
}

function readDocument(packet) {
  const document = packet?.document;
  if (!isPlainObject(document)) {
    return { ok: false, code: CODES.MISSING_DOCUMENT, error: "public document fixture is required" };
  }
  if (document.kind && document.kind !== "public-catalog-snippet") {
    return { ok: false, code: CODES.MISSING_DOCUMENT, error: "document.kind must be public-catalog-snippet" };
  }
  const citation = readCitation(
    {
      url: document.url,
      observedAt: document.observedAt,
      digest: document.digest,
    },
    { role: "document" },
  );
  if (!citation.ok) {
    return {
      ok: false,
      code: citation.code || CODES.MISSING_CITATION,
      error: citation.error,
    };
  }
  return {
    ok: true,
    kind: document.kind || "public-catalog-snippet",
    url: citation.url,
    observedAt: citation.observedAt,
    digest: citation.digestFormatted,
    digestHex: citation.digest,
    snippet: isPlainObject(document.snippet) ? document.snippet : {},
  };
}

/**
 * Evaluate a public-document fixture plus one correction packet.
 * Never authorizes publish. Never fetches. Never scrapes private data.
 */
export function evaluate(packet) {
  if (!isPlainObject(packet)) {
    return reject(CODES.INPUT_MALFORMED, "packet must be a JSON object");
  }

  const neo = mentionsH3Neo(packet);
  if (neo.length) {
    return reject(CODES.H3_NEO_OUT_OF_DIRECTORY, "H3 Neo ledger is out of directory", {
      reasons: neo,
    });
  }

  if (remoteScrapeAttempts(packet)) {
    return reject(CODES.REMOTE_SCRAPE_FORBIDDEN, "remote scrape of private or live data is forbidden");
  }

  if (packet.schema !== SCHEMA) {
    return reject(CODES.UNSUPPORTED_SCHEMA, `schema must be ${SCHEMA}`);
  }

  if (!Object.prototype.hasOwnProperty.call(packet, "privateData")) {
    return reject(CODES.PRIVATE_DATA_FLAG_REQUIRED, "privateData: false is required");
  }
  if (packet.privateData !== false) {
    return reject(CODES.PRIVATE_DATA, "privateData must be false", { privateData: true });
  }

  const pii = findPrivateData(packet);
  if (pii.privateData) {
    return reject(CODES.PRIVATE_DATA, "collection contains private data", {
      privateData: true,
      reasons: pii.reasons,
    });
  }

  const sample = isSampleMarked(packet);
  if (sample.sample && isCustomerOwned(packet)) {
    return reject(CODES.SAMPLE_AS_CUSTOMER_OWNED, "SAMPLE is not customer-owned", {
      sample: true,
      reasons: sample.reasons,
    });
  }

  const paying = inventsPayingRightsHolder(packet);
  if (paying.length) {
    return reject(
      CODES.INVENTED_PAYING_RIGHTS_HOLDER,
      "inventing a paying rights holder is forbidden",
      { reasons: paying },
    );
  }

  const publishTries = autoPublishAttempts(packet);
  if (publishTries.length) {
    return reject(CODES.AUTO_PUBLISH, "auto-publish is forbidden", {
      rights: typeof packet.rights === "string" ? packet.rights : null,
      reasons: publishTries,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(packet, "rights")) {
    return reject(CODES.MISSING_RIGHTS, "rights is required");
  }
  if (!RIGHTS.includes(packet.rights)) {
    return reject(CODES.INVALID_RIGHTS, "rights must be cleared | unknown | forbidden");
  }

  if (packet.rights === "cleared" && !rightsClearanceIsCleared(packet)) {
    return reject(
      CODES.UNKNOWN_RIGHTS_LABELLED_CLEARED,
      "unknown rights cannot be labelled cleared",
      { rights: "cleared" },
    );
  }

  if (packet.rights === "unknown") {
    return reject(CODES.UNKNOWN_RIGHTS_CANNOT_PUBLISH, "unknown rights cannot publish", {
      rights: "unknown",
    });
  }
  if (packet.rights === "forbidden") {
    return reject(CODES.FORBIDDEN_RIGHTS, "forbidden rights cannot be collected", {
      rights: "forbidden",
    });
  }

  const document = readDocument(packet);
  if (!document.ok) {
    return reject(document.code, document.error);
  }
  const localDoc = verifyLocalDigest(document.url, document.digestHex);
  if (localDoc.checked && localDoc.ok === false) {
    return reject(CODES.DIGEST_MISMATCH, "document digest does not match the public file", {
      rights: packet.rights,
    });
  }

  const correction = readCorrection(packet);
  if (!correction.ok) {
    return reject(correction.code, correction.error, { rights: packet.rights });
  }
  const localCorr = verifyLocalDigest(correction.citation.url, correction.digestHex);
  if (localCorr.checked && localCorr.ok === false) {
    return reject(CODES.DIGEST_MISMATCH, "correction digest does not match the public file", {
      rights: packet.rights,
    });
  }

  return {
    ok: true,
    rights: "cleared",
    publishAuthorized: false,
    purchaseAuthorized: false,
    privateData: false,
    wave: WAVE_ID,
    id: FEATURE_ID,
    code: CODES.ACCEPTED,
    sample: sample.sample,
    document: {
      kind: document.kind,
      url: document.url,
      observedAt: document.observedAt,
      digest: document.digest,
      snippet: document.snippet,
    },
    correction: {
      field: correction.field,
      from: correction.from,
      to: correction.to,
      citation: correction.citation,
    },
    rightsClearance: {
      status: "cleared",
      payingRightsHolder: false,
    },
  };
}
