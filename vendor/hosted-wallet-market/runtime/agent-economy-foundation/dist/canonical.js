import { BoundaryError, checked, requireThat } from './contracts.js';
import { assetAtomic, assetDecimal, freezeQuote, usdc } from './money.js';
import { PRODUCTION_ASSETS } from './assets.js';
import { digest } from './operations.js';
/** Controller-enrolled sidecar only. Contains no balances, claims or owed amounts. */
export class MemoryQuoteBindings {
    assets;
    rows = new Map();
    taskOwners = new Map();
    constructor(bindings, assets = PRODUCTION_ASSETS) {
        this.assets = assets;
        for (const binding of bindings) {
            const task = checked('Task', binding.task), quote = freezeQuote(binding.quote, assets);
            for (const k of ['tenantId', 'taskId', 'canonicalTaskId', 'taskVersion', 'requesterId', 'evaluatorId', 'termsVersion']) {
                requireThat(task[k] === quote[k], 'task_quote_binding');
            }
            const tenant = this.taskOwners.get(task.canonicalTaskId);
            requireThat(!tenant || tenant === task.tenantId, 'canonical_task_tenant_conflict');
            this.taskOwners.set(task.canonicalTaskId, task.tenantId);
            const key = JSON.stringify([task.tenantId, quote.quoteId]), prior = this.rows.get(key);
            requireThat(!prior || digest(prior.quote) === digest(quote), 'immutable_quote_conflict');
            this.rows.set(key, { task, quote });
        }
    }
    async read(t, id) { return structuredClone(this.rows.get(JSON.stringify([t, id])) ?? null); }
}
/** Re-read funding eligibility through a real port. A source with no read port refuses; a stored label is not authority. */
export function liveFundingAuthority(source) {
    if (typeof source?.readProof === 'function')
        return source;
    const authorityId = typeof source?.authorityId === 'string' && source.authorityId.length > 0 ? source.authorityId : 'funding-source-unread';
    return { authorityId, async readProof() { throw new BoundaryError('funding_source_unread'); } };
}
export class CanonicalFoundation {
    kernel;
    accounts;
    bindings;
    funding;
    now;
    capture;
    assets;
    authority;
    constructor(kernel, accounts, bindings, funding, now = () => new Date(), capture, assets = PRODUCTION_ASSETS, authority) {
        this.kernel = kernel;
        this.accounts = accounts;
        this.bindings = bindings;
        this.funding = funding;
        this.now = now;
        this.capture = capture;
        this.assets = assets;
        this.authority = authority;
        requireThat(!bindings.assets || bindings.assets === assets, 'asset_registry_binding');
        requireThat(!capture || capture.assets === assets, 'asset_registry_binding');
    }
    async bound(actorInput, quoteId, role) {
        const a = checked('AuthenticatedActor', actorInput), b = await this.bindings.read(a.tenantId, quoteId);
        requireThat(b && b.quote.tenantId === a.tenantId, 'forbidden');
        const q = freezeQuote(b.quote, this.assets);
        const ids = role === 'contributor' ? [q.contributorId] : role === 'evaluator' ? [q.evaluatorId] : [q.requesterId, q.contributorId, q.evaluatorId];
        requireThat(ids.includes(a.actorId), 'forbidden');
        const row = await this.kernel.getTask(q.canonicalTaskId);
        requireThat(row && row.task.id === q.canonicalTaskId && row.terms.version === q.termsVersion, 'canonical_terms_changed');
        const registration = this.assets.registration(q.asset);
        requireThat(row.terms.reward.asset === registration.canonical.asset && row.terms.reward.network === registration.canonical.network &&
            assetAtomic(row.terms.reward.amount, q.asset.decimals) === q.contributorNet, 'canonical_net_mismatch');
        return { actor: a, quote: q, row };
    }
    async read(actor, id) {
        const { quote, row } = await this.bound(actor, id, 'any');
        return { quote, canonicalTaskId: row.task.id, obligation: row.obligation };
    }
    /** New capture allocations never propose a second transfer, including an uncertain join. */
    async payoutDisposition(actor, id, receipts) {
        const { quote } = await this.bound(actor, id, 'evaluator');
        const observed = await receipts.settlementForAllocation(actor, quote.canonicalTaskId);
        return { ...observed, payoutRequired: false, withdrawalFee: '0' };
    }
    async claim(actor, id, operationId) {
        const { quote: q, row } = await this.bound(actor, id, 'contributor');
        requireThat(this.now().getTime() < Date.parse(q.expiresAt), 'quote_expired');
        const f = await this.funding.read(q.tenantId, q.canonicalTaskId);
        requireThat(f?.proof && f.proof.quoteId === q.quoteId && f.proof.amount === q.gross, 'funding_not_final');
        if (this.authority) {
            const live = await this.authority.readProof(f.proof.proofId);
            requireThat(live?.state === 'confirmed' && live.quoteId === q.quoteId && live.amount === q.gross, 'funding_not_final');
            if (q.schemaVersion === 'pilot.agent-economy.v2')
                requireThat(live.schemaVersion === 'pilot.agent-economy.v2' &&
                    live.backing === 'escrowed' && live.quoteDigest === digest(q), 'qualified_escrow_funding_required');
            if (typeof this.authority.authorizationDeadline === 'function') {
                const deadline = await this.authority.authorizationDeadline(f.proof.proofId);
                const observed = typeof this.authority.observedTimestamp === 'function' ? await this.authority.observedTimestamp() : Math.floor(this.now().getTime() / 1000);
                const ttl = Number(row.terms.claimTtlSeconds ?? 3600);
                requireThat(Number.isSafeInteger(ttl) && ttl > 0 && Number.isFinite(deadline) && Number.isFinite(observed) && deadline - observed >= ttl, 'funding_not_final');
            }
        }
        else {
            requireThat(f.available, 'funding_not_final');
            if (q.schemaVersion === 'pilot.agent-economy.v2')
                requireThat(f.proof.schemaVersion === 'pilot.agent-economy.v2' &&
                    f.proof.backing === 'escrowed' && f.proof.quoteDigest === digest(q), 'qualified_escrow_funding_required');
        }
        const contributor = await this.accounts.principal(q.tenantId, actor.actorId, q.canonicalTaskId);
        requireThat(contributor && contributor.payoutDestination === q.payoutDestination, 'principal_binding');
        const request = { taskId: q.canonicalTaskId, termsVersion: q.termsVersion, contributor,
            idempotencyKey: operationId, requestHash: digest({ quoteId: q.quoteId, actorId: actor.actorId, terms: q.termsVersion }) };
        return this.kernel.claim(request);
    }
    async accept(actor, id, input) {
        const { quote: q, row } = await this.bound(actor, id, 'evaluator');
        const contributor = await this.accounts.principal(q.tenantId, q.contributorId, q.canonicalTaskId);
        requireThat(contributor && row.reservation?.id === input.reservationId && row.reservation.contributorPublicId === contributor.publicId &&
            contributor.payoutDestination === q.payoutDestination, 'principal_binding');
        requireThat(row.verdict?.id === input.verdictId && row.verdict.outcome === 'pass' && row.verdict.reservationId === input.reservationId &&
            row.verdict.termsVersion === q.termsVersion && row.verdict.artifactDigestSha256 === input.artifactDigestSha256 &&
            row.submission?.id === row.verdict.submissionId && row.submission.artifact.digestSha256 === input.artifactDigestSha256, 'review_approval_binding');
        requireThat(q.schemaVersion === 'pilot.agent-economy.v2' && this.capture, 'qualified_capture_required');
        const f = await this.funding.read(q.tenantId, q.canonicalTaskId);
        // Only identifies the selected allocation. Cached "available" cannot authorize acceptance.
        requireThat(f && f.proof.quoteId === q.quoteId && f.proof.amount === q.gross, 'funding_binding');
        requireThat(f.proof.schemaVersion === 'pilot.agent-economy.v2' && f.proof.backing === 'escrowed' && f.proof.quoteDigest === digest(q), 'qualified_escrow_funding_required');
        // An old accepted obligation cannot be converted into a new fee-bearing capture.
        // Only the original persisted approval may recover an acceptance that already committed.
        return this.capture.approve(actor, q, input, f.proof.proofId, !row.obligation);
    }
}
/** Existing fixed-net obligations are passed through unchanged and do not require wallet enrollment. */
export function legacyPayoutInstruction(obligation, observed) {
    requireThat(obligation.kind === 'owed_record' && obligation.payoutState === 'owed', 'not_owed');
    // A capture id, or a settled capture receipt for any id spelling, is not a second transfer.
    requireThat(!/^ae14-capture-[a-f0-9]{64}$/.test(obligation.idempotencyKey) && observed?.state !== 'settled', 'capture_receipt_lookup_required');
    requireThat(obligation.reward.asset === 'USDC' && obligation.reward.network === 'base', 'unsupported_legacy_asset');
    return { canonicalObligationId: obligation.id, termsVersion: obligation.termsVersion, contributorPublicId: obligation.contributorPublicId,
        amount: usdc(obligation.reward.amount), platformFee: '0', payoutDestination: obligation.payoutDestination,
        requiresWalletEnrollment: false, originalReward: structuredClone(obligation.reward) };
}
export function canonicalRewardForQuote(q, assets = PRODUCTION_ASSETS) {
    const frozen = freezeQuote(q, assets), registration = assets.registration(frozen.asset);
    return { amount: assetDecimal(frozen.contributorNet, frozen.asset.decimals), ...registration.canonical };
}
