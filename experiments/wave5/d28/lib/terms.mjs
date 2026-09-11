/**
 * Disclosure, wrapper receipt, and settlement/terms documents are different.
 * This kit never forces their hashes equal.
 */
export function refuseIntegerTermsVersion(value) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return {
      ok: false,
      code: "integer-terms-version",
      error: "integer termsVersion is not a public claim key for this journey packet",
    };
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return {
      ok: false,
      code: "integer-terms-version",
      error: "integer termsVersion is not a public claim key for this journey packet",
    };
  }
  return { ok: true };
}

export function distinctDocumentIdentities({ receipt, fixturePrice, liveExtract, termsVersion }) {
  const receiptSchema = receipt?.schema || null;
  const inputsDigest = receipt?.inputsDigest || null;
  const engineArchive = receipt?.engine?.archiveSha256 || null;
  const notes = [];
  if (inputsDigest && termsVersion && inputsDigest === String(termsVersion).replace(/^sha256:/, "")) {
    notes.push("refused-equal-inputs-and-terms");
  }
  return {
    receiptSchema,
    inputsDigest,
    engineArchiveSha256: engineArchive,
    fixturePriceUsdc: fixturePrice || null,
    liveExtractPriceUsdc: liveExtract || null,
    termsVersion: termsVersion || null,
    forcedEqual: false,
    notes,
  };
}
