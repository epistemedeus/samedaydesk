/**
 * Project Work Exchange PR 463 caller examples into a terms document.
 * The authoritative termsVersion comes from the exchange preview or
 * readAccepted result, never from a hash of this caller-side projection.
 * hashTermsVersion remains only as a local consistency check.
 * This module keeps no terms history.
 */
import { hashTermsVersion, isTermsVersionHash } from "./hash-terms-version.mjs";
import { PARENT_REFS } from "./pins.mjs";

export const TERMS_SCHEMA = "work-exchange-caller-terms-projection.v1";

export function takeExchangeTermsVersion({ preview = null, readAccepted = null } = {}) {
  const fromPreview = preview && typeof preview === "object" ? preview.termsVersion : null;
  const fromAccepted = readAccepted && typeof readAccepted === "object" ? readAccepted.termsVersion : null;
  if (fromPreview && fromAccepted && fromPreview !== fromAccepted) {
    return {
      ok: false,
      authorized: false,
      reason: "terms_changed",
      message: "preview and readAccepted termsVersion differ",
      expectedVersion: fromPreview,
      actualVersion: fromAccepted,
    };
  }
  const termsVersion = fromPreview || fromAccepted || null;
  if (!termsVersion) {
    return {
      ok: false,
      authorized: false,
      reason: "exchange_terms_version_required",
      message: "termsVersion must come from the exchange preview or readAccepted; a local hash is not the authority",
    };
  }
  if (!isTermsVersionHash(termsVersion)) {
    return {
      ok: false,
      authorized: false,
      reason: "terms_version_invalid",
      message: "exchange termsVersion must be sha256: and 64 lowercase hex; integer versions are refused",
    };
  }
  return {
    ok: true,
    termsVersion,
    source: fromPreview ? "preview" : "readAccepted",
  };
}

export function projectWorkExchangeCallerTerms({
  caller,
  request,
  reward,
  contextId,
  followsTaskId = null,
  preview = null,
  readAccepted = null,
  claimedTermsVersion = null,
} = {}) {
  if (!caller || typeof caller.publicId !== "string" || !caller.publicId.trim()) {
    throw new Error("caller publicId is required");
  }
  if (!request || typeof request !== "object") {
    throw new Error("caller request is required");
  }
  const title = String(request.title || "").trim();
  const summary = String(request.summary || "").trim();
  const acceptanceExample = String(request.acceptanceExample || "").trim();
  if (!title || !summary || !acceptanceExample) {
    throw new Error("caller request must include title, summary, and acceptanceExample");
  }
  const boundContext = String(contextId || "").trim();
  if (boundContext.length < 8) {
    throw new Error("contextId must be at least 8 characters");
  }

  const terms = {
    schemaVersion: TERMS_SCHEMA,
    termsRevision: 1,
    title,
    summary,
    acceptanceExample,
    requesterPublicId: caller.publicId,
    contextId: boundContext,
    followsTaskId,
    reward: reward
      ? {
          amount: String(reward.amount),
          asset: String(reward.asset),
          network: String(reward.network),
        }
      : null,
    source: {
      repo: PARENT_REFS.workExchangePr463.repo,
      sha: PARENT_REFS.workExchangePr463.sha,
      pull: PARENT_REFS.workExchangePr463.pull,
      path: PARENT_REFS.workExchangePr463.examplePath,
    },
  };
  const localTermsVersion = hashTermsVersion(terms);
  const exchange = takeExchangeTermsVersion({ preview, readAccepted });
  if (!exchange.ok) {
    return {
      kind: "projection",
      ...exchange,
      terms,
      localTermsVersion,
      termsVersion: null,
      authoritativeKey: null,
    };
  }

  const claimed = claimedTermsVersion == null || claimedTermsVersion === ""
    ? null
    : String(claimedTermsVersion);
  if (claimed && claimed !== exchange.termsVersion) {
    return {
      kind: "projection",
      ok: false,
      authorized: false,
      reason: "terms_changed",
      message: "a locally hashed or claimed termsVersion that differs from the exchange preview or readAccepted does not authorize",
      terms,
      termsVersion: exchange.termsVersion,
      localTermsVersion,
      claimedTermsVersion: claimed,
      exchangeSource: exchange.source,
      authoritativeKey: exchange.termsVersion,
    };
  }

  return {
    kind: "projection",
    ok: true,
    authorized: true,
    terms,
    termsVersion: exchange.termsVersion,
    localTermsVersion,
    localMatchesExchange: localTermsVersion === exchange.termsVersion,
    exchangeSource: exchange.source,
    authoritativeKey: exchange.termsVersion,
  };
}

export function assertTermsUnchanged(expectedVersion, actualVersion) {
  if (actualVersion !== expectedVersion) {
    return {
      ok: false,
      reason: "terms_changed",
      expectedVersion,
      actualVersion,
    };
  }
  return { ok: true, termsVersion: actualVersion };
}
