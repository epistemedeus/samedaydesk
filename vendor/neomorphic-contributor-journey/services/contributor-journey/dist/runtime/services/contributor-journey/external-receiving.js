import { nativeRewardAssetSchema } from '../earned-work/src/opportunity/validate.js';
/** Private Root correspondence receiving. No HTTP route, account, or second IOU.
 * Signatures attest what the configured Root receiver retained. They do not
 * authenticate an email provider or imply successful signup/use or payment.
 * The signed record omits the terms packet and allocation bodies: those stay in
 * Root's private files and are pinned by hash. Correspondence text is capped
 * at the existing 8000-character event column. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { hashRequest, hashToken, issueToken } from '../earned-work/src/crypto.js';
import { hashRoundTerms, readCanonicalRoundTerms } from '../earned-work/src/opportunity/terms.js';
import { workflowEvidenceSchema } from '../earned-work/src/opportunity/validate.js';
import { encodeEvidence } from './submission/validation.js';
const digest = (v) => createHash('sha256').update(v).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{64}$/), terms = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ref = z.string().min(6).max(300).regex(/^[^\u0000-\u001f\u007f]+$/);
const email = z.string().email().max(254).refine(v => v === v.toLowerCase());
const channel = z.object({ kind: z.literal('email'), threadRef: ref }).strict();
const rootReceipt = z.object({ provenance: z.literal('root_received_private_correspondence'), recordRef: ref, receivedAt: z.string().datetime(), actualExternalIdentity: z.literal(true) }).strict();
const packetPinV1 = z.object({
    schema: z.literal('neomorphic.root-external-selection.v1'), roundId: z.string(), taskId: z.string(), requesterAccountId: z.string(), termsVersion: terms,
    termsPacketSha256: sha, allocationReceiptSha256: sha,
    identity: email, channel, publicLabel: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,78}$/),
    agreement: z.object({ sender: email, threadRef: ref, messageRef: ref, termsRef: ref, originalOperationRef: ref, termsVersion: terms, termsPacketSha256: sha, agreedAt: z.string().datetime() }).strict(),
    rootReceipt,
}).strict();
const packetPinV2 = packetPinV1.extend({ schema: z.literal('neomorphic.root-external-selection.v2'),
    agreement: packetPinV1.shape.agreement.extend({ payoutDestination: z.object({ rewardAsset: nativeRewardAssetSchema, address: z.string().regex(/^0x[a-f0-9]{40}$/) }).strict() }).strict() }).strict();
const packetPin = z.discriminatedUnion('schema', [packetPinV1, packetPinV2]);
const packetBodies = { termsPacket: z.record(z.unknown()), allocationReceipt: z.record(z.unknown()) };
export const externalSelectionSchema = z.discriminatedUnion('schema', [packetPinV1.extend(packetBodies).strict(), packetPinV2.extend(packetBodies).strict()]);
const cost = z.union([z.literal('unknown'), z.null(), z.object({ amount: z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,9})?$/), currency: z.string().regex(/^[A-Z]{3,12}$/) }).strict()]);
const coldReportSchema = z.object({
    schema: z.literal('pilot.cold-first-use-report.v1'), observedStatus: z.enum(['completed', 'refused', 'failed', 'unresolved']),
    runtimeVersion: z.string().min(1).max(500), acquisitionUrl: z.string().url(), commands: z.array(z.string().min(1).max(500)).min(1).max(32),
    usefulResult: z.string().min(1).max(4000).optional(), reproducibleFailure: z.string().min(1).max(4000).optional(),
    effortSeconds: z.number().int().nonnegative().max(86400).optional(), clarifications: z.number().int().min(0).max(1),
    tokenUse: z.union([z.literal('unknown'), z.null(), z.number().int().nonnegative()]).optional(), cost: cost.optional(),
}).strict();
// Reuse the native workflow witness for retained observations without acquisition
// or command execution. Keep the cold report's order and encoding byte-for-byte.
export const externalReportSchema = z.union([coldReportSchema, z.custom(value => workflowEvidenceSchema.safeParse(value).success)]);
const receiptBindingSchema = z.object({ roundId: z.string(), claimId: z.string(), termsVersion: terms, credentialRef: z.string(), principalId: z.string(), artifactDigestSha256: sha, artifactBytes: z.number().int().positive() }).strict();
const receiptAttestationSchema = z.object({ schema: z.literal('neomorphic.root-external-receipt.v1'), binding: receiptBindingSchema,
    selectionSha256: sha, assignmentKeySha256: sha, deliverySha256: sha, receivedAt: z.string().datetime(), attestedAt: z.string().datetime(), signature: sha }).strict();
export const externalDeliverySchema = z.object({
    schema: z.literal('neomorphic.root-external-delivery.v1'), credentialRef: z.string(), claimId: z.string(), termsVersion: terms,
    sender: email, channel, agreementMessageRef: ref, deliveryMessageRef: ref, originalOperationRef: ref, reportSha256: sha,
    report: externalReportSchema, rootReceipt, receiptAttestation: receiptAttestationSchema.optional(),
}).strict();
const need = (ok, code) => { if (!ok)
    throw new Error(code); };
const parse = (schema, value, code) => { const parsed = schema.safeParse(value); if (!parsed.success)
    throw new Error(code); return parsed.data; };
export function externalCredentialRef(selection) {
    return 'root_ext_' + hashRequest({ roundId: selection.roundId, identity: selection.identity });
}
/** Explicit key order. This is the signed selection; packet bodies stay outside correspondence. */
export function retainedExternalSelection(selection) {
    const s = parse(externalSelectionSchema, selection, 'external_recipient_refused');
    return parse(packetPin, { schema: s.schema, roundId: s.roundId, taskId: s.taskId, requesterAccountId: s.requesterAccountId, termsVersion: s.termsVersion,
        termsPacketSha256: s.termsPacketSha256, allocationReceiptSha256: s.allocationReceiptSha256, identity: s.identity, channel: s.channel,
        publicLabel: s.publicLabel, agreement: s.agreement, rootReceipt: s.rootReceipt }, 'external_selection_mismatch');
}
export function externalEvidence(report, maxEffort) {
    const e = parse(externalReportSchema, report, 'external_report_refused');
    let body;
    if ('kind' in e) {
        body = JSON.stringify(e);
    }
    else {
        const url = new URL(e.acquisitionUrl);
        need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'external_report_url_refused');
        need(e.effortSeconds === undefined || e.effortSeconds <= maxEffort, 'external_effort_cap');
        need((e.observedStatus === 'completed' ? e.usefulResult : e.reproducibleFailure)?.trim(), 'external_result_required');
        const retained = JSON.stringify(e);
        need(retained.length <= 4000 && e.commands.join('\n').length <= 4000, 'external_report_bounded');
        body = JSON.stringify({ kind: 'workflow_witness', attempt: e.commands.join('\n'), limitationOrResult: retained, versions: e.runtimeVersion, syntheticFailure: false });
    }
    const encoded = encodeEvidence({ format: 'json', body, sourceReferences: [] }, 'opportunity');
    // Credential patterns plus common private identity/contact fields must be removed.
    need(!/\b(?:acs|acr)_[A-Za-z0-9_-]{16,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:ssn|social.security|home.address|phone.number)\s*[:=]/i.test(encoded.content), 'external_private_report_refused');
    return { content: encoded.content, digestSha256: digest(encoded.content), bytes: Buffer.byteLength(encoded.content), mediaType: encoded.mediaType };
}
export function inspectExternalDelivery(raw, bound) {
    const d = parse(externalDeliverySchema, raw, 'external_delivery_mismatch');
    need(d.credentialRef === bound.credentialRef && d.claimId === bound.claimId && d.termsVersion === bound.termsVersion && d.sender === bound.identity && hashRequest(d.channel) === hashRequest(bound.channel) && d.agreementMessageRef === bound.agreementMessageRef && d.originalOperationRef === bound.originalOperationRef && hashRequest(d.report) === d.reportSha256, 'external_delivery_mismatch');
    const encoded = externalEvidence(d.report, bound.maxEffortSeconds);
    need(encoded.bytes <= bound.maxEvidenceBytes, 'external_report_bounded');
    return d;
}
export class RootExternalReceiving {
    o;
    constructor(o) {
        this.o = o;
    }
    signature(entry) { return createHmac('sha256', this.o.integrityKey).update(hashRequest(entry)).digest('hex'); }
    projectIntent(credentialRef) {
        need(/^root_ext_[a-f0-9]{64}$/.test(credentialRef), 'external_reference_refused');
        const summary = 'root-external:' + credentialRef;
        return { title: 'Private Root external receiving', summary, ownerTokenHash: createHmac('sha256', this.o.integrityKey).update(summary).digest('hex'),
            requestHash: hashRequest({ credentialRef }), idempotencyKey: summary };
    }
    async project(credentialRef, create = false) {
        const expected = this.projectIntent(credentialRef);
        let bootstrap = await this.o.correspondence.readProjectCreate(expected.idempotencyKey);
        if (!bootstrap && create) {
            await this.o.correspondence.createProject({ ...expected, ownerTokenPlainForReplay: '' });
            bootstrap = await this.o.correspondence.readProjectCreate(expected.idempotencyKey);
        }
        if (!bootstrap)
            return null;
        const [project, grant] = await Promise.all([this.o.correspondence.getProject(bootstrap.projectId), this.o.correspondence.findActiveGrantByTokenHash(expected.ownerTokenHash)]);
        need(project && project.title === expected.title && project.summary === expected.summary && grant?.role === 'owner' && grant.projectId === project.id && bootstrap.title === expected.title && bootstrap.summary === expected.summary && bootstrap.requestHash === expected.requestHash && bootstrap.ownerTokenHash === expected.ownerTokenHash, 'external_correspondence_integrity');
        return project.id;
    }
    async history(credentialRef) {
        const project = await this.project(credentialRef);
        if (!project)
            return [];
        const page = await this.o.correspondence.listEvents({ projectId: project, afterSequence: 0, limit: 3 });
        need(page.events.length <= 2, 'external_correspondence_integrity');
        return page.events.map((event, i) => {
            const parsed = JSON.parse(event.text ?? '{}');
            const signature = this.signature(parsed.entry);
            need(event.projectId === project && event.sequence === i + 1 && event.kind === 'reply' && /^[a-f0-9]{64}$/.test(parsed.signature) &&
                timingSafeEqual(Buffer.from(parsed.signature, 'hex'), Buffer.from(signature, 'hex')) && parsed.entry.kind === (i === 0 ? 'selection' : 'delivery'), 'external_correspondence_integrity');
            return parsed.entry;
        });
    }
    async append(credentialRef, entry) {
        const project = await this.project(credentialRef, true);
        need(project, 'external_project_required');
        const text = JSON.stringify({ entry, signature: this.signature(entry) });
        need(text.length <= 8000, 'external_correspondence_bounded');
        await this.o.correspondence.createEvent({ projectId: project, kind: 'reply', text, idempotencyKey: 'root-external-' + entry.kind, requestHash: hashRequest(entry) });
    }
    async authenticate(sessionToken, requesterId, taskId) {
        const authenticated = await this.o.accounts.authenticate(sessionToken), task = await this.o.admission.task(taskId);
        need(authenticated.ok && authenticated.value.accountId === requesterId && task.requester_account_id === requesterId && task.public_discussion === false, 'external_actual_requester_required');
        return authenticated.value;
    }
    async loadTerms(selection) {
        const s = parse(packetPin, selection, 'external_selection_mismatch'), task = await this.o.admission.task(s.taskId), round = await this.o.admission.round(task.round_key);
        const document = readCanonicalRoundTerms(round.terms_document, round.terms_version), offer = document.offers[0];
        need(document.receivingPolicy === 'root_mediated_external_report_v1' && document.offers.length === 1 && document.alternatives.length === 0 &&
            offer.evidenceKind === 'workflow_witness' && !offer.publicClaimable && offer.ownerReservedSlots === offer.slotCount && offer.slotCount > 0 && offer.rewardAtomic > 0 &&
            BigInt(document.principalCapAtomic) === BigInt(offer.rewardAtomic) * BigInt(offer.slotCount) && document.maxEvidenceBytes === 12000 && document.maxClarifications === 1 && document.reviewWithinDays > 0 &&
            ((!document.rewardAsset && document.asset === 'USDC' && document.atomicScale === 6) || (document.rewardAsset && document.asset === 'ETH' && document.atomicScale === 18)) && document.chainId === 8453 && document.network === 'base', 'external_explicit_terms_required');
        need(document.rewardAsset ? s.schema === 'neomorphic.root-external-selection.v2' && hashRequest(s.agreement.payoutDestination.rewardAsset) === hashRequest(document.rewardAsset) : s.schema === 'neomorphic.root-external-selection.v1', 'external_destination_asset_mismatch');
        need(round.provenance === 'production' && round.production_admission === true && round.id === s.roundId && task.requester_account_id === s.requesterAccountId && s.taskId === document.roundKey + ':' + offer.offerKey && s.termsVersion === round.terms_version, 'external_source_mismatch');
        need(s.identity === s.agreement.sender && s.channel.threadRef === s.agreement.threadRef && s.agreement.termsVersion === s.termsVersion && s.agreement.termsPacketSha256 === s.termsPacketSha256 && Date.parse(s.agreement.agreedAt) <= Date.parse(s.rootReceipt.receivedAt) && Date.parse(s.rootReceipt.receivedAt) <= this.o.store.now().getTime(), 'external_agreement_mismatch');
        return { selection: s, round, document, offer, task };
    }
    async validateFull(selection) {
        const s = parse(externalSelectionSchema, selection, 'external_recipient_refused');
        const loaded = await this.loadTerms(retainedExternalSelection(s));
        const packet = s.termsPacket, allocation = s.allocationReceipt, offer = loaded.offer, document = loaded.document;
        need(packet.schema === (document.rewardAsset ? 'pilot.funded-terms.v2' : 'pilot.funded-terms.v1') && packet.participantAccess === 'root_mediated_external_no_account' && packet.evidencePolicy === 'cold-first-use-report-v1' && packet.round?.receivingPolicy === document.receivingPolicy && packet.round?.provenance === 'production' && packet.round?.productionAdmission === true &&
            hashRoundTerms(packet.round) === s.termsVersion && digest(JSON.stringify(packet)) === s.termsPacketSha256 && packet.payment?.netAtomic === String(offer.rewardAtomic) && packet.payment?.feesPaidBy === 'requester' && packet.payment?.rewardFor === 'bounded_report_including_evidenced_failure_or_no_fit', 'external_terms_packet_mismatch');
        need(allocation.schema === (document.rewardAsset ? 'pilot.root-allocation-receipt.v2' : 'pilot.root-allocation-receipt.v1') && allocation.status === 'reserved' && allocation.recordRef?.length > 5 && allocation.operationId?.length > 5 &&
            allocation.roundId === document.roundKey && allocation.deadline === document.submissionDeadline && (document.rewardAsset ? allocation.requesterId === s.requesterAccountId && allocation.principalReserveAtomic === String(document.principalCapAtomic) && hashRequest(allocation.rewardAsset) === hashRequest(document.rewardAsset) && packet.payment?.gasPaidBy === 'requester' && hashRequest(packet.payment?.rewardAsset) === hashRequest(document.rewardAsset) : allocation.principalReserveAtomicUsdc === String(document.principalCapAtomic)) && allocation.gasCapWei === document.transferFeeCap.amountAtomic &&
            allocation.termsVersion === s.termsVersion && allocation.termsPacketSha256 === s.termsPacketSha256 && allocation.asset === document.asset && allocation.chainId === 8453 && Date.parse(allocation.reservedAt) <= this.o.store.now().getTime() && digest(JSON.stringify(allocation)) === s.allocationReceiptSha256, 'external_allocation_mismatch');
        return loaded;
    }
    async assignment(sessionToken, raw, key) {
        const s = parse(externalSelectionSchema, raw, 'external_recipient_refused'), actor = await this.authenticate(sessionToken, s.requesterAccountId, s.taskId);
        const validated = await this.validateFull(s), credentialRef = externalCredentialRef(s), retained = retainedExternalSelection(s);
        return this.o.lock.run('root-external:' + credentialRef, async () => {
            const entries = await this.history(credentialRef), old = entries[0];
            if (old) {
                need(old.kind === 'selection' && hashRequest(old.selection) === hashRequest(retained) && old.key === key, 'external_selection_immutable');
            }
            else {
                need(validated.round.status === 'open' && Date.parse(validated.document.submissionDeadline) > this.o.store.now().getTime(), 'external_deadline');
                await this.append(credentialRef, { kind: 'selection', selection: retained, actor: { accountId: actor.accountId, sessionId: actor.sessionId, authTime: actor.authTime }, key });
            }
            const nativeBody = { provenance: 'production', offerKey: validated.offer.offerKey, publicLabel: s.publicLabel, credentialRef, importKey: key, deferStart: false,
                scope: { title: 'Private externally received first-use report', instructions: 'Return the agreed sanitized report through the scoped Root correspondence channel. No journey account is required.' } };
            // The issued principal stays inside the opportunity authority. It is not returned to the contributor or the grant file.
            const token = issueToken('ew_ctr');
            const receipt = await this.o.opportunity.importClaim(validated.document.roundKey, nativeBody, key, token, hashToken(token), 'owner_assigned');
            need(receipt.statusCode < 400, 'external_assignment_refused');
            const assigned = await this.readAssignment(credentialRef, key);
            need(assigned, 'external_assignment_refused');
            return assigned;
        });
    }
    async readAssignment(credentialRef, key) {
        const entries = await this.history(credentialRef), selected = entries[0];
        if (!selected || selected.kind !== 'selection' || selected.key !== key)
            return null;
        const { selection: s, offer } = await this.loadTerms(selected.selection);
        const row = await this.o.store.withOpportunityClient(async (client) => {
            const row = (await client.query(`SELECT c.*,p.public_id,p.provenance,p.task_scope,p.revoked_at,co.offer_key,co.round_id AS offer_round_id,i.response_json,i.request_hash,i.status_code,i.principal_id
        FROM opportunity_claims c JOIN earned_work_contributor_tokens p ON p.id=c.contributor_token_id
        JOIN opportunity_offers co ON co.id=c.offer_id
        JOIN earned_work_idempotency i ON i.task_id=c.round_id AND i.scope='opportunity_assign' AND i.key=c.import_key
        WHERE c.round_id=$1 AND c.credential_ref=$2 AND c.import_key=$3`, [s.roundId, credentialRef, key])).rows[0];
            if (!row)
                return null;
            const response = typeof row.response_json === 'string' ? JSON.parse(row.response_json) : row.response_json;
            const nativeBody = { provenance: 'production', offerKey: offer.offerKey, publicLabel: s.publicLabel, credentialRef, importKey: key, deferStart: false, scope: { title: 'Private externally received first-use report', instructions: 'Return the agreed sanitized report through the scoped Root correspondence channel. No journey account is required.' } };
            need(row.public_label === s.publicLabel && row.offer_key === offer.offerKey && row.offer_round_id === s.roundId && String(row.reward_atomic) === String(offer.rewardAtomic) && row.defer_start === false && hashRequest(row.assigned_scope) === hashRequest(nativeBody.scope), 'external_assignment_integrity');
            need(row.request_hash === hashRequest(nativeBody) && row.principal_id === 'owner' && row.status_code >= 200 && row.status_code < 300, 'external_assignment_integrity');
            need(row.kind === 'owner_assigned' && row.terms_version === s.termsVersion && row.provenance === 'production' && row.task_scope === 'opportunity:' + s.roundId && !row.revoked_at && response.claim?.id === row.id && response.claim.termsVersion === s.termsVersion && String(response.claim.rewardAtomic) === String(offer.rewardAtomic) && response.credentialGrant === 'production' && /^ew_ctr_[A-Za-z0-9_-]{43}$/.test(response.token), 'external_assignment_integrity');
            return { ...row, response };
        }, 'read');
        if (!row)
            return null;
        const principal = await this.o.store.findContributorByTokenHash(hashToken(row.response.token));
        need(principal && principal.id === row.contributor_token_id, 'external_principal_integrity');
        return { credentialRef, claimId: row.id, principal, selection: s, assignmentKey: key };
    }
    async loadClaim(claim) {
        if (typeof claim.credential_ref !== 'string' || !claim.credential_ref.startsWith('root_ext_'))
            return null;
        const entries = await this.history(claim.credential_ref), selected = entries[0];
        need(selected?.kind === 'selection', 'external_selection_missing');
        const assignment = await this.readAssignment(claim.credential_ref, selected.key);
        need(assignment && assignment.claimId === claim.id && assignment.principal.id === claim.contributor_token_id && assignment.selection.roundId === claim.round_id && assignment.selection.termsVersion === claim.terms_version && claim.kind === 'owner_assigned', 'external_claim_mismatch');
        const frozen = entries[1];
        if (!frozen)
            return { assignment, frozen: null };
        need(frozen.kind === 'delivery', 'external_artifact_integrity');
        const { document, offer } = await this.loadTerms(assignment.selection);
        this.checkDelivery(assignment, frozen.delivery);
        const encoded = externalEvidence(frozen.delivery.report, offer.maxEffortSeconds);
        this.checkReceipt(assignment, frozen.delivery, encoded);
        need(encoded.bytes <= document.maxEvidenceBytes && encoded.digestSha256 === frozen.artifact.digestSha256 && encoded.bytes === frozen.artifact.bytes && encoded.mediaType === frozen.artifact.mediaType && frozen.artifact.ref === 'root-external-artifact:' + frozen.artifactId, 'external_artifact_integrity');
        return { assignment, frozen: { ...frozen, content: encoded.content } };
    }
    checkDelivery(assignment, raw) {
        const d = parse(externalDeliverySchema, raw, 'external_delivery_mismatch'), s = assignment.selection;
        need(d.credentialRef === assignment.credentialRef && d.claimId === assignment.claimId && d.termsVersion === s.termsVersion && d.sender === s.identity && hashRequest(d.channel) === hashRequest(s.channel) && d.agreementMessageRef === s.agreement.messageRef && d.originalOperationRef === s.agreement.originalOperationRef &&
            hashRequest(d.report) === d.reportSha256 && Date.parse(d.rootReceipt.receivedAt) >= Date.parse(s.agreement.agreedAt) && Date.parse(d.rootReceipt.receivedAt) <= this.o.store.now().getTime(), 'external_delivery_mismatch');
        return d;
    }
    unsignedDelivery(d) { const { receiptAttestation, ...delivery } = d; return delivery; }
    receiptSignature(value) { return createHmac('sha256', this.o.integrityKey).update('root-external-receipt-v1:' + hashRequest(value)).digest('hex'); }
    receiptBinding(a, encoded) {
        return { roundId: a.selection.roundId, claimId: a.claimId, termsVersion: a.selection.termsVersion, credentialRef: a.credentialRef, principalId: a.principal.id, artifactDigestSha256: encoded.digestSha256, artifactBytes: encoded.bytes };
    }
    /** A private, explicit assertion by the configured Root receiving authority.
     * Root must independently retain actual channel arrival evidence. Neither a
     * requester session nor a supplied header/timestamp can issue this MAC. No
     * claim, correspondence, submission or financial state is changed here. */
    async attestReceipt(receiverToken, sessionToken, credentialRef, assignmentKey, raw) {
        need(hashToken(receiverToken) === this.o.receiptAuthorityHash, 'external_receipt_authority_required');
        const a = await this.readAssignment(credentialRef, assignmentKey);
        need(a, 'external_assignment_missing');
        await this.authenticate(sessionToken, a.selection.requesterAccountId, a.selection.taskId);
        const d = this.checkDelivery(a, raw), { document, offer, round } = await this.loadTerms(a.selection), encoded = externalEvidence(d.report, offer.maxEffortSeconds);
        need(!d.receiptAttestation, 'external_receipt_already_attested');
        const claim = await this.o.store.withOpportunityClient(async (c) => (await c.query('SELECT created_at,expires_at,status FROM opportunity_claims WHERE id=$1', [a.claimId])).rows[0], 'read');
        const receivedAt = Date.parse(d.rootReceipt.receivedAt), now = this.o.store.now().getTime();
        need(claim && receivedAt >= new Date(claim.created_at).getTime() && receivedAt >= Date.parse(a.selection.rootReceipt.receivedAt) && receivedAt < new Date(claim.expires_at).getTime() && receivedAt < Date.parse(document.submissionDeadline), 'external_receipt_time_refused');
        need(round.status === 'open' && ['reserved', 'expired'].includes(claim.status) && now < receivedAt + document.reviewWithinDays * 86400000, 'external_review_window_closed');
        need(encoded.bytes <= document.maxEvidenceBytes, 'external_report_bounded');
        const receipt = { schema: 'neomorphic.root-external-receipt.v1', binding: this.receiptBinding(a, encoded), selectionSha256: hashRequest(a.selection), assignmentKeySha256: hashRequest(assignmentKey), deliverySha256: hashRequest(this.unsignedDelivery(d)), receivedAt: d.rootReceipt.receivedAt, attestedAt: this.o.store.now().toISOString() };
        return { ...d, receiptAttestation: { ...receipt, signature: this.receiptSignature(receipt) } };
    }
    /** Kernel verifier: a JSON timestamp/options object never establishes receipt. */
    verifyReceipt(raw, binding) {
        const parsed = receiptAttestationSchema.safeParse(raw);
        if (!parsed.success)
            return null;
        const { signature, ...receipt } = parsed.data, expected = this.receiptSignature(receipt);
        if (hashRequest(receipt.binding) !== hashRequest(binding) || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')))
            return null;
        if (Date.parse(receipt.attestedAt) < Date.parse(receipt.receivedAt) || Date.parse(receipt.attestedAt) > this.o.store.now().getTime())
            return null;
        return { receivedAt: receipt.receivedAt, attestedAt: receipt.attestedAt };
    }
    checkReceipt(a, d, encoded) {
        const proof = d.receiptAttestation;
        if (!proof)
            return null;
        const verified = this.verifyReceipt(proof, this.receiptBinding(a, encoded));
        need(verified && proof.selectionSha256 === hashRequest(a.selection) && proof.assignmentKeySha256 === hashRequest(a.assignmentKey) && proof.deliverySha256 === hashRequest(this.unsignedDelivery(d)) && proof.receivedAt === d.rootReceipt.receivedAt, 'external_receipt_attestation_refused');
        return proof;
    }
    async receive(sessionToken, credentialRef, assignmentKey, raw, key) {
        const assignment = await this.readAssignment(credentialRef, assignmentKey);
        need(assignment, 'external_assignment_missing');
        await this.authenticate(sessionToken, assignment.selection.requesterAccountId, assignment.selection.taskId);
        const d = this.checkDelivery(assignment, raw), { document, offer, round } = await this.loadTerms(assignment.selection), encoded = externalEvidence(d.report, offer.maxEffortSeconds);
        need(encoded.bytes <= document.maxEvidenceBytes, 'external_report_bounded');
        const attestation = this.checkReceipt(assignment, d, encoded);
        return this.o.lock.run('root-external:' + credentialRef, async () => {
            const entries = await this.history(credentialRef), old = entries[1];
            const artifactId = 'external_' + hashRequest({ credentialRef, claimId: assignment.claimId, key }).slice(0, 32);
            const entry = { kind: 'delivery', delivery: d, artifactId, artifact: { ref: 'root-external-artifact:' + artifactId, digestSha256: encoded.digestSha256, mediaType: encoded.mediaType, bytes: encoded.bytes }, key };
            if (old)
                need(hashRequest(old) === hashRequest(entry), 'external_delivery_immutable');
            else {
                const now = this.o.store.now().getTime();
                need(round.status === 'open' && (attestation ? now < Date.parse(attestation.receivedAt) + document.reviewWithinDays * 86400000 : Date.parse(document.submissionDeadline) > now), 'external_deadline');
                await this.append(credentialRef, entry);
            }
            const receipt = await this.o.opportunity.submit(document.roundKey, assignment.claimId, { provenance: 'production', artifact: entry.artifact, evidence: JSON.parse(encoded.content) }, assignment.principal, key, attestation ? { preExpiryCorrespondence: { receivedAt: attestation.receivedAt, mediatedReceipt: attestation } } : undefined);
            need(receipt.statusCode < 400, 'external_submission_refused');
            return { claimId: assignment.claimId, artifactId, artifact: entry.artifact, reportSha256: d.reportSha256 };
        });
    }
}
//# sourceMappingURL=external-receiving.js.map