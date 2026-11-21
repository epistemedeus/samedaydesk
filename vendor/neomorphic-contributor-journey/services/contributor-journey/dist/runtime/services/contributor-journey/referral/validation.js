import { publicationText } from "../showcase/validation.js";
import { createHash } from 'node:crypto';
import { containsPrivate } from '../../../experiments/contributor-reuse-trial-100198/src/privacy.mjs';
export const SHARE_REF = /^rf[0-9a-f]{48}$/;
export const EVENT_REF = /^ev[0-9a-f]{64}$/;
export const DIGEST = /^[0-9a-f]{64}$/;
export const id = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v);
export const instant = (v) => typeof v === 'string' &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype &&
    Object.keys(v).sort().join(',') === [...keys].sort().join(',');
function canonical(v) {
    if (Array.isArray(v))
        return `[${v.map(canonical).join(',')}]`;
    if (v !== null && typeof v === 'object') {
        const o = v;
        return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
    }
    return JSON.stringify(v);
}
export const hash = (v) => createHash('sha256').update(canonical(v)).digest('hex');
export function fields(v) {
    return Array.isArray(v) && v.length > 0 && v.length <= 2 &&
        new Set(v).size === v.length && v.every(x => x === 'summary' || x === 'evidence');
}
export const nextAction = (v) => v === 'browse_tasks' || v === 'signup' || v === 'discussion';
export function selection(v, now) {
    return exact(v, ['source', 'fields', 'nextAction', 'expiresAt']) &&
        exact(v.source, ['kind', 'id']) && ['showcase', 'discussion'].includes(String(v.source.kind)) &&
        id(v.source.id) && fields(v.fields) && nextAction(v.nextAction) && instant(v.expiresAt) &&
        Date.parse(v.expiresAt) > Date.parse(now) && Date.parse(v.expiresAt) - Date.parse(now) <= 30 * 86400_000;
}
export function publishedSource(v) {
    return exact(v, ['kind', 'sourceId', 'version', 'ownerAccountId', 'workRef', 'artifactDigest',
        'acceptanceRef', 'consentVersion', 'publicationExpiresAt', 'title', 'summary', 'evidence']) &&
        ['showcase', 'discussion'].includes(String(v.kind)) &&
        ['sourceId', 'version', 'ownerAccountId', 'workRef', 'acceptanceRef', 'consentVersion'].every(k => id(v[k])) &&
        typeof v.artifactDigest === 'string' && DIGEST.test(v.artifactDigest) && instant(v.publicationExpiresAt) &&
        typeof v.title === 'string' && v.title.trim().length > 0 && v.title.length <= 140 &&
        typeof v.summary === 'string' && v.summary.trim().length > 0 && v.summary.length <= 1000 &&
        (v.evidence === null || typeof v.evidence === 'string' && v.evidence.trim().length > 0 && v.evidence.length <= 400);
}
// Reuse the existing CRT secret detector, plus the narrower amount-free text
// projection required here. No links or client-written testimonial text are used.
const PRIVATE_PUBLIC_TEXT = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b0x[0-9a-f]{40,64}\b|https?:\/\/|\b(?:accountId|sessionId|wallet|receiptId|obligationId)\s*[:=]|[$€£]\s*\d|\b\d+(?:[.,]\d+)?\s*(?:USDC|USD|ETH|BTC|EUR|GBP)\b|PRIVATE-SENTINEL/i;
export function safeProjection(s, f) {
    const texts = [s.title, ...(f.includes('summary') ? [s.summary] : []), ...(f.includes('evidence') ? [s.evidence ?? ''] : [])];
    const privateIds = [s.sourceId, s.ownerAccountId, s.workRef, s.artifactDigest, s.acceptanceRef];
    return texts.every(text => (text === "" || publicationText(text, 6000, privateIds.filter(value => value.length >= 4))) &&
        !containsPrivate(text) && !PRIVATE_PUBLIC_TEXT.test(text) &&
        !privateIds.some(value => value.length >= 4 && text.includes(value)));
}
/** Version alone is insufficient: bind the exact work, text and consent state. */
export const sourceBinding = (s) => hash([
    s.kind, s.sourceId, s.version, s.ownerAccountId, s.workRef, s.artifactDigest, s.acceptanceRef,
    s.consentVersion, s.publicationExpiresAt, s.title, s.summary, s.evidence,
]);
export function shareRecord(v) {
    return exact(v, ['source', 'fields', 'nextAction', 'expiresAt', 'shareRef', 'ownerAccountId',
        'sourceVersion', 'sourceBindingDigest', 'revision', 'state', 'createdAt', 'updatedAt',
        ...(v && typeof v === 'object' && Object.hasOwn(v, 'acceptedWorkRef') ? ['acceptedWorkRef'] : [])]) &&
        exact(v.source, ['kind', 'id']) && ['showcase', 'discussion'].includes(String(v.source.kind)) &&
        id(v.source.id) && (v.acceptedWorkRef === undefined || id(v.acceptedWorkRef)) && fields(v.fields) && nextAction(v.nextAction) && instant(v.expiresAt) &&
        typeof v.shareRef === 'string' && SHARE_REF.test(v.shareRef) && id(v.ownerAccountId) && id(v.sourceVersion) &&
        typeof v.sourceBindingDigest === 'string' && DIGEST.test(v.sourceBindingDigest) &&
        Number.isSafeInteger(v.revision) && Number(v.revision) >= 1 && ['active', 'withdrawn'].includes(String(v.state)) &&
        instant(v.createdAt) && instant(v.updatedAt) && Date.parse(v.updatedAt) >= Date.parse(v.createdAt);
}
export function eventRecord(v) {
    if (!exact(v, ['eventId', 'bodyDigest', 'stage', 'occurredAt', 'visitorRef', 'accountId', 'referrerAccountId',
        'shareRef', 'shareRevision', 'sourceType', 'declaredChannel', 'nextAction', 'parentEventId', 'evidenceRef', 'cohort', 'relation']))
        return false;
    if (typeof v.eventId !== 'string' || !EVENT_REF.test(v.eventId) || typeof v.bodyDigest !== 'string' || !DIGEST.test(v.bodyDigest) ||
        !['declared_source', 'observed_link_arrival', 'qualified_signup', 'claim', 'repeat'].includes(String(v.stage)) ||
        !instant(v.occurredAt) || !id(v.visitorRef) || ![v.accountId, v.referrerAccountId, v.evidenceRef].every(x => x === null || id(x)) ||
        !(v.shareRef === null || typeof v.shareRef === 'string' && SHARE_REF.test(v.shareRef)) ||
        !(v.shareRevision === null || Number.isSafeInteger(v.shareRevision) && Number(v.shareRevision) >= 1) ||
        !(v.nextAction === null || nextAction(v.nextAction)) ||
        !(v.parentEventId === null || typeof v.parentEventId === 'string' && EVENT_REF.test(v.parentEventId)) ||
        !['owner_qa', 'sponsored', 'independent', 'unknown'].includes(String(v.cohort)) ||
        !['self', 'distinct', 'unknown'].includes(String(v.relation)))
        return false;
    if (v.stage === 'declared_source') {
        if (v.sourceType !== 'declared' || !['shared_link', 'listing', 'other', 'unknown'].includes(String(v.declaredChannel)) ||
            v.parentEventId !== null || v.evidenceRef !== null)
            return false;
    }
    else {
        if (v.sourceType !== 'observed_link' || v.declaredChannel !== null || v.shareRef === null || v.shareRevision === null)
            return false;
        if (v.stage === 'observed_link_arrival' ? v.parentEventId !== null || v.evidenceRef !== null :
            v.parentEventId === null || v.evidenceRef === null || v.accountId === null)
            return false;
    }
    const { bodyDigest, ...body } = v;
    return hash(body) === bodyDigest;
}
//# sourceMappingURL=validation.js.map