import { hashRequest } from '../earned-work/src/crypto.js';
import { createQualifiedSettlementPort } from './showcase/settlement.js';
import { acceptedWorkValid } from './showcase/work-source.js';
import { sameIdentity, sha256 } from './showcase/validation.js';
const identity = (work) => {
    const { workId, taskId, reservationId, submissionId, obligationId, verdictId, termsVersion, artifactDigestSha256 } = work.binding;
    return { workId, taskId, reservationId, submissionId, obligationId, verdictId, termsVersion, artifactDigestSha256 };
};
const pinValid = (pin) => pin?.family === 'opportunity' &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(pin.sourceId) &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(pin.sourceRevision) && sha256(pin.sourceSha256);
const same = (a, b) => hashRequest(a) === hashRequest(b);
/** Exact canonical222310/223500 receiving invariants: accepted artifact/terms,
 * authorized counterparties, successful exact token/amount transfer and one
 * exclusive allocation. The existing receipt verifier owns chain assessment. */
export function createInstalledCanonicalQualification(options) {
    const receiving = options.receiving;
    if (receiving && !pinValid(receiving.pin))
        throw new Error('explicit canonical source pin required');
    async function read(work) {
        if (!receiving || work.authorityFamily !== 'opportunity' || !acceptedWorkValid(work, work.binding.workId))
            return null;
        const query = await options.query(work);
        if (!query || !sameIdentity(query, work.binding))
            return null;
        const row = await receiving.readAcceptedWork(structuredClone(query));
        if (!row || row.state !== 'accepted' || !same(row.source, receiving.pin) || !same(row.work, query) ||
            !sha256(row.authorizedSourceSha256) || !sha256(row.authorizedDestinationSha256) ||
            !['owner_qa', 'sponsored', 'requester_paid', 'unclassified'].includes(row.evidenceClass) ||
            !['owner_qa', 'sponsored', 'recruited', 'independent', 'unknown'].includes(row.actorRelation) ||
            (row.evidenceClass === 'owner_qa' && row.actorRelation !== 'owner_qa') ||
            (row.evidenceClass === 'sponsored' && row.actorRelation !== 'sponsored'))
            return null;
        if (row.settlement && (!sameIdentity(row.settlement, query) ||
            row.settlement.sourceSha256 !== row.authorizedSourceSha256 ||
            row.settlement.destinationSha256 !== row.authorizedDestinationSha256))
            return null;
        return structuredClone(row);
    }
    async function qualify(work) {
        if (!receiving)
            return { qualified: false, reason: 'missing_settlement' };
        try {
            const row = await read(work);
            if (!row)
                return { qualified: false, reason: 'invalid_join' };
            const bound = { ...work, binding: { ...work.binding, authorizedSourceSha256: row.authorizedSourceSha256,
                    authorizedDestinationSha256: row.authorizedDestinationSha256, evidenceClass: row.evidenceClass } };
            const port = createQualifiedSettlementPort({ observer: receiving.observer, allowSynthetic: receiving.allowSynthetic,
                registry: { readForObligation: async (id) => id === row.work.obligationId ? (await read(work))?.settlement ?? null : null,
                    readReceiptBindings: async (tx, index) => {
                        const allocations = await receiving.readReceiptAllocations(tx, index);
                        if (!Array.isArray(allocations) || allocations.length !== 1)
                            return [];
                        const allocated = allocations[0];
                        return same(allocated.source, receiving.pin) && same(allocated.work, row.work) &&
                            same(allocated.settlement, row.settlement) ? [allocated.settlement] : [];
                    } } });
            const result = await port.qualify(bound);
            // No slow receipt observation may retain revoked/changed canonical authority.
            if (result.qualified) {
                if (!same(await read(work), row))
                    return { qualified: false, reason: 'invalid_join' };
                const settlement = row.settlement;
                const current = await receiving.readReceiptAllocations(settlement.transactionHash, settlement.logIndex);
                if (!Array.isArray(current) || current.length !== 1 || !same(current[0].source, receiving.pin) ||
                    !same(current[0].work, row.work) || !same(current[0].settlement, settlement))
                    return { qualified: false, reason: 'duplicate_receipt' };
            }
            return result;
        }
        catch {
            return { qualified: false, reason: 'unavailable' };
        }
    }
    return { configured: !!receiving, read, qualify, identity,
        async reference(work) {
            const result = await qualify(work);
            if (!result.qualified)
                return { result, record: null, receiptRef: null };
            const record = await read(work);
            return { result, record, receiptRef: record?.settlement ? 'receipt_' + hashRequest({ source: record.source,
                    tx: record.settlement.transactionHash, logIndex: record.settlement.logIndex }) : null };
        } };
}
//# sourceMappingURL=canonical-qualification.js.map