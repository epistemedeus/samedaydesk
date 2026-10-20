import { checked, requireThat } from './contracts.js';
import { digest } from './operations.js';
export class AuthorityBoundEffects {
    funding;
    settlement;
    rail;
    constructor(funding, settlement, rail) {
        this.funding = funding;
        this.settlement = settlement;
        this.rail = rail;
    }
    authority(r) { return r.kind === 'fund' ? this.funding : this.settlement; }
    async authorize(r) { await this.authority(r).authorize(r); }
    async readback(r) {
        // The operation journal checks original tenant/actor ownership. Observation grants no spending authority.
        return this.rail.readback(r);
    }
    async submit(r) {
        await this.authority(r).authorize(r);
        return this.rail.submit(r);
    }
}
/** Immutable controller-created grants for fixtures; never construct these from public request bodies. */
export class FakeEconomicAuthority {
    authorityId;
    role;
    requests = new Set();
    revoked = false;
    constructor(authorityId, role, grants) {
        this.authorityId = authorityId;
        this.role = role;
        for (const r of grants) {
            checked('OperationRequest', r);
            requireThat(r.authorityId === authorityId && (role === 'funding' ? r.kind === 'fund' : r.kind !== 'fund'), 'authority_kind');
            this.requests.add(digest(r));
        }
    }
    revoke() { this.revoked = true; }
    async authorize(input) {
        const r = checked('OperationRequest', input);
        requireThat(!this.revoked && r.authorityId === this.authorityId && this.requests.has(digest(r)), 'economic_authority_denied');
    }
}
