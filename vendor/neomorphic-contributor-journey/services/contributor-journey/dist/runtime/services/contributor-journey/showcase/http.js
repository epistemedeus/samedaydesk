const statusCodes = {
    disabled: 404, not_found: 404, unauthenticated: 401, invalid_input: 400, not_accepted: 409,
    content_unavailable: 409, profile_not_visible: 409, stale_consent: 409, conflict: 409,
    idempotency_conflict: 409, unavailable: 503, unknown_outcome: 202, mutation_refused: 403,
};
function json(result, status) {
    return new Response(JSON.stringify(result), { status: status ?? (result.ok ? 200 : statusCodes[result.code]), headers: {
            "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private",
            "x-content-type-options": "nosniff", vary: "Cookie, Authorization",
        } });
}
async function boundedBody(request) {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
        throw new Error("invalid content type");
    const reader = request.body?.getReader();
    if (!reader)
        throw new Error("missing body");
    const chunks = [];
    let bytes = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            bytes += next.value.byteLength;
            if (bytes > 4096) {
                await reader.cancel();
                throw new Error("body bound");
            }
            chunks.push(next.value);
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    }
    finally {
        reader.releaseLock();
    }
}
/** SDS/native server mount adapter. Authentication and mutation protection are mandatory server ports. */
export function createShowcaseHttpHandler(deps) {
    const prefix = deps.prefix ?? "/v1/contributor-showcase";
    if (!/^\/[A-Za-z0-9/_-]+$/.test(prefix) || prefix.endsWith("/"))
        throw new Error("invalid mount prefix");
    return async (request) => {
        try {
            const url = new URL(request.url);
            if (!url.pathname.startsWith(`${prefix}/`))
                return json({ ok: false, code: "not_found" });
            const path = url.pathname.slice(prefix.length);
            if (request.method === "GET" && path === "/works") {
                const limit = url.searchParams.get("limit");
                if (limit !== null && !/^\d{1,2}$/.test(limit))
                    return json({ ok: false, code: "invalid_input" });
                return json(await deps.service.listPublished(limit === null ? 20 : Number(limit)));
            }
            const work = /^\/works\/([A-Za-z0-9_-]+)$/.exec(path);
            if (request.method === "GET" && work)
                return json(await deps.service.readPublished(work[1]));
            const mine = /^\/mine\/([A-Za-z0-9_-]+)(?:\/(consent|operations)(?:\/([A-Za-z0-9_:-]+))?)?$/.exec(path);
            if (!mine)
                return json({ ok: false, code: "not_found" });
            const account = await deps.authenticate(request);
            if (!account)
                return json({ ok: false, code: "unauthenticated" });
            const [, workId, action, key] = mine;
            if (request.method === "GET") {
                if (!action)
                    return json(await deps.service.preview(account, workId));
                if (action === "consent" && !key)
                    return json(await deps.service.readConsent(account, workId));
                if (action === "operations" && key)
                    return json(await deps.service.readWriteOutcome(account, workId, key));
            }
            if (action === "consent" && !key && (request.method === "PUT" || request.method === "DELETE")) {
                if (!await deps.authorizeMutation(request, account))
                    return json({ ok: false, code: "mutation_refused" });
                let body;
                try {
                    body = await boundedBody(request);
                }
                catch {
                    return json({ ok: false, code: "invalid_input" });
                }
                const idempotencyKey = request.headers.get("idempotency-key");
                return json(request.method === "PUT" ? await deps.service.publish(account, workId, body, idempotencyKey) :
                    await deps.service.withdraw(account, workId, body, idempotencyKey));
            }
            return json({ ok: false, code: "not_found" }, 405);
        }
        catch {
            return json({ ok: false, code: "unavailable" });
        }
    };
}
//# sourceMappingURL=http.js.map