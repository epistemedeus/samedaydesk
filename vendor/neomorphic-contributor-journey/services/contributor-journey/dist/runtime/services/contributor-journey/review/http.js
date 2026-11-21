import { fail, ReviewError } from "./validation.js";
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-content-type-options": "nosniff", "vary": "Cookie, Authorization, Origin" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
async function body(request) {
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
        fail(415, "unsupported_media_type", "Use application/json.");
    if (!request.body)
        fail(400, "invalid_input", "Supply a review command.");
    const reader = request.body.getReader(), chunks = [];
    let bytes = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            bytes += chunk.value.byteLength;
            if (bytes > 8192) {
                await reader.cancel();
                fail(413, "body_too_large", "Review commands are limited to 8192 bytes.");
            }
            chunks.push(chunk.value);
        }
        const all = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            all.set(chunk, offset);
            offset += chunk.length;
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
    }
    catch (error) {
        if (error instanceof ReviewError)
            throw error;
        fail(400, "invalid_input", "Supply a valid JSON review command.");
    }
    finally {
        reader.releaseLock();
    }
}
/** Host-authenticated context, never JSON-supplied principal/owner flags. Off by default. */
export function createReviewHandler(options) {
    const basePath = options.basePath ?? "/api/contribute/review";
    if (!/^\/[A-Za-z0-9/_-]+$/.test(basePath) || basePath.endsWith("/"))
        throw new Error("Invalid review mount path");
    for (const origin of options.allowedOrigins)
        if (new URL(origin).origin !== origin)
            throw new Error("Use exact review origins");
    return async (request) => {
        if (!options.enabled)
            return reply({ ok: false, code: "not_found" }, 404);
        try {
            const url = new URL(request.url), suffix = url.pathname.slice(basePath.length);
            if (!url.pathname.startsWith(basePath) || !["", "/verdict", "/decision", "/clarification", "/response"].includes(suffix))
                return reply({ ok: false, code: "not_found" }, 404);
            if (request.method !== "GET" && request.method !== "POST" || request.method === "GET" && suffix !== "" || request.method === "POST" && suffix === "")
                return reply({ ok: false, code: "method_not_allowed" }, 405);
            if (request.method === "POST" && !options.allowedOrigins.includes(request.headers.get("origin") ?? ""))
                return reply({ ok: false, code: "origin_refused" }, 403);
            const context = await options.context(request);
            let result;
            if (request.method === "GET") {
                if ([...url.searchParams.keys()].some(k => !["taskId", "reservationId"].includes(k)) || [...url.searchParams.keys()].length !== 2)
                    fail(400, "invalid_input", "Use one task and reservation reference.");
                result = await options.service.read(context, { taskId: url.searchParams.get("taskId"), reservationId: url.searchParams.get("reservationId") });
            }
            else {
                const input = await body(request);
                result = suffix === "/verdict" ? await options.service.verdict(context, input) : suffix === "/decision" ? await options.service.decide(context, input) : suffix === "/clarification" ? await options.service.requestClarification(context, input) : await options.service.respond(context, input);
            }
            return reply(result, result.ok ? 200 : result.status);
        }
        catch (error) {
            if (error instanceof ReviewError)
                return reply({ ok: false, status: error.status, code: error.code, message: error.message }, error.status);
            return reply({ ok: false, status: 503, code: "unavailable", message: "Review status is unavailable." }, 503);
        }
    };
}
//# sourceMappingURL=http.js.map