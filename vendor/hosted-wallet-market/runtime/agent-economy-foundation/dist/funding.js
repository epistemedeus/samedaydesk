import { checked, checkedFundingProof, requireThat } from './contracts.js';
import { freezeQuote } from './money.js';
import { digest } from './operations.js';
import { PRODUCTION_ASSETS } from './assets.js';
/** One globally scoped proof -> one allocation; unknown/pending remain quarantined. No balance/debt ledger. */
export class MemoryFundingReservations {
    proofs = new Map();
    allocations = new Map();
    proofKey(p) { return JSON.stringify([p.asset.chain, p.asset.token.toLowerCase(), p.proofId]); }
    allocationKey(t, a) { return JSON.stringify([t, a]); }
    async reserve(input) {
        const p = checkedFundingProof(input), pk = this.proofKey(p), ak = this.allocationKey(p.tenantId, p.allocationId);
        const prior = this.proofs.get(pk), allocated = this.allocations.get(ak);
        requireThat(!allocated || allocated === pk, 'allocation_already_funded');
        if (prior) {
            const terms = ({ state, finalityRef, ...rest }) => rest;
            requireThat(digest(terms(prior)) === digest(terms(p)), 'proof_already_allocated');
            requireThat(prior.state !== 'failed' || p.state === 'failed', 'finality_conflict');
        }
        requireThat(p.state !== 'confirmed' || Boolean(p.finalityRef), 'missing_finality');
        this.proofs.set(pk, p);
        this.allocations.set(ak, pk);
        return { proof: structuredClone(p), available: p.state === 'confirmed' };
    }
    async read(t, allocationId) {
        const key = this.allocations.get(this.allocationKey(t, allocationId));
        const p = key ? this.proofs.get(key) : null;
        return p ? { proof: structuredClone(p), available: p.state === 'confirmed' } : null;
    }
}
export class FundingService {
    authority;
    reservations;
    now;
    assets;
    constructor(authority, reservations, now = () => new Date(), assets = PRODUCTION_ASSETS) {
        this.authority = authority;
        this.reservations = reservations;
        this.now = now;
        this.assets = assets;
    }
    async read(actorInput, quoteInput) {
        const a = checked('AuthenticatedActor', actorInput), q = freezeQuote(quoteInput, this.assets);
        requireThat(a.tenantId === q.tenantId && [q.requesterId, q.evaluatorId, q.contributorId].includes(a.actorId), 'forbidden');
        return this.reservations.read(q.tenantId, q.canonicalTaskId);
    }
    async reserve(actorInput, quoteInput, proofId) {
        const actor = checked('AuthenticatedActor', actorInput), q = freezeQuote(quoteInput, this.assets);
        requireThat(actor.tenantId === q.tenantId && actor.actorId === q.requesterId, 'forbidden');
        requireThat(this.authority.authorityId === q.fundingAuthorityId, 'funding_authority');
        const p = await this.authority.readProof(proofId);
        requireThat(p, 'proof_absent');
        checkedFundingProof(p);
        if (this.now().getTime() >= Date.parse(q.expiresAt)) {
            const at = await this.authority.authorizationTimestamp?.(proofId);
            requireThat(p.state === 'confirmed' && typeof at === 'number' && Number.isSafeInteger(at) && at * 1000 < Date.parse(q.expiresAt), 'quote_expired');
        }
        if (q.schemaVersion === 'pilot.agent-economy.v2') {
            requireThat(p.schemaVersion === 'pilot.agent-economy.v2' && p.backing === 'escrowed' && p.quoteDigest === digest(q), 'qualified_escrow_funding_required');
        }
        requireThat(p.proofId === proofId && p.tenantId === q.tenantId && p.quoteId === q.quoteId && p.taskId === q.taskId &&
            p.allocationId === q.canonicalTaskId && p.requesterId === q.requesterId && p.fundingAuthorityId === q.fundingAuthorityId &&
            digest(p.asset) === digest(q.asset) && p.recipient === q.fundingTarget && p.amount === q.gross, 'funding_binding');
        return this.reservations.reserve(p);
    }
}
export class FakeFundingAuthority {
    authorityId;
    proofs = new Map();
    constructor(authorityId) {
        this.authorityId = authorityId;
    }
    set(proof) { this.proofs.set(proof.proofId, checkedFundingProof(proof)); }
    async readProof(id) { return structuredClone(this.proofs.get(id) ?? null); }
}
