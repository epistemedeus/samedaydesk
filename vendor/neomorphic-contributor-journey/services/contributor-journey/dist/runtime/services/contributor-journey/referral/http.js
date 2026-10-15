const statuses = {
    disabled: 404, unauthenticated: 401, forbidden: 403, consent_required: 422,
    not_found: 404, revoked: 410, expired: 410, conflict: 409, idempotency_conflict: 409,
    source_changed: 409, preview_changed: 409, would_widen: 422,
    storage_unavailable: 503, source_unavailable: 503, write_unknown: 503, capacity: 503,
};
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    } });
const result = (r) => response(r, r.ok ? 200 : statuses[r.code] ?? 400);
async function body(req) {
    if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
        throw new Error('media');
    if (Number(req.headers.get('content-length') ?? 0) > 8192)
        throw new Error('size');
    const reader = req.body?.getReader();
    if (!reader)
        throw new Error('empty');
    let size = 0;
    const chunks = [];
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            size += chunk.value.length;
            if (size > 8192)
                throw new Error('size');
            chunks.push(chunk.value);
        }
    }
    catch (error) {
        await reader.cancel();
        throw error;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
/** Fetch handler; SDS/Express adaptation belongs to227800. It never sets cookies,
 * broadcasts, accepts proof flags, or exposes private event/operation records. */
export function createReferralHttpHandler(service, options) {
    const base = options.basePath ?? '/v1/contributor-referral';
    if (!/^\/[a-z0-9/-]+$/.test(base) || base.endsWith('/'))
        throw new Error('invalid basePath');
    return async (request) => {
        const url = new URL(request.url);
        if (!url.pathname.startsWith(`${base}/`) || url.search)
            return response({ ok: false, code: 'not_found' }, 404);
        const path = url.pathname.slice(base.length + 1);
        if (request.method === 'GET') {
            const match = /^(public|own|arrival)\/(rf[0-9a-f]{48})$/.exec(path);
            if (!match)
                return response({ ok: false, code: 'not_found' }, 404);
            if (match[1] === 'own')
                return result(await service.readOwn(request, match[2]));
            const publicShare = await service.readPublic(match[2]);
            if (!publicShare.ok || match[1] === 'public')
                return result(publicShare);
            const observed = await service.observeArrival(request, match[2]);
            let continuation = 'unavailable';
            if (observed.ok && options.retainArrival) {
                try {
                    await options.retainArrival(request, observed.value);
                    continuation = 'retained';
                }
                catch { /* The sink event survives; retry the same immutable parent. */ }
            }
            // A measurement failure does not fabricate an observed arrival or erase
            // the useful public read. No visitor/account/event reference is returned.
            return response({ ...publicShare, observation: observed.ok ? 'recorded' : 'unrecorded', continuation });
        }
        if (request.method !== 'POST' || !['preview', 'create', 'narrow', 'withdraw', 'declare-source', 'read-operation'].includes(path)) {
            return response({ ok: false, code: 'not_found' }, 404);
        }
        try {
            if (!await options.authorizeMutation(request))
                return response({ ok: false, code: 'forbidden' }, 403);
        }
        catch {
            return response({ ok: false, code: 'forbidden' }, 403);
        }
        let input;
        try {
            input = await body(request);
        }
        catch {
            return response({ ok: false, code: 'invalid_input' }, 400);
        }
        switch (path) {
            case 'preview': return result(await service.preview(request, input));
            case 'create': return result(await service.create(request, input));
            case 'narrow': return result(await service.narrow(request, input));
            case 'withdraw': return result(await service.withdraw(request, input));
            case 'read-operation': return result(await service.readOperation(request, input));
            default: {
                const recorded = await service.declareSource(request, input);
                return recorded.ok ? response({ ok: true, value: { recorded: true } }) : result(recorded);
            }
        }
    };
}
//# sourceMappingURL=http.js.map