/** Root receiving for an existing owner-assigned claim whose contributor has no
 * local session. No HTTP route, account, grant, or second IOU. The signed record
 * says Root received the report by correspondence; it is not a CLI submission.
 * Packet and allocation bodies stay outside the signed entry and are pinned by hash. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { hashRequest } from '../earned-work/src/crypto.js';
import { ApiError } from '../earned-work/src/errors.js';
import { hashRoundTerms, readCanonicalRoundTerms } from '../earned-work/src/opportunity/terms.js';
import { encodeEvidence } from './submission/validation.js';
const digest = (v) => createHash('sha256').update(v).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const terms = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const accountId = z.string().regex(/^acc_[A-Za-z0-9_-]{16}$/);
const claimId = z.string().regex(/^ocl_[A-Za-z0-9_-]{16}$/);
const roundId = z.string().regex(/^rnd_[A-Za-z0-9_-]{16}$/);
const ref = z.string().min(6).max(300).regex(/^[^\u0000-\u001f\u007f]+$/);
const email = z.string().email().max(254).refine(v => v === v.toLowerCase());
const channel = z.object({ kind: z.literal('email'), threadRef: ref }).strict();
const cost = z.union([z.literal('unknown'), z.null(), z.object({ amount: z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,9})?$/), currency: z.string().regex(/^[A-Z]{3,12}$/) }).strict()]);
export const originalReportSchema = z.object({
    schema: z.literal('pilot.cold-first-use-report.v1'),
    observedStatus: z.enum(['completed', 'refused', 'failed', 'unresolved']),
    runtimeVersion: z.string().min(1).max(500),
    acquisitionUrl: z.string().url(),
    commands: z.array(z.string().min(1).max(500)).min(1).max(32),
    usefulResult: z.string().min(1).max(4000).optional(),
    reproducibleFailure: z.string().min(1).max(4000).optional(),
    effortSeconds: z.number().int().nonnegative().max(86400).optional(),
    clarifications: z.number().int().min(0).max(1).optional(),
    tokenUse: z.union([z.literal('unknown'), z.null(), z.number().int().nonnegative()]).optional(),
    cost: cost.optional(),
}).strict();
const deliveryPin = z.object({
    schema: z.literal('neomorphic.root-original-claim-delivery.v1'),
    accountId, claimId, roundId, offerKey: z.string().min(1).max(80), taskId: z.string().min(3).max(200),
    requesterAccountId: accountId, termsVersion: terms, termsPacketSha256: sha, allocationReceiptSha256: sha,
    sender: email, channel, messageRef: ref, deliveryMessageRef: ref, originalOperationRef: ref,
    receivedAt: z.string().datetime(), reportSha256: sha, report: originalReportSchema,
    provenance: z.literal('root_received_private_correspondence'),
    contributorAuthenticated: z.literal(false), cliSubmitted: z.literal(false),
}).strict();
export const originalDeliverySchema = deliveryPin.extend({
    termsPacket: z.record(z.unknown()), allocationReceipt: z.record(z.unknown()),
}).strict();
const need = (ok, code) => { if (!ok)
    throw new Error(code); };
const parse = (schema, value, code) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
        throw new Error(code);
    return parsed.data;
};
/** Explicit key order. Packet and allocation bodies stay outside the signed entry. */
export function retainedOriginalDelivery(raw) {
    const s = parse(originalDeliverySchema, raw, 'original_delivery_mismatch');
    return {
        schema: s.schema, accountId: s.accountId, claimId: s.claimId, roundId: s.roundId, offerKey: s.offerKey, taskId: s.taskId,
        requesterAccountId: s.requesterAccountId, termsVersion: s.termsVersion, termsPacketSha256: s.termsPacketSha256,
        allocationReceiptSha256: s.allocationReceiptSha256, sender: s.sender, channel: s.channel, messageRef: s.messageRef,
        deliveryMessageRef: s.deliveryMessageRef, originalOperationRef: s.originalOperationRef, receivedAt: s.receivedAt,
        reportSha256: s.reportSha256, report: s.report, provenance: s.provenance,
        contributorAuthenticated: false, cliSubmitted: false,
    };
}
export function originalEvidence(report, maxEffort) {
    const e = parse(originalReportSchema, report, 'original_report_refused');
    const url = new URL(e.acquisitionUrl);
    need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'original_report_url_refused');
    if (e.effortSeconds !== undefined)
        need(e.effortSeconds <= maxEffort, 'original_effort_cap');
    need((e.observedStatus === 'completed' ? e.usefulResult : e.reproducibleFailure)?.trim(), 'original_result_required');
    const retained = JSON.stringify(e);
    need(retained.length <= 4000 && e.commands.join('\n').length <= 4000, 'original_report_bounded');
    let encoded;
    try {
        encoded = encodeEvidence({ format: 'json', body: JSON.stringify({ kind: 'workflow_witness', attempt: e.commands.join('\n'), limitationOrResult: retained, versions: e.runtimeVersion, syntheticFailure: false }), sourceReferences: [] }, 'opportunity');
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('original_'))
            throw error;
        throw new Error('original_report_refused');
    }
    need(!/\b(?:acs|acr)_[A-Za-z0-9_-]{16,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:ssn|social.security|home.address|phone.number)\s*[:=]/i.test(encoded.content), 'original_private_report_refused');
    return { content: encoded.content, digestSha256: digest(encoded.content), bytes: Buffer.byteLength(encoded.content), mediaType: encoded.mediaType };
}
export function inspectOriginalDelivery(raw, bound) {
    const retained = retainedOriginalDelivery(parse(originalDeliverySchema, raw, 'original_delivery_mismatch'));
    need(retained.accountId === bound.accountId && retained.claimId === bound.claimId && retained.roundId === bound.roundId && retained.offerKey === bound.offerKey && retained.taskId === bound.taskId && retained.requesterAccountId === bound.requesterAccountId && retained.termsVersion === bound.termsVersion && retained.termsPacketSha256 === bound.termsPacketSha256 && retained.allocationReceiptSha256 === bound.allocationReceiptSha256 && hashRequest(retained.report) === retained.reportSha256 && retained.contributorAuthenticated === false && retained.cliSubmitted === false, 'original_delivery_mismatch');
    const encoded = originalEvidence(retained.report, bound.maxEffortSeconds);
    need(encoded.bytes <= bound.maxEvidenceBytes, 'original_report_bounded');
    return retained;
}
export class RootOriginalClaimReceiving {
    o;
    constructor(o) {
        this.o = o;
    }
    signature(entry) { return createHmac('sha256', this.o.integrityKey).update(hashRequest(entry)).digest('hex'); }
    projectIntent(id) {
        need(/^ocl_[A-Za-z0-9_-]{16}$/.test(id), 'original_reference_refused');
        const summary = 'root-original-claim:' + id;
        return { title: 'Private Root original-claim receiving', summary, ownerTokenHash: createHmac('sha256', this.o.integrityKey).update(summary).digest('hex'), requestHash: hashRequest({ claimId: id }), idempotencyKey: summary };
    }
    async project(id, create = false) {
        const expected = this.projectIntent(id);
        let bootstrap = await this.o.correspondence.readProjectCreate(expected.idempotencyKey);
        if (!bootstrap && create) {
            await this.o.correspondence.createProject({ ...expected, ownerTokenPlainForReplay: '' });
            bootstrap = await this.o.correspondence.readProjectCreate(expected.idempotencyKey);
        }
        if (!bootstrap)
            return null;
        const [project, grant] = await Promise.all([this.o.correspondence.getProject(bootstrap.projectId), this.o.correspondence.findActiveGrantByTokenHash(expected.ownerTokenHash)]);
        need(project && project.title === expected.title && project.summary === expected.summary && grant?.role === 'owner' && grant.projectId === project.id && bootstrap.title === expected.title && bootstrap.summary === expected.summary && bootstrap.requestHash === expected.requestHash && bootstrap.ownerTokenHash === expected.ownerTokenHash, 'original_correspondence_integrity');
        return project.id;
    }
    async history(id) {
        const project = await this.project(id);
        if (!project)
            return [];
        const page = await this.o.correspondence.listEvents({ projectId: project, afterSequence: 0, limit: 2 });
        need(page.events.length <= 1, 'original_correspondence_integrity');
        return page.events.map(event => {
            const parsed = JSON.parse(event.text ?? '{}');
            const signature = this.signature(parsed.entry);
            need(event.projectId === project && event.sequence === 1 && event.kind === 'reply' && /^[a-f0-9]{64}$/.test(parsed.signature) && timingSafeEqual(Buffer.from(parsed.signature, 'hex'), Buffer.from(signature, 'hex')) && parsed.entry.kind === 'delivery', 'original_correspondence_integrity');
            return parsed.entry;
        });
    }
    async append(id, entry) {
        const project = await this.project(id, true);
        need(project, 'original_project_required');
        const text = JSON.stringify({ entry, signature: this.signature(entry) });
        need(text.length <= 8000, 'original_correspondence_bounded');
        await this.o.correspondence.createEvent({ projectId: project, kind: 'reply', text, idempotencyKey: 'root-original-delivery', requestHash: hashRequest(entry) });
    }
    async authenticate(sessionToken, requesterId, taskId) {
        const authenticated = await this.o.accounts.authenticate(sessionToken);
        const task = await this.o.admission.task(taskId);
        need(authenticated.ok && authenticated.value.accountId === requesterId && task.requester_account_id === requesterId && task.public_discussion === false, 'original_actual_requester_required');
        return authenticated.value;
    }
    async principalFor(id, scope) {
        const row = await this.o.store.withOpportunityClient(async (client) => (await client.query('SELECT id, public_id, payout_destination, task_scope, provenance, expires_at, revoked_at FROM earned_work_contributor_tokens WHERE id=$1', [id])).rows[0], 'read');
        const expires = row?.expires_at ? new Date(row.expires_at).getTime() : null;
        need(row && !row.revoked_at && row.task_scope === scope && (expires === null || expires > this.o.store.now().getTime()), 'original_principal_unavailable');
        return { id: row.id, publicId: row.public_id, payoutDestination: row.payout_destination, taskScope: row.task_scope, provenance: row.provenance, expiresAt: expires === null ? null : new Date(row.expires_at).toISOString() };
    }
    async loadBound(raw) {
        const full = parse(originalDeliverySchema, raw, 'original_delivery_mismatch');
        const retained = retainedOriginalDelivery(full);
        const task = await this.o.admission.task(retained.taskId);
        const round = await this.o.admission.round(task.round_key);
        const document = readCanonicalRoundTerms(round.terms_document, round.terms_version);
        const offer = document.offers[0];
        need(!document.receivingPolicy && document.offers.length === 1 && document.alternatives.length === 0 && offer.evidenceKind === 'workflow_witness' && !offer.publicClaimable && offer.ownerReservedSlots === offer.slotCount && offer.slotCount > 0 && offer.rewardAtomic > 0, 'original_explicit_terms_required');
        need(round.provenance === 'production' && round.production_admission === true && round.id === retained.roundId && task.requester_account_id === retained.requesterAccountId && retained.taskId === document.roundKey + ':' + offer.offerKey && retained.offerKey === offer.offerKey && retained.termsVersion === round.terms_version, 'original_source_mismatch');
        const packet = full.termsPacket;
        const allocation = full.allocationReceipt;
        need(packet.schema === 'pilot.funded-terms.v1' && packet.participantAccess === 'owner_assigned_no_public_claim' && packet.evidencePolicy === 'cold-first-use-report-v1' && !packet.round?.receivingPolicy && hashRoundTerms(packet.round) === retained.termsVersion && digest(JSON.stringify(packet)) === retained.termsPacketSha256 && packet.payment?.netAtomic === String(offer.rewardAtomic) && packet.payment?.feesPaidBy === 'requester' && packet.payment?.rewardFor === 'bounded_report_including_evidenced_failure_or_no_fit', 'original_terms_packet_mismatch');
        need(allocation.schema === 'pilot.root-allocation-receipt.v1' && allocation.status === 'reserved' && allocation.recordRef?.length > 5 && allocation.operationId?.length > 5 && allocation.roundId === document.roundKey && allocation.deadline === document.submissionDeadline && allocation.principalReserveAtomicUsdc === String(document.principalCapAtomic) && allocation.gasCapWei === document.transferFeeCap.amountAtomic && allocation.termsVersion === retained.termsVersion && allocation.termsPacketSha256 === retained.termsPacketSha256 && allocation.asset === 'USDC' && allocation.chainId === 8453 && Number.isFinite(Date.parse(allocation.reservedAt)) && Date.parse(allocation.reservedAt) <= this.o.store.now().getTime() && digest(JSON.stringify(allocation)) === retained.allocationReceiptSha256, 'original_allocation_mismatch');
        const account = await this.o.store.withOpportunityClient(async (client) => (await client.query('SELECT id FROM journey_accounts WHERE id=$1', [retained.accountId])).rows[0], 'read');
        need(account, 'original_account_missing');
        const claim = await this.o.store.withOpportunityClient(async (client) => (await client.query('SELECT * FROM opportunity_claims WHERE id=$1', [retained.claimId])).rows[0], 'read');
        need(claim && claim.kind === 'owner_assigned' && claim.credential_ref === retained.accountId && claim.round_id === round.id && claim.terms_version === retained.termsVersion && claim.offer_id && String(claim.reward_atomic) === String(offer.rewardAtomic), 'original_claim_mismatch');
        const offerRow = await this.o.store.withOpportunityClient(async (client) => (await client.query('SELECT offer_key FROM opportunity_offers WHERE id=$1', [claim.offer_id])).rows[0], 'read');
        need(offerRow?.offer_key === retained.offerKey, 'original_claim_mismatch');
        const principal = await this.principalFor(claim.contributor_token_id, 'opportunity:' + round.id);
        const encoded = originalEvidence(retained.report, offer.maxEffortSeconds);
        need(encoded.bytes <= document.maxEvidenceBytes, 'original_report_bounded');
        return { retained, round, document, offer, claim, principal, encoded };
    }
    async storedDelivery(id) {
        const entries = await this.history(id);
        return entries[0] ?? null;
    }
    async loadClaim(claim) {
        if (claim?.kind !== 'owner_assigned' || typeof claim.credential_ref !== 'string' || !/^acc_[A-Za-z0-9_-]{16}$/.test(claim.credential_ref) || typeof claim.id !== 'string' || !/^ocl_[A-Za-z0-9_-]{16}$/.test(claim.id))
            return null;
        const entries = await this.history(claim.id);
        const found = entries[0];
        if (!found)
            return null;
        need(found.delivery.claimId === claim.id && found.delivery.accountId === claim.credential_ref && found.delivery.roundId === claim.round_id && found.delivery.termsVersion === claim.terms_version && found.delivery.contributorAuthenticated === false && found.delivery.cliSubmitted === false && found.delivery.provenance === 'root_received_private_correspondence', 'original_claim_mismatch');
        const task = await this.o.admission.task(found.delivery.taskId);
        const round = await this.o.admission.round(task.round_key);
        const document = readCanonicalRoundTerms(round.terms_document, round.terms_version);
        need(!document.receivingPolicy && round.id === claim.round_id && found.delivery.taskId === document.roundKey + ':' + document.offers[0].offerKey, 'original_claim_mismatch');
        const encoded = originalEvidence(found.delivery.report, document.offers[0].maxEffortSeconds);
        need(encoded.digestSha256 === found.artifact.digestSha256 && encoded.bytes === found.artifact.bytes && encoded.mediaType === found.artifact.mediaType && found.artifact.ref === 'root-original-artifact:' + found.artifactId, 'original_artifact_integrity');
        const principal = await this.principalFor(claim.contributor_token_id, 'opportunity:' + round.id);
        const frozen = { ...found, content: encoded.content, provenance: 'root_received_private_correspondence', contributorAuthenticated: false, cliSubmitted: false, accountId: found.delivery.accountId, claimId: found.delivery.claimId, taskId: found.delivery.taskId, termsVersion: found.delivery.termsVersion };
        return { accountId: found.delivery.accountId, principal, frozen };
    }
    async receive(sessionToken, raw, key) {
        const full = parse(originalDeliverySchema, raw, 'original_delivery_mismatch');
        await this.authenticate(sessionToken, full.requesterAccountId, full.taskId);
        const bound = await this.loadBound(full);
        const artifactId = 'original_' + hashRequest({ claimId: bound.retained.claimId, key }).slice(0, 32);
        const entry = { kind: 'delivery', delivery: bound.retained, artifactId, artifact: { ref: 'root-original-artifact:' + artifactId, digestSha256: bound.encoded.digestSha256, mediaType: bound.encoded.mediaType, bytes: bound.encoded.bytes }, key, requesterAccountId: bound.retained.requesterAccountId };
        return this.o.lock.run('root-original-claim:' + bound.retained.claimId, async () => {
            const entries = await this.history(bound.retained.claimId);
            const old = entries[0];
            if (old)
                need(hashRequest(old) === hashRequest(entry), 'original_delivery_immutable');
            else {
                const current = await this.o.store.withOpportunityClient(async (client) => (await client.query('SELECT status, expires_at FROM opportunity_claims WHERE id=$1', [bound.claim.id])).rows[0], 'read');
                need(current, 'original_claim_mismatch');
                if (current.status === 'submitted' || current.status === 'accepted' || current.status === 'owed')
                    throw new Error('original_delivery_immutable');
                if (current.status === 'released')
                    throw new Error('late_submission');
                const now = this.o.store.now().getTime();
                const receivedAt = Date.parse(bound.retained.receivedAt);
                const expiresAt = new Date(current.expires_at).getTime();
                const deadline = new Date(bound.round.submission_deadline).getTime();
                need(Number.isFinite(receivedAt) && receivedAt <= now && receivedAt < expiresAt && receivedAt < deadline, 'late_submission');
                need(bound.round.status === 'open' && now < deadline, 'round_closed');
                await this.append(bound.retained.claimId, entry);
            }
            let receipt;
            try {
                receipt = await this.o.opportunity.submit(bound.document.roundKey, bound.claim.id, { provenance: 'production', artifact: entry.artifact, evidence: JSON.parse(bound.encoded.content) }, bound.principal, key, { preExpiryCorrespondence: { receivedAt: bound.retained.receivedAt } });
            }
            catch (error) {
                if (error instanceof ApiError)
                    throw new Error(error.code);
                throw error;
            }
            need(receipt.statusCode < 400, 'original_submission_refused');
            return { claimId: bound.claim.id, artifactId, artifact: entry.artifact, reportSha256: bound.retained.reportSha256, accountId: bound.retained.accountId, contributorAuthenticated: false, cliSubmitted: false };
        });
    }
}
//# sourceMappingURL=original-claim-receiving.js.map