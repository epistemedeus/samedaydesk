import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { hashRequest, hashToken, newId } from '../../earned-work/src/crypto.js';
import { submitBodySchema } from '../../earned-work/src/opportunity/validate.js';
import { canonicalOrigin, validateCanonical } from './client.js';
import { CONSENT_VERSION, ContinuationError } from './types.js';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/);
const linkInput = z.object({ claimId: id, consent: z.literal(true), consentVersion: z.literal(CONSENT_VERSION) }).strict();
export class OriginalContinuationService {
    options;
    origin;
    constructor(options) {
        this.options = options;
        this.origin = canonicalOrigin(options.origin);
        canonicalOrigin(options.source.origin);
        if (!/^[a-f0-9]{64}$/.test(options.integrityKey))
            throw new ContinuationError('invalid_input', 400);
    }
    async migrate() {
        const sql = await readFile(new URL('./migrations/001_links.sql', import.meta.url), 'utf8');
        await this.options.database.withOpportunityClient(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':original-continuation-migration',0))");
            await client.query(sql);
        }, 'idempotent');
    }
    async authenticate(sessionToken) {
        const actor = await this.options.accounts.authenticate(sessionToken);
        if (!actor.ok)
            throw new ContinuationError('unauthorized', 401);
        return actor.value;
    }
    digest(value) { return createHmac('sha256', this.options.integrityKey).update('original-continuation/v1\0' + value).digest('hex'); }
    holder(credential) {
        if (!credential || !/^[A-Za-z0-9_-]{24,512}$/.test(credential))
            throw new ContinuationError('unauthorized', 401);
        return credential;
    }
    /** Lock current session and auth generation so recovery/logout cannot race an authorized send. */
    async guard(client, actor, sessionToken) {
        const row = (await client.query(`SELECT s.expires_at FROM journey_account_sessions s JOIN journey_accounts a ON a.id=s.account_id
      WHERE s.id=$1 AND s.account_id=$2 AND s.token_hash=$3 AND s.auth_version=a.auth_version AND s.revoked_at IS NULL
      FOR SHARE OF s,a`, [actor.sessionId, actor.accountId, hashToken(sessionToken ?? '')])).rows[0];
        if (!row || row.expires_at <= this.options.database.now())
            throw new ContinuationError('unauthorized', 401);
    }
    async link(client, actor, linkId, credential) {
        id.parse(linkId);
        const row = (await client.query('SELECT * FROM journey_original_continuation_links WHERE id=$1 AND account_id=$2 FOR UPDATE', [linkId, actor.accountId])).rows[0];
        if (!row)
            throw new ContinuationError('not_found', 404);
        if (row.revoked_at)
            throw new ContinuationError('revoked', 409);
        const source = this.options.source;
        if (row.desk_origin !== this.origin || row.canonical_origin !== source.origin || row.round_key !== source.roundKey || row.provenance !== source.provenance ||
            row.consent_version !== CONSENT_VERSION)
            throw new ContinuationError('conflict', 409);
        if (credential !== undefined && row.holder_digest !== this.digest(credential))
            throw new ContinuationError('forbidden', 403);
        return row;
    }
    async canonical(link, credential, operationKey) {
        const result = validateCanonical(await this.options.source.read(link.claim_id, credential, operationKey), this.options.source, link.claim_id, operationKey);
        if (result.claim.termsVersion !== link.terms_version)
            throw new ContinuationError('conflict', 409);
        return result;
    }
    receipt(link) { return { linkId: link.id, roundKey: link.round_key, claimId: link.claim_id, termsVersion: link.terms_version, consentVersion: link.consent_version }; }
    async createLink(sessionToken, credential, input, operationKey) {
        const actor = await this.authenticate(sessionToken), holder = this.holder(credential), body = linkInput.parse(input), linkKey = key.parse(operationKey), source = this.options.source;
        // Consent does not turn guesses, email, aliases or account possession into holder authority.
        const canonical = validateCanonical(await source.read(body.claimId, holder), source, body.claimId);
        const holderDigest = this.digest(holder), requestHash = hashRequest({ account: actor.accountId, deskOrigin: this.origin, canonicalOrigin: source.origin,
            roundKey: source.roundKey, provenance: source.provenance, claimId: body.claimId, termsVersion: canonical.claim.termsVersion, holderDigest, consentVersion: CONSENT_VERSION });
        return this.options.database.withOpportunityClient(async (client) => {
            await this.guard(client, actor, sessionToken);
            // Fence concurrent linking even when the target row does not yet exist.
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['original-link-key:' + linkKey]);
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [hashRequest({ origin: source.origin, round: source.roundKey, provenance: source.provenance, claim: body.claimId })]);
            const prior = (await client.query(`SELECT * FROM journey_original_continuation_links WHERE link_key=$1 OR
        (canonical_origin=$2 AND round_key=$3 AND provenance=$4 AND claim_id=$5) FOR UPDATE`, [linkKey, source.origin, source.roundKey, source.provenance, body.claimId])).rows[0];
            if (prior) {
                if (prior.account_id !== actor.accountId || prior.link_key !== linkKey || prior.request_hash !== requestHash)
                    throw new ContinuationError('conflict', 409);
                await this.link(client, actor, prior.id, holder);
                return { ...this.receipt(prior), replayed: true };
            }
            const result = await client.query(`INSERT INTO journey_original_continuation_links
        (id,account_id,desk_origin,canonical_origin,round_key,provenance,claim_id,terms_version,holder_digest,consent_version,link_key,request_hash,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [newId('ocl'), actor.accountId, this.origin, source.origin, source.roundKey, source.provenance,
                body.claimId, canonical.claim.termsVersion, holderDigest, CONSENT_VERSION, linkKey, requestHash, this.options.database.now()]);
            return { ...this.receipt(result.rows[0]), replayed: false };
        }, 'idempotent');
    }
    async read(sessionToken, credential, linkId) {
        const actor = await this.authenticate(sessionToken), holder = this.holder(credential);
        return this.options.database.withOpportunityClient(async (client) => {
            await this.guard(client, actor, sessionToken);
            const link = await this.link(client, actor, linkId, holder);
            return { ...this.receipt(link), canonical: await this.canonical(link, holder) };
        }, 'none');
    }
    async revoke(sessionToken, linkId) {
        const actor = await this.authenticate(sessionToken);
        id.parse(linkId);
        return this.options.database.withOpportunityClient(async (client) => {
            await this.guard(client, actor, sessionToken);
            const row = (await client.query('SELECT id FROM journey_original_continuation_links WHERE id=$1 AND account_id=$2 FOR UPDATE', [linkId, actor.accountId])).rows[0];
            if (!row)
                throw new ContinuationError('not_found', 404);
            await client.query('UPDATE journey_original_continuation_links SET revoked_at=COALESCE(revoked_at,$2) WHERE id=$1', [linkId, this.options.database.now()]);
            return { revoked: true };
        }, 'idempotent');
    }
    async reconcile(client, link, holder, operation) {
        const canonical = await this.canonical(link, holder, operation.canonical_key), receipt = canonical.operation;
        let state = operation.state, submissionId = operation.submission_id;
        if (receipt) {
            if (receipt.requestHash !== operation.request_hash)
                throw new ContinuationError('conflict', 409);
            if (receipt.statusCode >= 200 && receipt.statusCode < 300) {
                if (!canonical.submission)
                    throw new ContinuationError('unavailable', 503);
                state = 'confirmed';
                submissionId = canonical.submission.id;
            }
            else if (receipt.statusCode >= 400 && receipt.statusCode < 500) {
                state = 'refused';
                submissionId = null;
            }
            if (operation.state !== 'unknown' && operation.state !== state)
                throw new ContinuationError('conflict', 409);
        }
        // Missing canonical receipt is not proof of failure, and never permission to resubmit.
        if (operation.state === 'confirmed' && (!receipt || submissionId !== operation.submission_id))
            throw new ContinuationError('unavailable', 503);
        await client.query('UPDATE journey_original_continuation_operations SET state=$3,submission_id=$4,updated_at=$5 WHERE link_id=$1 AND operation_key=$2', [link.id, operation.operation_key, state, submissionId, this.options.database.now()]);
        return { operationKey: operation.operation_key, state, canonical };
    }
    async readOperation(sessionToken, credential, linkId, operationKey) {
        const actor = await this.authenticate(sessionToken), holder = this.holder(credential);
        key.parse(operationKey);
        return this.options.database.withOpportunityClient(async (client) => {
            await this.guard(client, actor, sessionToken);
            const link = await this.link(client, actor, linkId, holder);
            const operation = (await client.query('SELECT * FROM journey_original_continuation_operations WHERE link_id=$1 AND operation_key=$2 FOR UPDATE', [link.id, operationKey])).rows[0];
            if (!operation)
                throw new ContinuationError('not_found', 404);
            return this.reconcile(client, link, holder, operation);
        }, 'none');
    }
    async submit(sessionToken, credential, linkId, input, operationKey) {
        const actor = await this.authenticate(sessionToken), holder = this.holder(credential), body = submitBodySchema.parse(input);
        key.parse(operationKey);
        if (body.provenance !== this.options.source.provenance)
            throw new ContinuationError('conflict', 409);
        const reservation = await this.options.database.withOpportunityClient(async (client) => {
            await this.guard(client, actor, sessionToken);
            const link = await this.link(client, actor, linkId, holder);
            const requestHash = hashRequest({ claimId: link.claim_id, ...body });
            const prior = (await client.query('SELECT * FROM journey_original_continuation_operations WHERE link_id=$1 AND operation_key=$2 FOR UPDATE', [link.id, operationKey])).rows[0];
            if (prior) {
                if (prior.request_hash !== requestHash)
                    throw new ContinuationError('conflict', 409);
                return { send: false, link, operation: prior };
            }
            const canonical = await this.canonical(link, holder);
            if (canonical.submission)
                throw new ContinuationError('conflict', 409); // Read the existing canonical delivery, never copy/resubmit it.
            if ((await client.query("SELECT 1 FROM journey_original_continuation_operations WHERE link_id=$1 AND state='unknown'", [link.id])).rows.length)
                throw new ContinuationError('conflict', 409);
            const canonicalKey = 'oc-v1-' + this.digest(link.id + '\0' + operationKey);
            const result = await client.query(`INSERT INTO journey_original_continuation_operations(link_id,operation_key,canonical_key,request_hash,state,created_at,updated_at)
        VALUES($1,$2,$3,$4,'unknown',$5,$5) RETURNING *`, [link.id, operationKey, canonicalKey, requestHash, this.options.database.now()]);
            return { send: true, link, operation: result.rows[0] };
        }, 'none');
        if (!reservation.send)
            return this.readOperation(sessionToken, holder, linkId, operationKey);
        // The unknown fence is durable BEFORE touching the original submit. Hold the link/session
        // locks through dispatch; revocation linearizes before or after that authorized operation.
        try {
            return await this.options.database.withOpportunityClient(async (client) => {
                await this.guard(client, actor, sessionToken);
                const link = await this.link(client, actor, linkId, holder);
                await this.canonical(link, holder); // Fresh original holder/claim/terms authority immediately before dispatch.
                const ack = await this.options.source.submit(link.claim_id, holder, body, reservation.operation.canonical_key);
                if (ack.status >= 500)
                    return { operationKey, state: 'unknown' };
                if (ack.status >= 400 && ack.status < 500) {
                    // A producer's fenced retry may refuse after an uncertain earlier commit.
                    // The canonical receipt wins over that acknowledgement; failed readback
                    // leaves the durable fence unknown, including revoked holder authority.
                    const readback = await this.reconcile(client, link, holder, reservation.operation);
                    if (readback.state !== 'unknown')
                        return readback;
                    await client.query("UPDATE journey_original_continuation_operations SET state='refused',updated_at=$3 WHERE link_id=$1 AND operation_key=$2", [link.id, operationKey, this.options.database.now()]);
                    return { operationKey, state: 'refused' };
                }
                if (ack.status < 200 || ack.status >= 300)
                    return { operationKey, state: 'unknown' };
                return await this.reconcile(client, link, holder, reservation.operation);
            }, 'none');
        }
        catch (error) {
            if (error instanceof ContinuationError && ['unauthorized', 'forbidden', 'revoked', 'not_found', 'conflict'].includes(error.code))
                throw error;
            return { operationKey, state: 'unknown' };
        }
    }
}
//# sourceMappingURL=service.js.map