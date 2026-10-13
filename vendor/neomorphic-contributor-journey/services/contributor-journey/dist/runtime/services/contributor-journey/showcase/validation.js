import { createHash } from "node:crypto";
import { addDecimal } from "../../earned-work/src/decimal.js";
import { decimalToUnits } from "../../../src/lib/reward-receiving/settlement.mjs";
import { CONSENT_VERSION } from "./types.js";
export const digestText = (value) => createHash("sha256").update(value, "utf8").digest("hex");
export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const privateId = (value) => typeof value === "string" && /^[A-Za-z0-9_:-]{1,160}$/.test(value);
export const publicId = (value) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{11,95}$/.test(value) &&
    !/0x[0-9a-f]{40}|[0-9a-f]{64}/i.test(value);
export const sha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
export const nonnegative = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
export const timestamp = (value) => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
export function exactKeys(value, keys) {
    return isRecord(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
export const identityKeys = ["workId", "taskId", "reservationId", "submissionId", "obligationId", "verdictId", "termsVersion", "artifactDigestSha256"];
export function sameIdentity(a, b) {
    return identityKeys.every(k => a[k] === b[k]);
}
export function identityValid(value) {
    if (!isRecord(value) || !publicId(value.workId) || !sha256(value.artifactDigestSha256))
        return false;
    return identityKeys.filter(k => k !== "workId" && k !== "artifactDigestSha256").every(k => privateId(value[k]));
}
export function bindingValid(value) {
    if (!identityValid(value) || !isRecord(value) || !privateId(value.accountId) || !publicId(value.profileId) ||
        !privateId(value.contributorPrincipalId) || !privateId(value.contributorPublicId) ||
        !["sponsored", "requester_paid", "owner_qa", "unclassified"].includes(String(value.evidenceClass)))
        return false;
    if (value.authorizedSourceSha256 !== null && !sha256(value.authorizedSourceSha256))
        return false;
    if (value.authorizedDestinationSha256 !== null && !sha256(value.authorizedDestinationSha256))
        return false;
    // A public handle must not be an internal join key or private subject identifier.
    const privateKeys = ["accountId", "contributorPrincipalId", "contributorPublicId", ...identityKeys.filter(k => k !== "workId")];
    return privateKeys.every(k => value.workId !== value[k] && value.profileId !== value[k]) && value.workId !== value.profileId;
}
/** Plain, bounded publication text only; no link can expose an underlying transaction or offer amount. */
export function publicationText(value, max, forbidden = []) {
    if (typeof value !== "string" || value.trim() !== value || value.length < 1 || Buffer.byteLength(value) > max)
        return false;
    const normalized = value.normalize("NFKC");
    // Existing original-holder credentials and private continuation/canonical references
    // never become public prose, including discussion excerpts and referral summaries.
    if (/\b(?:ew_ctr|ocl|oclm|osub|oobl)_[A-Za-z0-9_-]{8,}/i.test(normalized))
        return false;
    // Public projections carry plain text, never an alternate encoded representation.
    // Reject rather than silently decode and change the exact consented bytes.
    if (/%[0-9a-f]{2}|&#(?:x[0-9a-f]+|\d+);?|&[a-z][a-z0-9]{1,31};|\\(?:u(?:[0-9a-f]{4}|\{[0-9a-f]{1,6}\})|x[0-9a-f]{2}|[0-7]{1,3})/i.test(normalized))
        return false;
    if (/[<>\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(normalized) ||
        /(?:https?:|mailto:|ipfs:|data:|:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|io|net|eth|xyz)\b)/i.test(normalized) ||
        /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(normalized) || /(?:0x)?[0-9a-f]{40,}/i.test(normalized) ||
        /\b[1-9A-HJ-NP-Za-km-z]{32,88}\b/.test(normalized) ||
        /(?:[$€£¥]|\b(?:USDC|USDT|USD|EUR|GBP|BTC|ETH|SOL|wei|satoshis?)\b)/i.test(normalized) ||
        /(?:\b(?:reward|payment|payout|paid|amount|atomic|units)\s*(?:is|of|:|=)?\s*\d|\d\s*(?:atomic(?:\s+units)?|dollars?|cents?|tokens?|coins?)\b)/i.test(normalized) ||
        /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|Bearer\s+\S+|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.)/i.test(normalized))
        return false;
    return forbidden.filter(text => text.length > 0).every(text => !normalized.toLowerCase().includes(text.normalize("NFKC").toLowerCase()));
}
export function privatePublicationTokens(work) {
    const { binding: b, aggregate: a } = work;
    const body = Buffer.isBuffer(a.submissionEvidenceBytes) ? a.submissionEvidenceBytes.toString("utf8") : "";
    const amount = addDecimal(a.obligation.reward.amount, "0");
    return [b.accountId, b.contributorPrincipalId, b.contributorPublicId, b.taskId, b.reservationId,
        b.submissionId, b.obligationId, b.verdictId, b.termsVersion, b.artifactDigestSha256,
        b.authorizedSourceSha256 ?? "", b.authorizedDestinationSha256 ?? "", a.obligation?.payoutDestination ?? "",
        a.submission?.artifact.ref ?? "", a.obligation?.reward.amount ?? "", amount, decimalToUnits(amount)?.toString() ?? "", a.task.title, a.task.summary,
        a.terms?.summary ?? "", ...(a.verdict?.reasons ?? []), body];
}
/** Approval binds the exact immutable artifact and obligation, not just the display name or task. */
export function summaryValid(value, work) {
    if (!isRecord(value) || !identityValid(value) || !sameIdentity(value, work.binding) ||
        value.accountId !== work.binding.accountId || value.profileId !== work.binding.profileId ||
        !privateId(value.approvalId) || value.approvalSource !== "requester_review" || !timestamp(value.approvedAt))
        return false;
    const forbidden = privatePublicationTokens(work);
    return publicationText(value.summary, 800, forbidden) && publicationText(value.evidenceDescription, 500, forbidden);
}
export function profileValid(value, work) {
    return isRecord(value) && value.profileId === work.binding.profileId && value.accountId === work.binding.accountId &&
        value.visible === true && nonnegative(value.consentVersion) && Number(value.consentVersion) > 0 &&
        publicationText(value.displayName, 120, privatePublicationTokens(work));
}
/** Consent covers exact copy, approval, alias, profile visibility version and work lineage. */
export function summaryDigest(summary, profile) {
    return digestText(JSON.stringify({
        identity: identityKeys.map(k => summary[k]), approvalId: summary.approvalId, approvedAt: summary.approvedAt,
        summary: summary.summary, evidenceDescription: summary.evidenceDescription,
        profileId: profile.profileId, displayName: profile.displayName, profileConsentVersion: profile.consentVersion,
    }));
}
export function consentRecordValid(value) {
    return exactKeys(value, ["workId", "accountId", "profileId", "version", "visibility", "consentVersion",
        "summaryDigest", "profileConsentVersion", "includePaidBadge"]) && publicId(value.workId) &&
        privateId(value.accountId) && publicId(value.profileId) && nonnegative(value.version) && Number(value.version) > 0 &&
        ["visible", "withdrawn"].includes(String(value.visibility)) && value.consentVersion === CONSENT_VERSION &&
        sha256(value.summaryDigest) && nonnegative(value.profileConsentVersion) && Number(value.profileConsentVersion) > 0 &&
        typeof value.includePaidBadge === "boolean";
}
export function operationValid(value) {
    return exactKeys(value, ["accountId", "workId", "idempotencyKey", "requestHash", "resultVersion"]) &&
        privateId(value.accountId) && publicId(value.workId) && privateId(value.idempotencyKey) &&
        sha256(value.requestHash) && nonnegative(value.resultVersion) && Number(value.resultVersion) > 0;
}
//# sourceMappingURL=validation.js.map