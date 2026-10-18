import { readFileSync } from 'node:fs';
import { checked, immutable, requireThat } from './contracts.js';
import { digest } from './operations.js';
import { assetAtomic, freezeQuote } from './money.js';
import { PRODUCTION_ASSETS } from './assets.js';
export const COMMERCE_PAYMENTS_PIN = immutable(checked('CommercePaymentsPin', JSON.parse(readFileSync(new URL('./interfaces/commerce-payments-v1.1.0.pin.json', import.meta.url), 'utf8'))));
function checkQualification(assets, qualification) {
    requireThat(qualification === 'registered' || qualification === 'production', 'capture_qualification_mode');
    if (qualification === 'production')
        assets.requireProduction();
}
/** Adapt the existing family writer; its idempotency journal recovers a lost acceptance commit. */
export class CanonicalAcceptanceSettlement {
    kernel;
    receipts;
    assets;
    qualification;
    constructor(kernel, receipts, assets = PRODUCTION_ASSETS, qualification = 'registered') {
        this.kernel = kernel;
        this.receipts = receipts;
        this.assets = assets;
        this.qualification = qualification;
        checkQualification(assets, qualification);
    }
    async join(q, request, approval, capture) {
        qualifyCapture(q, request, capture, this.assets, this.qualification);
        requireThat(capture.finality === 'final' && capture.finalityRef, 'capture_not_final');
        const binding = await this.receipts.reserve(request, capture); // Claim the actual receipt BEFORE any debt mutation.
        if (binding.joined)
            return binding.joined;
        const accepted = await this.kernel.accept({ taskId: q.canonicalTaskId, reservationId: approval.reservationId,
            verdictId: approval.verdictId, artifactDigestSha256: approval.artifactDigestSha256,
            idempotencyKey: `ae14-capture-${digest(request)}`, requestHash: digest({ request, approval }) });
        const body = accepted.body;
        const registration = this.assets.registration(q.asset);
        requireThat(body.obligation.taskId === q.canonicalTaskId && body.obligation.termsVersion === q.termsVersion &&
            body.obligation.payoutDestination === q.payoutDestination && body.obligation.reward.asset === registration.canonical.asset &&
            body.obligation.reward.network === registration.canonical.network && assetAtomic(body.obligation.reward.amount, q.asset.decimals) === q.contributorNet, 'capture_obligation_binding');
        const joined = { canonicalObligationId: body.obligation.id, canonicalTaskId: q.canonicalTaskId, termsVersion: q.termsVersion,
            quoteDigest: digest(q), requestDigest: digest(request), txRef: capture.txRef, finalityRef: capture.finalityRef,
            amount: capture.amount, contributorNet: q.contributorNet, feeAmount: capture.feeAmount, feeRecipient: capture.feeRecipient,
            qualified: true, provenance: capture.provenance, acceptance: { ...accepted, body } };
        await this.receipts.save({ ...binding, joined });
        return joined;
    }
}
export function qualifyCapture(qInput, request, input, assets = PRODUCTION_ASSETS, qualification = 'registered') {
    checkQualification(assets, qualification);
    const q = freezeQuote(qInput, assets);
    checked('CaptureRequest', request);
    requireThat(q.schemaVersion === 'pilot.agent-economy.v2' && digest(q) === request.quoteDigest &&
        request.quoteId === q.quoteId && request.tenantId === q.tenantId && request.allocationId === q.canonicalTaskId &&
        request.actorId === q.evaluatorId && request.authorityId === q.settlementAuthorityId && digest(request.asset) === digest(q.asset) &&
        request.amount === q.gross && request.feeAmount === q.platformFee && request.feeRecipient === q.feeRecipient &&
        request.payoutDestination === q.payoutDestination && request.escrowTarget === q.fundingTarget, 'capture_request_binding');
    const outcome = checked('CaptureOutcome', input);
    requireThat(assets.environment !== 'sandbox' || outcome.provenance !== 'production', 'sandbox_not_production');
    if (qualification === 'production')
        requireThat(outcome.state === 'unknown' || outcome.provenance === 'production', 'production_capture_required');
    requireThat(outcome.requestDigest === digest(request), 'capture_readback_binding');
    if (outcome.state === 'captured') {
        requireThat(outcome.amount === q.gross && outcome.feeAmount === q.platformFee && outcome.feeRecipient === q.feeRecipient, 'capture_amount_fee_binding');
        requireThat(outcome.finality !== 'final' || Boolean(outcome.finalityRef), 'capture_missing_finality');
    }
    return outcome;
}
/** Review authorization must be independently validated by the canonical family BEFORE begin. */
export class ApprovalCapture {
    journal;
    port;
    writer;
    assets;
    qualification;
    constructor(journal, port, writer, assets = PRODUCTION_ASSETS, qualification = 'registered') {
        this.journal = journal;
        this.port = port;
        this.writer = writer;
        this.assets = assets;
        this.qualification = qualification;
        requireThat(!writer.assets || writer.assets === assets, 'asset_registry_binding');
        checkQualification(assets, qualification);
    }
    result(row, replayed) {
        return { schemaVersion: 'pilot.agent-economy.v2', state: row.state, outcome: row.outcome, settlement: row.settlement, replayed,
            statusCode: row.state === 'approval_pending' ? 202 : row.settlement?.acceptance.statusCode ?? 409,
            body: row.settlement?.acceptance.body ?? {} };
    }
    async approve(actor, q, approval, fundingProofId, permitNewApproval = true) {
        checked('AuthenticatedActor', actor);
        freezeQuote(q, this.assets);
        requireThat(actor.tenantId === q.tenantId && actor.actorId === q.evaluatorId, 'forbidden');
        requireThat(digest(this.port.protocol) === digest(q.fee.profile.escrow), 'capture_adapter_pin');
        const request = checked('CaptureRequest', { schemaVersion: 'pilot.agent-economy.v2', operationId: approval.operationId,
            tenantId: q.tenantId, actorId: actor.actorId, authorityId: q.settlementAuthorityId, quoteId: q.quoteId,
            quoteDigest: digest(q), approvalDigest: digest(approval), allocationId: q.canonicalTaskId, asset: q.asset,
            amount: q.gross, feeAmount: q.platformFee, feeRecipient: q.feeRecipient, payoutDestination: q.payoutDestination, fundingProofId, escrowTarget: q.fundingTarget });
        // Commit approval_pending before the first transport effect; a crash cannot discard approval authority.
        await this.journal.exclusive(q.tenantId, q.canonicalTaskId, async (records) => {
            const prior = await records.read(q.tenantId, q.canonicalTaskId);
            requireThat(prior || permitNewApproval, 'existing_obligation_terms_preserved');
            requireThat(!prior || digest(prior.request) === digest(request), 'approval_conflict');
            if (!prior)
                await records.write({ request, quote: q, approval, state: 'approval_pending', outcome: null, settlement: null });
        });
        return this.advance(actor, q.tenantId, q.canonicalTaskId, true);
    }
    /** Restart and duplicate readbacks use the saved approval/request, never a caller's changed quote. */
    async observe(actor, tenantId, allocationId) {
        return this.advance(actor, tenantId, allocationId, false);
    }
    async advance(actor, tenantId, allocationId, allowCapture) {
        checked('AuthenticatedActor', actor);
        requireThat(actor.tenantId === tenantId, 'forbidden');
        return this.journal.exclusive(tenantId, allocationId, async (records) => {
            const row = await records.read(tenantId, allocationId);
            requireThat(row && row.request.actorId === actor.actorId, 'forbidden');
            freezeQuote(row.quote, this.assets);
            if (row.state !== 'approval_pending') {
                if (row.outcome)
                    qualifyCapture(row.quote, row.request, row.outcome, this.assets, this.qualification);
                return this.result(row, true);
            }
            requireThat(digest(this.port.protocol) === digest(row.quote.fee.profile.escrow), 'capture_adapter_pin');
            let outcome;
            try {
                outcome = await this.port.readback(row.request);
            }
            catch {
                outcome = { schemaVersion: 'pilot.agent-economy.v2', state: 'unknown', provenance: 'unknown', requestDigest: digest(row.request) };
            }
            outcome = qualifyCapture(row.quote, row.request, outcome, this.assets, this.qualification);
            if (outcome.state === 'authorized' && allowCapture) {
                try {
                    outcome = qualifyCapture(row.quote, row.request, await this.port.capture(row.request), this.assets, this.qualification);
                }
                catch (error) {
                    // Binding errors are not transport ambiguity and must remain visible.
                    if (error instanceof Error && 'code' in error)
                        throw error;
                    outcome = { schemaVersion: 'pilot.agent-economy.v2', state: 'unknown', provenance: outcome.provenance, requestDigest: digest(row.request) };
                }
            }
            row.outcome = outcome;
            if (outcome.state === 'expired_reclaimed' || outcome.state === 'refunded')
                row.state = outcome.state;
            if (outcome.state === 'captured' && outcome.finality === 'final') {
                row.settlement = await this.writer.join(row.quote, row.request, row.approval, outcome);
                row.state = 'accepted_settled';
            }
            await records.write(row);
            return this.result(row, false);
        });
    }
}
export class FakeCapturePort {
    protocol = COMMERCE_PAYMENTS_PIN;
    state = 'authorized';
    finality = 'final';
    captureCalls = 0;
    loseNextResponse = false;
    async readback(r) {
        const common = { schemaVersion: 'pilot.agent-economy.v2', provenance: 'fake', requestDigest: digest(r) };
        if (this.state === 'authorized')
            return { ...common, state: 'authorized', backing: 'escrowed', authorizationRef: r.fundingProofId, expiresAt: '2099-01-01T00:00:00.000Z' };
        if (this.state === 'captured')
            return { ...common, state: 'captured', amount: r.amount, feeAmount: r.feeAmount, feeRecipient: r.feeRecipient,
                txRef: `fake:capture:${r.allocationId}`, finality: this.finality, finalityRef: this.finality === 'final' ? 'fake:final-block' : null };
        if (this.state === 'unknown')
            return { ...common, state: 'unknown' };
        return { ...common, state: this.state, txRef: `fake:${this.state}:${r.allocationId}` };
    }
    async capture(r) {
        this.captureCalls++;
        if (this.state === 'authorized')
            this.state = 'captured'; // Reclaim may have won before this invocation.
        const result = await this.readback(r);
        if (this.loseNextResponse) {
            this.loseNextResponse = false;
            throw new Error('fake_capture_response_lost');
        }
        return result;
    }
}
