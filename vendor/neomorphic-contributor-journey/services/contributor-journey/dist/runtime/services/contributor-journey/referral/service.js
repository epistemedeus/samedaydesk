import { randomBytes } from 'node:crypto';
import { DIGEST, EVENT_REF, SHARE_REF, eventRecord, exact, fields, hash, id, instant, publishedSource, safeProjection, selection, shareRecord, sourceBinding } from './validation.js';
class Refusal extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
function refuse(code) { throw new Refusal(code); }
const capture = (v) => { try {
    return structuredClone(v);
}
catch {
    return null;
} };
const paths = { browse_tasks: '/contribute/tasks/', signup: '/contribute/account/', discussion: '/contribute/discussions/' };
export function createReferralService(ports, config) {
    const origin = new URL(config.publicOrigin);
    const sharePath = config.sharePath ?? '/contribute/share/';
    if (!/^\/[a-z0-9/-]+\/$/.test(sharePath) || sharePath.includes('//'))
        throw new Error('invalid share receiving path');
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
        !(origin.protocol === 'https:' || origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
        throw new Error('publicOrigin must be an HTTPS origin or loopback staging origin');
    }
    const clock = config.clock ?? (() => new Date().toISOString());
    function now() { const value = clock(); if (!instant(value))
        refuse('storage_unavailable'); return value; }
    async function run(fn) {
        if (config.enabled !== true)
            return { ok: false, code: 'disabled' };
        try {
            return { ok: true, value: await fn() };
        }
        catch (error) {
            return { ok: false, code: error instanceof Refusal ? error.code : 'storage_unavailable' };
        }
    }
    async function account(context) {
        const a = await ports.resolveAccount(context);
        if (!a || !id(a.accountId) || !id(a.sessionId) || !instant(a.authTime) || !instant(a.expiresAt) ||
            Date.parse(a.authTime) > Date.parse(now()) || Date.parse(a.expiresAt) <= Date.parse(now()))
            refuse('unauthenticated');
        return structuredClone(a);
    }
    async function visitor(context) {
        const v = await ports.resolveVisitor(context);
        if (!v || !exact(v, ['visitorRef', 'accountId', 'requestRef']) || !id(v.visitorRef) || !id(v.requestRef) ||
            !(v.accountId === null || id(v.accountId)))
            refuse('observation_required');
        return structuredClone(v);
    }
    async function source(s) {
        const result = await ports.readPublishedSource(structuredClone(s));
        if (result?.state === 'withdrawn')
            refuse('revoked');
        if (result?.state !== 'published' || !publishedSource(result.source))
            refuse('source_unavailable');
        const value = structuredClone(result.source);
        if (value.kind !== s.kind || value.sourceId !== s.id)
            refuse('source_changed');
        if (Date.parse(value.publicationExpiresAt) <= Date.parse(now()))
            refuse('expired');
        return value;
    }
    function checkProjection(s, selected) {
        if (Date.parse(selected.expiresAt) > Date.parse(s.publicationExpiresAt))
            refuse('would_widen');
        if (selected.fields.includes('evidence') && s.evidence === null)
            refuse('invalid_input');
        if (!safeProjection(s, selected.fields))
            refuse('private_projection');
    }
    function makePreview(s, selected) {
        checkProjection(s, selected);
        const body = { title: s.title, summary: selected.fields.includes('summary') ? s.summary : null,
            evidence: selected.fields.includes('evidence') ? s.evidence : null, fields: [...selected.fields].sort(),
            nextAction: selected.nextAction, expiresAt: selected.expiresAt };
        return { ...body, previewDigest: hash([sourceBinding(s), body]) };
    }
    async function load(ref) {
        const r = await ports.repository.readShare(ref);
        if (r === null)
            refuse('not_found');
        if (!shareRecord(r) || r.shareRef !== ref)
            refuse('storage_unavailable');
        return structuredClone(r);
    }
    async function publicView(r) {
        if (r.state === 'withdrawn')
            refuse('revoked');
        if (Date.parse(r.expiresAt) <= Date.parse(now()))
            refuse('expired');
        const s = await source(r.source);
        if (s.ownerAccountId !== r.ownerAccountId || s.version !== r.sourceVersion || sourceBinding(s) !== r.sourceBindingDigest)
            refuse('source_changed');
        const p = makePreview(s, r);
        // Re-read the owning row after the source read: a concurrent withdrawal or
        // narrowing must not return the earlier broader projection.
        const current = await load(r.shareRef);
        if (current.state === 'withdrawn')
            refuse('revoked');
        if (hash(current) !== hash(r))
            refuse('conflict');
        const latest = await source(r.source);
        if (sourceBinding(latest) !== sourceBinding(s))
            refuse('source_changed');
        if (r.acceptedWorkRef !== undefined && latest.workRef !== r.acceptedWorkRef)
            refuse('source_changed');
        if (Date.parse(r.expiresAt) <= Date.parse(now()))
            refuse('expired');
        return { shareRef: r.shareRef, revision: r.revision, title: p.title, summary: p.summary,
            evidence: p.evidence, expiresAt: p.expiresAt, nextAction: p.nextAction,
            nextPath: paths[p.nextAction], url: new URL(`${sharePath}?ref=${r.shareRef}`, origin).href };
    }
    async function ownView(r) {
        let projection = null;
        if (r.state === 'active') {
            try {
                projection = await publicView(r);
            }
            catch (error) {
                if (!(error instanceof Refusal) || !['revoked', 'expired', 'source_changed', 'source_unavailable', 'private_projection'].includes(error.code))
                    throw error;
            }
        }
        return { shareRef: r.shareRef, revision: r.revision, state: r.state,
            fields: [...r.fields], expiresAt: r.expiresAt, nextAction: r.nextAction, public: projection };
    }
    function validOperation(op, owner, key) {
        return exact(op, ['accountId', 'operationKey', 'bodyDigest', 'shareRef', 'revision']) &&
            op.accountId === owner && op.operationKey === key && typeof op.bodyDigest === 'string' && DIGEST.test(op.bodyDigest) &&
            typeof op.shareRef === 'string' && SHARE_REF.test(op.shareRef) && Number.isSafeInteger(op.revision) && Number(op.revision) >= 1;
    }
    async function operation(owner, key, digest) {
        const op = await ports.repository.readOperation(owner, key);
        if (op === null)
            return null;
        if (!validOperation(op, owner, key))
            refuse('storage_unavailable');
        if (op.bodyDigest !== digest)
            refuse('idempotency_conflict');
        const r = await load(op.shareRef);
        if (r.ownerAccountId !== owner || r.revision < op.revision)
            refuse('storage_unavailable');
        return ownView(r);
    }
    async function commit(r, expectedRevision, key, digest) {
        let disposition = 'unknown';
        try {
            disposition = await ports.repository.commitShare({ expectedRevision, record: r,
                operation: { accountId: r.ownerAccountId, operationKey: key, bodyDigest: digest, shareRef: r.shareRef, revision: r.revision } });
        }
        catch { /* A lost response does not justify issuing another link. Read back. */ }
        try {
            const recovered = await operation(r.ownerAccountId, key, digest);
            if (recovered !== null)
                return recovered;
        }
        catch (error) {
            if (error instanceof Refusal && error.code === 'idempotency_conflict')
                throw error;
            return refuse('write_unknown');
        }
        if (disposition === 'idempotency_conflict')
            refuse('idempotency_conflict');
        if (disposition === 'conflict')
            refuse('conflict');
        return refuse('write_unknown');
    }
    async function classification(v, referrerAccountId) {
        const c = await ports.classify({ visitorRef: v.visitorRef, accountId: v.accountId, referrerAccountId });
        if (!c || !exact(c, ['cohort', 'relation']) || !['owner_qa', 'sponsored', 'independent', 'unknown'].includes(c.cohort) ||
            !['self', 'distinct', 'unknown'].includes(c.relation))
            refuse('evidence_required');
        // Server identity equality always wins over an erroneous classifier.
        return { cohort: c.cohort, relation: v.accountId !== null && v.accountId === referrerAccountId ? 'self' : c.relation };
    }
    async function appendEvent(body) {
        const event = { ...body, bodyDigest: hash(body) };
        const prior = await ports.events.read(event.eventId);
        if (prior !== null) {
            if (!eventRecord(prior) || prior.eventId !== event.eventId)
                refuse('storage_unavailable');
            if (prior.bodyDigest !== event.bodyDigest)
                refuse('idempotency_conflict');
            return structuredClone(prior);
        }
        let disposition = 'unknown';
        try {
            disposition = await ports.events.append(event);
        }
        catch { /* unknown until readback */ }
        try {
            const read = await ports.events.read(event.eventId);
            if (read !== null) {
                if (!eventRecord(read) || read.eventId !== event.eventId)
                    refuse('write_unknown');
                if (read.bodyDigest !== event.bodyDigest)
                    refuse('idempotency_conflict');
                return structuredClone(read);
            }
        }
        catch (error) {
            if (error instanceof Refusal && error.code === 'idempotency_conflict')
                throw error;
            return refuse('write_unknown');
        }
        if (disposition === 'capacity')
            refuse('capacity');
        if (disposition === 'conflict')
            refuse('idempotency_conflict');
        return refuse('write_unknown');
    }
    // Timestamp is assigned once. Replay must not replace it with a new clock.
    async function priorEvent(eventId) {
        const prior = await ports.events.read(eventId);
        if (prior !== null && (!eventRecord(prior) || prior.eventId !== eventId))
            refuse('storage_unavailable');
        return structuredClone(prior);
    }
    return {
        preview(context, command) {
            const input = capture(command);
            return run(async () => {
                if (!selection(input, now()))
                    refuse('invalid_input');
                const a = await account(context), s = await source(input.source);
                if (s.ownerAccountId !== a.accountId)
                    refuse('forbidden');
                return makePreview(s, input);
            });
        },
        create(context, command) {
            const input = capture(command);
            return run(async () => {
                if (!exact(input, ['selection', 'consent', 'operationKey']) || !id(input.operationKey) ||
                    !exact(input.consent, ['accepted', 'previewDigest']) || typeof input.consent.previewDigest !== 'string' ||
                    !DIGEST.test(input.consent.previewDigest))
                    refuse('invalid_input');
                if (input.consent.accepted !== true)
                    refuse('consent_required');
                const a = await account(context);
                const digest = hash(['create', input.selection, input.consent]);
                const replay = await operation(a.accountId, input.operationKey, digest);
                if (replay !== null)
                    return replay;
                if (!selection(input.selection, now()))
                    refuse('invalid_input');
                const s = await source(input.selection.source);
                if (s.ownerAccountId !== a.accountId)
                    refuse('forbidden');
                if (makePreview(s, input.selection).previewDigest !== input.consent.previewDigest)
                    refuse('preview_changed');
                const at = now();
                const r = { ...input.selection, fields: [...input.selection.fields].sort(),
                    shareRef: `rf${randomBytes(24).toString('hex')}`, ownerAccountId: a.accountId,
                    sourceVersion: s.version, sourceBindingDigest: sourceBinding(s), revision: 1,
                    state: 'active', createdAt: at, updatedAt: at, acceptedWorkRef: s.workRef };
                return commit(r, null, input.operationKey, digest);
            });
        },
        readOwn(context, shareRef) {
            return run(async () => {
                if (typeof shareRef !== 'string' || !SHARE_REF.test(shareRef))
                    refuse('invalid_input');
                const a = await account(context), r = await load(shareRef);
                if (r.ownerAccountId !== a.accountId)
                    refuse('forbidden');
                return ownView(r);
            });
        },
        readOperation(context, command) {
            const input = capture(command);
            return run(async () => {
                if (!exact(input, ['operationKey']) || !id(input.operationKey))
                    refuse('invalid_input');
                const a = await account(context);
                const op = await ports.repository.readOperation(a.accountId, input.operationKey);
                if (op === null)
                    refuse('not_found');
                if (!validOperation(op, a.accountId, input.operationKey))
                    refuse('storage_unavailable');
                const r = await load(op.shareRef);
                if (r.ownerAccountId !== a.accountId || r.revision < op.revision)
                    refuse('storage_unavailable');
                return ownView(r);
            });
        },
        readPublic(shareRef) {
            return run(async () => {
                if (typeof shareRef !== 'string' || !SHARE_REF.test(shareRef))
                    refuse('invalid_input');
                return publicView(await load(shareRef));
            });
        },
        narrow(context, command) {
            const input = capture(command);
            return run(async () => {
                if (!exact(input, ['shareRef', 'expectedRevision', 'fields', 'expiresAt', 'operationKey']) ||
                    typeof input.shareRef !== 'string' || !SHARE_REF.test(input.shareRef) || !id(input.operationKey) ||
                    !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1 || !fields(input.fields) || !instant(input.expiresAt))
                    refuse('invalid_input');
                const a = await account(context), digest = hash(['narrow', input]);
                const replay = await operation(a.accountId, input.operationKey, digest);
                if (replay !== null)
                    return replay;
                const r = await load(input.shareRef);
                if (r.ownerAccountId !== a.accountId)
                    refuse('forbidden');
                if (r.state === 'withdrawn')
                    refuse('revoked');
                if (r.revision !== input.expectedRevision)
                    refuse('conflict');
                if (!input.fields.every(f => r.fields.includes(f)) || Date.parse(input.expiresAt) > Date.parse(r.expiresAt) ||
                    input.fields.length === r.fields.length && input.expiresAt === r.expiresAt)
                    refuse('would_widen');
                if (Date.parse(input.expiresAt) <= Date.parse(now()))
                    refuse('expired');
                await publicView(r);
                return commit({ ...r, fields: [...input.fields].sort(), expiresAt: input.expiresAt,
                    revision: r.revision + 1, updatedAt: now() }, r.revision, input.operationKey, digest);
            });
        },
        withdraw(context, command) {
            const input = capture(command);
            return run(async () => {
                if (!exact(input, ['shareRef', 'expectedRevision', 'operationKey']) || typeof input.shareRef !== 'string' ||
                    !SHARE_REF.test(input.shareRef) || !id(input.operationKey) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1)
                    refuse('invalid_input');
                const a = await account(context), digest = hash(['withdraw', input]);
                const replay = await operation(a.accountId, input.operationKey, digest);
                if (replay !== null)
                    return replay;
                const r = await load(input.shareRef);
                if (r.ownerAccountId !== a.accountId)
                    refuse('forbidden');
                if (r.revision !== input.expectedRevision)
                    refuse('conflict');
                // Withdrawal remains available when the underlying source is gone.
                return commit({ ...r, state: 'withdrawn', revision: r.revision + 1, updatedAt: now() }, r.revision, input.operationKey, digest);
            });
        },
        declareSource(context, command) {
            const input = capture(command);
            return run(async () => {
                if (!exact(input, ['operationKey', 'channel', 'shareRef']) || !id(input.operationKey) ||
                    !['shared_link', 'listing', 'other', 'unknown'].includes(String(input.channel)) ||
                    !(input.shareRef === null || typeof input.shareRef === 'string' && SHARE_REF.test(input.shareRef)) ||
                    (input.channel === 'shared_link') !== (input.shareRef !== null))
                    refuse('invalid_input');
                const v = await visitor(context);
                const eventId = `ev${hash(['declaration', v.visitorRef, input.operationKey])}`;
                const previous = await priorEvent(eventId);
                if (previous) {
                    if (previous.declaredChannel !== input.channel || previous.shareRef !== input.shareRef || previous.accountId !== v.accountId)
                        refuse('idempotency_conflict');
                    return previous;
                }
                const r = input.shareRef === null ? null : await load(input.shareRef);
                if (r)
                    await publicView(r);
                return appendEvent({ eventId, stage: 'declared_source', occurredAt: now(), visitorRef: v.visitorRef,
                    accountId: v.accountId, referrerAccountId: r?.ownerAccountId ?? null,
                    shareRef: r?.shareRef ?? null, shareRevision: r?.revision ?? null, sourceType: 'declared',
                    declaredChannel: input.channel, nextAction: r?.nextAction ?? null,
                    parentEventId: null, evidenceRef: null, ...await classification(v, r?.ownerAccountId ?? null) });
            });
        },
        /** Only the host's actual link-arrival handler calls this. The visitor port
         * binds its trusted request reference. No public POST accepts observed flags. */
        observeArrival(context, shareRef) {
            return run(async () => {
                if (typeof shareRef !== 'string' || !SHARE_REF.test(shareRef))
                    refuse('invalid_input');
                const v = await visitor(context), r = await load(shareRef);
                await publicView(r);
                const eventId = `ev${hash(['arrival', v.visitorRef, v.requestRef, shareRef])}`;
                const previous = await priorEvent(eventId);
                if (previous)
                    return previous;
                return appendEvent({ eventId, stage: 'observed_link_arrival', occurredAt: now(), visitorRef: v.visitorRef,
                    accountId: v.accountId, referrerAccountId: r.ownerAccountId, shareRef, shareRevision: r.revision,
                    sourceType: 'observed_link', declaredChannel: null, nextAction: r.nextAction,
                    parentEventId: null, evidenceRef: null, ...await classification(v, r.ownerAccountId) });
            });
        },
        /** Internal callback from account/claim/accepted-work owners. Exact evidence
         * is re-read; these stages have no HTTP write route in this module. */
        recordMilestone(command) {
            const input = capture(command);
            return run(async () => {
                if (!exact(input, ['stage', 'evidenceRef', 'arrivalEventId']) ||
                    !['qualified_signup', 'claim', 'repeat'].includes(String(input.stage)) || !id(input.evidenceRef) ||
                    typeof input.arrivalEventId !== 'string' || !EVENT_REF.test(input.arrivalEventId))
                    refuse('invalid_input');
                const stage = input.stage;
                const eventId = `ev${hash(['milestone', stage, input.evidenceRef])}`;
                const previous = await priorEvent(eventId);
                if (previous) {
                    if (previous.parentEventId !== input.arrivalEventId || previous.evidenceRef !== input.evidenceRef)
                        refuse('idempotency_conflict');
                    return previous;
                }
                const arrival = await priorEvent(input.arrivalEventId);
                if (!arrival || !eventRecord(arrival) || arrival.eventId !== input.arrivalEventId || arrival.stage !== 'observed_link_arrival' || !arrival.shareRef)
                    refuse('observation_required');
                const e = structuredClone(await ports.readMilestone(stage, input.evidenceRef));
                if (!e || !exact(e, ['stage', 'evidenceRef', 'accountId', 'visitorRef', 'occurredAt', 'qualificationVersion', 'acceptedWorkRefs']) ||
                    e.stage !== stage || e.evidenceRef !== input.evidenceRef || !id(e.accountId) || !id(e.visitorRef) ||
                    e.visitorRef !== arrival.visitorRef || arrival.accountId !== null && e.accountId !== arrival.accountId ||
                    !id(e.qualificationVersion) || !instant(e.occurredAt) || Date.parse(e.occurredAt) < Date.parse(arrival.occurredAt) ||
                    Date.parse(e.occurredAt) > Date.parse(now()) || !Array.isArray(e.acceptedWorkRefs) || e.acceptedWorkRefs.length > 32 ||
                    !e.acceptedWorkRefs.every(id) || new Set(e.acceptedWorkRefs).size !== e.acceptedWorkRefs.length ||
                    (stage === 'repeat' ? e.acceptedWorkRefs.length < 2 : e.acceptedWorkRefs.length !== 0))
                    refuse('evidence_required');
                const r = await load(arrival.shareRef);
                await publicView(r);
                const v = { visitorRef: e.visitorRef, accountId: e.accountId, requestRef: e.evidenceRef };
                return appendEvent({ eventId, stage, occurredAt: e.occurredAt, visitorRef: e.visitorRef, accountId: e.accountId,
                    referrerAccountId: r.ownerAccountId, shareRef: r.shareRef, shareRevision: arrival.shareRevision,
                    sourceType: 'observed_link', declaredChannel: null, nextAction: arrival.nextAction,
                    parentEventId: arrival.eventId, evidenceRef: e.evidenceRef, ...await classification(v, r.ownerAccountId) });
            });
        },
    };
}
//# sourceMappingURL=service.js.map