import { BoundaryError, checked, digest, freezeQuote, legacyPayoutInstruction, requireThat } from '../../agent-economy-foundation/dist/index.js';
/** A/B boundary: read the committed F1 approval and independently replay the existing canonical review. No acceptance writer. */
export class CanonicalReviewAuthority {
    db;
    schema;
    kernel;
    accounts;
    assets;
    constructor(db, schema, kernel, accounts, assets) {
        this.db = db;
        this.schema = schema;
        this.kernel = kernel;
        this.accounts = accounts;
        this.assets = assets;
        requireThat(assets, 'asset_registry_required');
        requireThat(/^[a-z][a-z0-9_]{0,62}$/.test(schema), 'journal_schema');
    }
    async authorize(input) {
        const r = checked('CaptureRequest', input);
        // F1 holds the approval advisory lock during this callback. Read its previously committed intent without reentering the lock.
        const saved = (await this.db.query(`SELECT record FROM "${this.schema}".ae14_capture_approvals WHERE tenant_id=$1 AND allocation_id=$2`, [r.tenantId, r.allocationId])).rows[0]?.record;
        requireThat(saved && saved.state === 'approval_pending' && digest(saved.request) === digest(r) && digest(saved.approval) === r.approvalDigest, 'review_authority_required');
        const q = freezeQuote(saved.quote, this.assets);
        requireThat(q.tenantId === r.tenantId && q.evaluatorId === r.actorId && q.settlementAuthorityId === r.authorityId && q.canonicalTaskId === r.allocationId && digest(q) === r.quoteDigest, 'capture_request_binding');
        const row = await this.kernel.getTask(r.allocationId), principal = await this.accounts.principal(q.tenantId, q.contributorId, r.allocationId);
        requireThat(principal && principal.payoutDestination === q.payoutDestination && row?.reservation?.contributorPublicId === principal.publicId, 'principal_binding');
        requireThat(row.terms.version === q.termsVersion && row.reservation.id === saved.approval.reservationId && row.verdict?.id === saved.approval.verdictId && row.verdict.outcome === 'pass' && row.verdict.termsVersion === q.termsVersion && row.verdict.artifactDigestSha256 === saved.approval.artifactDigestSha256 && row.submission?.id === row.verdict.submissionId && row.submission.artifact.digestSha256 === saved.approval.artifactDigestSha256, 'review_approval_binding');
    }
}
/** A payout consumer must check SA4; both a settled capture and an uncertain capture join suppress a second instruction. */
export class CapturePayoutConsumer {
    receipts;
    constructor(receipts) {
        this.receipts = receipts;
    }
    async proposal(actor, allocationId, obligation) {
        const observed = await this.receipts.settlementForAllocation(actor, allocationId);
        const held = { ...observed, payoutRequired: false, operation: null, withdrawalFee: '0' };
        // No obligation, or a settled capture of any id, is not a second payout. An unknown join stays held.
        if (!obligation || observed.state === 'settled')
            return held;
        try {
            const operation = legacyPayoutInstruction(obligation, observed);
            return { ...observed, payoutRequired: true, operation, withdrawalFee: '0' };
        }
        catch (error) {
            if (error instanceof BoundaryError && error.code === 'capture_receipt_lookup_required')
                return held;
            throw error;
        }
    }
}
