import { ApiError } from '../../earned-work/src/errors.js';
import { readCanonicalRoundTerms } from '../../earned-work/src/opportunity/terms.js';
export const keyPattern = /^[a-z0-9][a-z0-9-]{2,78}$/;
const opaquePattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
export function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function invalid() { throw new ApiError(400, 'invalid_input', 'invalid request'); }
export function exactObject(value, keys) {
    if (!record(value) || Object.keys(value).some(key => !keys.includes(key)))
        invalid();
    return value;
}
export function opaque(value) { return typeof value === 'string' && opaquePattern.test(value); }
export function key(value) { return typeof value === 'string' && keyPattern.test(value); }
export function idempotency(value) { if (!opaque(value))
    invalid(); return value; }
export function taskParts(value) {
    if (typeof value !== 'string')
        invalid();
    const parts = value.split(':');
    if (parts.length !== 2 || !key(parts[0]) || !key(parts[1]))
        invalid();
    return [parts[0], parts[1]];
}
export function claimInput(value) {
    const input = exactObject(value, ['taskId', 'termsId', 'termsVersion', 'acceptTerms']);
    taskParts(input.taskId);
    if (typeof input.termsId !== 'string' || input.termsId.length > 128 ||
        typeof input.termsVersion !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(input.termsVersion) || input.acceptTerms !== true)
        invalid();
    return input;
}
export function waitlistInput(value) {
    const input = exactObject(value, ['roundKey', 'reason']);
    if (!key(input.roundKey) || !['full_round', 'later_round', 'no_matching_task'].includes(String(input.reason)))
        invalid();
    return input;
}
export function verifiedTerms(round) {
    const terms = readCanonicalRoundTerms(round.termsDocument, round.termsVersion);
    if (round.roundKey !== terms.roundKey || round.submissionDeadline !== new Date(terms.submissionDeadline).toISOString() ||
        round.asset !== terms.asset || round.network !== terms.network || round.chainId !== terms.chainId ||
        round.offers.length !== terms.offers.length || !['open', 'closed'].includes(round.status) ||
        !/^-?[0-9]+$/.test(round.availableAtomic))
        corrupt();
    for (const offer of terms.offers) {
        const view = round.offers.find(item => item.offerKey === offer.offerKey);
        if (!view || view.title !== offer.title || view.summary !== offer.summary || view.acceptance !== offer.acceptance ||
            view.rewardAtomic !== String(offer.rewardAtomic) || view.slotCount !== offer.slotCount ||
            view.publicClaimConfigured !== offer.publicClaimable || view.ownerReservedSlots !== offer.ownerReservedSlots ||
            !Number.isSafeInteger(view.unreservedPublicSlots) || view.unreservedPublicSlots < 0 || view.unreservedPublicSlots > offer.slotCount)
            corrupt();
    }
    return terms;
}
export function corrupt() { throw new ApiError(503, 'invalid_storage', 'authoritative data failed validation'); }
//# sourceMappingURL=validation.js.map