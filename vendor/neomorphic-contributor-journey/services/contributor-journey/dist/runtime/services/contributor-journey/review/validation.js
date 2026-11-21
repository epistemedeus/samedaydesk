import { hashRequest } from "../../earned-work/src/crypto.js";
import { hashEarnedWorkTerms } from "../../earned-work/src/terms-version.js";
import { hashRoundTerms } from "../../earned-work/src/opportunity/terms.js";
import { atomicToDecimal } from "../../earned-work/src/opportunity/atomic.js";
export class ReviewError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export function fail(status, code, message) { throw new ReviewError(status, code, message); }
export function object(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) {
        fail(400, "invalid_input", "Use the supported review fields.");
    }
    return value;
}
export function text(value, max = 2000) {
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        fail(400, "invalid_input", "Supply bounded, nonempty text.");
    }
    return value.trim();
}
export function id(value) {
    const v = text(value, 128);
    if (!/^[A-Za-z0-9_:.\-]+$/.test(v))
        fail(400, "invalid_input", "Use an opaque record identifier.");
    return v;
}
export function key(value) {
    const v = text(value, 200);
    if (v.length < 8)
        fail(400, "invalid_input", "Use an idempotency key of at least eight characters.");
    return v;
}
export function target(value) {
    const v = object(value, ["taskId", "reservationId"]);
    return { taskId: id(v.taskId), reservationId: id(v.reservationId) };
}
export function source(value) {
    const v = object(value, ["taskId", "reservationId", "termsVersion", "submissionId", "artifactId", "digestSha256", "mediaType", "bytes"]);
    const termsVersion = text(v.termsVersion, 80), digestSha256 = text(v.digestSha256, 64), mediaType = text(v.mediaType, 200);
    if (!/^sha256:[a-f0-9]{64}$/.test(termsVersion) || !/^[a-f0-9]{64}$/.test(digestSha256) || !/^[a-z0-9!#$&^_.+\-]+\/[a-z0-9!#$&^_.+\-]+$/i.test(mediaType) || !Number.isSafeInteger(v.bytes) || Number(v.bytes) < 1 || Number(v.bytes) > 1_000_000) {
        fail(400, "invalid_input", "Supply the exact immutable submission reference.");
    }
    return { taskId: id(v.taskId), reservationId: id(v.reservationId), submissionId: id(v.submissionId), artifactId: id(v.artifactId), termsVersion, digestSha256, mediaType, bytes: Number(v.bytes) };
}
export const same = (a, b) => hashRequest(a) === hashRequest(b);
export function sourceOf(record, expected) {
    const a = record.aggregate, r = a?.reservation, s = a?.submission;
    if (!a?.task || !a.terms || !r || !s || a.task.id !== expected.taskId || r.id !== expected.reservationId || r.taskId !== a.task.id || s.taskId !== a.task.id || s.reservationId !== r.id || s.termsVersion !== r.termsVersion || a.terms.version !== a.task.currentTermsVersion || r.termsVersion !== a.task.currentTermsVersion || !["submitted", "completed", "released"].includes(r.status)) {
        fail(409, "stale_source", "Reload the current submitted work before reviewing it.");
    }
    try {
        if (record.authority?.family === 'opportunity') {
            const authority = record.authority, document = authority.termsDocument;
            const offer = document.offers.find(item => item.offerKey === authority.offerKey);
            if (!offer || document.roundKey !== authority.roundKey || a.task.id !== `${authority.roundKey}:${authority.offerKey}` ||
                hashRoundTerms(document) !== a.terms.version || a.terms.reward.amount !== atomicToDecimal(BigInt(offer.rewardAtomic), document.atomicScale) ||
                a.terms.reward.asset !== document.asset || a.terms.reward.network !== document.network ||
                a.terms.maxArtifactBytes !== document.maxEvidenceBytes || a.terms.allowedMediaTypes.join() !== 'application/json')
                throw new Error('opportunity terms binding');
        }
        else {
            const digest = hashEarnedWorkTerms(a.task.id, a.terms.termsRevision, {
                summary: a.terms.summary, reward: a.terms.reward, claimTtlSeconds: a.terms.claimTtlSeconds,
                maxArtifactBytes: a.terms.maxArtifactBytes, allowedMediaTypes: a.terms.allowedMediaTypes, slotLimit: a.terms.slotLimit,
            }, a.terms.schemaVersion);
            if (digest !== a.terms.version || a.task.termsRevision !== a.terms.termsRevision || a.task.schemaVersion !== a.terms.schemaVersion)
                throw new Error("terms digest");
        }
    }
    catch {
        fail(503, "source_invalid", "The stored terms do not match their immutable reference.");
    }
    let bound;
    try {
        bound = source({ taskId: a.task.id, reservationId: r.id, termsVersion: r.termsVersion, submissionId: s.id, artifactId: record.artifactId, digestSha256: s.artifact.digestSha256, mediaType: s.artifact.mediaType, bytes: s.artifact.bytes });
    }
    catch {
        fail(503, "source_invalid", "The submission reference could not be verified.");
    }
    if (s.artifact.bytes > a.terms.maxArtifactBytes || !a.terms.allowedMediaTypes.includes(s.artifact.mediaType))
        fail(503, "source_invalid", "The submission no longer matches its terms.");
    const v = a.verdict;
    if (v && (v.taskId !== bound.taskId || v.reservationId !== bound.reservationId || v.submissionId !== bound.submissionId || v.termsVersion !== bound.termsVersion || v.artifactDigestSha256 !== bound.digestSha256 || !["pass", "fail", "needs_review"].includes(v.outcome) || !Number.isSafeInteger(v.ordinal) || v.ordinal < 1))
        fail(503, "source_invalid", "The verdict does not match this submission.");
    return bound;
}
export function handoffOf(record, bound) {
    const o = record.aggregate.obligation;
    if (!o) {
        if (record.aggregate.task.lifecycle === "accepted" || record.aggregate.task.payoutState === "owed")
            fail(503, "obligation_unknown", "Acceptance needs an authoritative obligation readback.");
        return null;
    }
    const v = record.aggregate.verdict;
    if (o.taskId !== bound.taskId || o.reservationId !== bound.reservationId || o.submissionId !== bound.submissionId || o.termsVersion !== bound.termsVersion || o.contributorPublicId !== record.aggregate.reservation?.contributorPublicId || !v || v.id !== o.verdictId || v.outcome !== "pass" || record.aggregate.task.lifecycle !== "accepted" || record.aggregate.reservation?.status !== "completed")
        fail(503, "obligation_unknown", "The earned obligation does not match this work.");
    return { taskId: bound.taskId, reservationId: bound.reservationId, workId: bound.submissionId, obligationId: id(o.id), termsVersion: bound.termsVersion, verdictId: id(o.verdictId) };
}
export function validateEntries(entries, bound, access, maxRounds) {
    if (!Array.isArray(entries) || entries.length > maxRounds * 2)
        fail(503, "clarification_invalid", "Clarification history could not be verified.");
    const keys = new Set();
    for (const [i, e] of entries.entries()) {
        const request = i % 2 === 0, previous = entries[i - 1];
        if (!e || e.schema !== "neomorphic.review-clarification.v1" || !same(e.source, bound) || e.ordinal !== i + 1 || keys.has(e.clientKey) || !/^[a-f0-9]{64}$/.test(e.commandHash) || !Number.isFinite(Date.parse(e.createdAt)) || !Number.isFinite(Date.parse(e.deadline)) || Date.parse(e.deadline) <= Date.parse(e.createdAt) || (request ? e.kind !== "request" || e.accountId !== access.requesterAccountId : !["reply", "refuse"].includes(e.kind) || e.accountId !== access.contributorAccountId || e.questionId !== previous.questionId || e.deadline !== previous.deadline || Date.parse(e.createdAt) >= Date.parse(e.deadline))) {
            fail(503, "clarification_invalid", "Clarification history could not be verified.");
        }
        try {
            text(e.text);
            id(e.questionId);
            key(e.clientKey);
        }
        catch {
            fail(503, "clarification_invalid", "Clarification history could not be verified.");
        }
        if (request && previous?.kind === "refuse")
            fail(503, "clarification_invalid", "Clarification history could not be verified.");
        keys.add(e.clientKey);
    }
}
//# sourceMappingURL=validation.js.map