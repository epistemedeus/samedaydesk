import { OPENAPI_PATHS, mcpTools, openapiOperations, rec, } from "./checks.js";
import { inspectJsonBody, retrievalDiagnostic, selectDocument } from "./retrieval.js";
/** First MCP revision that defines tool outputSchema / structuredContent. */
export const OUTPUT_SCHEMA_MCP_VERSION = "2025-06-18";
export const DESC_MIN = 40;
export const DESC_MAX = 1000;
export const DUPLICATE_THRESHOLD = 0.8;
const MUTATING = new Set(["post", "put", "patch", "delete"]);
const CLOSED_SET_NAME = /^(status|state|type|kind|mode|sort|sort_?by|order|direction|priority|level|format|currency|role|visibility|unit|interval|period|tier|plan)$/i;
const PAGINATION_PARAM = /^(limit|cursor|page|page_?size|per_?page|offset|after|before|next|page_?token|starting_after)$/i;
function list(names, max = 4) {
    if (names.length <= max)
        return names.join(", ");
    return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}
function finding(id, title, total, offenders, goodReason, badReason, fix, failWhenAll = false) {
    let status = "pass";
    if (offenders.length > 0)
        status = failWhenAll && offenders.length === total ? "fail" : "warn";
    return {
        id: `usability.${id}`,
        category: "usability",
        title,
        status,
        reason: offenders.length ? badReason(list(offenders)) : goodReason,
        fix,
    };
}
function na(id, title, reason, fix) {
    return { id: `usability.${id}`, category: "usability", title, status: "na", reason, fix };
}
/* ------------------------------- MCP lint -------------------------------- */
function words(text) {
    return new Set(text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1));
}
export function descriptionSimilarity(a, b) {
    const wa = words(a);
    const wb = words(b);
    if (wa.size === 0 && wb.size === 0)
        return 1;
    let shared = 0;
    for (const w of wa)
        if (wb.has(w))
            shared++;
    return shared / (wa.size + wb.size - shared);
}
function toolProps(tool) {
    const props = rec(rec(tool.inputSchema)?.properties);
    return props ? Object.entries(props).map(([k, v]) => [k, rec(v) ?? {}]) : [];
}
function hasEnum(schema) {
    if (Array.isArray(schema.enum) || schema.const !== undefined)
        return true;
    const alts = schema.oneOf ?? schema.anyOf;
    return Array.isArray(alts) && alts.length > 0 && alts.every((s) => rec(s)?.const !== undefined);
}
export function mcpUsabilityChecks(bundle) {
    const tools = mcpTools(bundle.mcp?.toolsList);
    const titles = {
        desc: "MCP tool descriptions say what and when",
        props: "MCP input properties have type and description",
        required: "MCP tools declare required fields",
        enums: "MCP closed value sets use enum",
        output: "MCP tools declare outputSchema",
        dupes: "MCP tool descriptions are distinct",
    };
    if (tools.length === 0) {
        const reason = bundle.mcp ? "The server listed no tools to lint." : "No MCP server in this bundle.";
        const fix = "Publish MCP tools so agents have something to call.";
        return Object.keys(titles).map((k) => na(`mcp.${k}`, titles[k], reason, fix));
    }
    const name = (t, i) => (typeof t.name === "string" ? t.name : `tool #${i + 1}`);
    const out = [];
    const badDesc = tools
        .map((t, i) => {
        const d = typeof t.description === "string" ? t.description.trim() : "";
        if (d.length < DESC_MIN)
            return `${name(t, i)} (${d.length} chars)`;
        if (d.length > DESC_MAX)
            return `${name(t, i)} (${d.length} chars)`;
        return null;
    })
        .filter((x) => !!x);
    out.push(finding("mcp.desc", titles.desc, tools.length, badDesc, `All ${tools.length} tool descriptions are ${DESC_MIN}-${DESC_MAX} characters.`, (n) => `Descriptions outside ${DESC_MIN}-${DESC_MAX} characters: ${n}.`, "Rewrite each flagged description as one or two sentences saying what the tool does and when an agent should pick it."));
    const badProps = [];
    for (const [i, t] of tools.entries()) {
        for (const [p, s] of toolProps(t)) {
            if (typeof s.description !== "string" || !s.description.trim() || s.type === undefined)
                badProps.push(`${name(t, i)}.${p}`);
        }
    }
    out.push(finding("mcp.props", titles.props, tools.length, badProps, "Every inputSchema property has a type and a description.", (n) => `Properties missing a type or description: ${n}.`, "Give every flagged inputSchema property both a JSON Schema type and a short description."));
    const noRequired = tools
        .map((t, i) => (toolProps(t).length > 0 && !Array.isArray(rec(t.inputSchema)?.required) ? name(t, i) : null))
        .filter((x) => !!x);
    out.push(finding("mcp.required", titles.required, tools.length, noRequired, "Every tool with inputs declares its required array.", (n) => `Tools with inputs but no required array: ${n}.`, "Add a required array to each flagged inputSchema, even if it is empty, so agents know what they must send."));
    const openSets = [];
    for (const [i, t] of tools.entries()) {
        for (const [p, s] of toolProps(t)) {
            if (CLOSED_SET_NAME.test(p) && (s.type === "string" || s.type === undefined) && !hasEnum(s))
                openSets.push(`${name(t, i)}.${p}`);
        }
    }
    out.push(finding("mcp.enums", titles.enums, tools.length, openSets, "No closed-set property (status, type, sort and similar) is left as free text.", (n) => `Closed-set properties without enum: ${n}.`, "List the allowed values of each flagged property in an enum so agents cannot guess wrong."));
    const negotiated = rec(rec(bundle.mcp?.initialize)?.result)?.protocolVersion;
    if (typeof negotiated !== "string" || negotiated < OUTPUT_SCHEMA_MCP_VERSION) {
        out.push(na("mcp.output", titles.output, `Server speaks ${typeof negotiated === "string" ? negotiated : "an unknown version"}, older than ${OUTPUT_SCHEMA_MCP_VERSION}, so outputSchema is not available.`, `Upgrade to MCP ${OUTPUT_SCHEMA_MCP_VERSION} or later and declare outputSchema on each tool.`));
    }
    else {
        const noOutput = tools
            .map((t, i) => (rec(t.outputSchema) || t.structuredContent !== undefined ? null : name(t, i)))
            .filter((x) => !!x);
        out.push(finding("mcp.output", titles.output, tools.length, noOutput, "Every tool declares an outputSchema.", (n) => `Tools without outputSchema: ${n}.`, "Declare an outputSchema on each flagged tool and return structuredContent that matches it."));
    }
    const pairs = [];
    for (let i = 0; i < tools.length; i++) {
        for (let j = i + 1; j < tools.length; j++) {
            const a = String(tools[i].description ?? "");
            const b = String(tools[j].description ?? "");
            if (descriptionSimilarity(a, b) >= DUPLICATE_THRESHOLD)
                pairs.push(`${name(tools[i], i)} / ${name(tools[j], j)}`);
        }
    }
    out.push(finding("mcp.dupes", titles.dupes, tools.length, pairs, "No two tool descriptions are near duplicates.", (n) => `Near-duplicate descriptions: ${n}.`, "Reword each flagged pair so the descriptions say how the tools differ and when to pick each."));
    return out;
}
/* ----------------------------- OpenAPI lint ------------------------------ */
function resolve(doc, v, depth = 0) {
    const r = rec(v);
    if (!r || typeof r.$ref !== "string" || depth > 8)
        return r ?? {};
    if (!r.$ref.startsWith("#/"))
        return {};
    let cur = doc;
    for (const part of r.$ref.slice(2).split("/"))
        cur = rec(cur)?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    return resolve(doc, cur, depth + 1);
}
function mediaHasExample(doc, content) {
    const c = rec(content);
    if (!c)
        return false;
    return Object.values(c).some((m) => {
        const media = resolve(doc, m);
        return (media.example !== undefined ||
            (rec(media.examples) && Object.keys(media.examples).length > 0) ||
            resolve(doc, media.schema).example !== undefined);
    });
}
function responses(doc, op) {
    const r = rec(op.responses);
    return r ? Object.entries(r).map(([code, v]) => [code, resolve(doc, v)]) : [];
}
function params(doc, pathItem, op) {
    const all = [...(Array.isArray(pathItem?.parameters) ? pathItem.parameters : []), ...(Array.isArray(op.parameters) ? op.parameters : [])];
    return all.map((p) => resolve(doc, p));
}
function returnsArray(doc, op) {
    for (const [code, res] of responses(doc, op)) {
        if (!code.startsWith("2"))
            continue;
        for (const m of Object.values(rec(res.content) ?? {})) {
            const schema = resolve(doc, rec(m)?.schema);
            if (schema.type === "array")
                return true;
            for (const prop of Object.values(rec(schema.properties) ?? {})) {
                if (resolve(doc, prop).type === "array")
                    return true;
            }
        }
    }
    return false;
}
export function openapiUsabilityChecks(bundle) {
    const selected = selectDocument(bundle, OPENAPI_PATHS);
    const unread = retrievalDiagnostic(selected.blocking?.path || "/openapi.json", selected.blocking?.outcome);
    const inspected = selected.chosen ? inspectJsonBody(selected.chosen.res, selected.chosen.path) : null;
    const doc = inspected?.state === "object" ? inspected.value : null;
    const ops = openapiOperations(doc);
    const titles = {
        examples: "OpenAPI operations have examples",
        errors: "OpenAPI 4xx responses have schemas",
        idempotency: "Mutating operations document idempotency",
        pagination: "Array responses describe pagination",
    };
    if (!doc || ops.length === 0) {
        const reason = unread
            ? unread.reason
            : doc
                ? "The OpenAPI document has no operations to lint."
                : inspected
                    ? "The retrieved OpenAPI body is not a usable document."
                    : "No OpenAPI document in this bundle.";
        const fix = unread?.fix || (inspected && !doc
            ? inspected.fix
            : "Publish an OpenAPI 3.x document with operations agents can call.");
        return Object.keys(titles).map((k) => na(`openapi.${k}`, titles[k], reason, fix));
    }
    const label = (o) => typeof o.op.operationId === "string" ? o.op.operationId : `${o.method.toUpperCase()} ${o.path}`;
    const pathItem = (o) => rec(doc.paths)?.[o.path];
    const out = [];
    const noExamples = ops
        .filter((o) => {
        const body = resolve(doc, o.op.requestBody);
        const needsReq = Object.keys(body).length > 0;
        const reqOk = !needsReq || mediaHasExample(doc, body.content);
        const resOk = responses(doc, o.op).some(([code, r]) => code.startsWith("2") && mediaHasExample(doc, r.content));
        return !(reqOk && resOk);
    })
        .map(label);
    out.push(finding("openapi.examples", titles.examples, ops.length, noExamples, "Every operation has a success response example, and a request example where it takes a body.", (n) => `Operations missing a request or response example: ${n}.`, "Add an example to the request body and the 2xx response of each flagged operation."));
    const noErrorSchema = ops
        .filter((o) => {
        const errs = responses(doc, o.op).filter(([code]) => /^4(\d\d|XX)$/i.test(code));
        return (errs.length === 0 ||
            errs.some(([, r]) => !Object.values(rec(r.content) ?? {}).some((m) => Object.keys(resolve(doc, rec(m)?.schema)).length > 0)));
    })
        .map(label);
    out.push(finding("openapi.errors", titles.errors, ops.length, noErrorSchema, "Every operation documents 4xx responses with a schema.", (n) => `Operations with no 4xx response or a 4xx without schema: ${n}.`, "Document the 4xx responses of each flagged operation with a shared error schema agents can parse."));
    const mutating = ops.filter((o) => MUTATING.has(o.method));
    if (mutating.length === 0) {
        out.push(na("openapi.idempotency", titles.idempotency, "No mutating operations to check.", "No action needed while the API is read-only."));
    }
    else {
        const noIdem = mutating
            .filter((o) => {
            const hasHeader = params(doc, pathItem(o), o.op).some((p) => p.in === "header" && typeof p.name === "string" && p.name.toLowerCase() === "idempotency-key");
            const explained = /idempoten/i.test(`${o.op.description ?? ""} ${o.op.summary ?? ""}`) || o.op["x-idempotent"] !== undefined;
            return !hasHeader && !explained;
        })
            .map(label);
        out.push(finding("openapi.idempotency", titles.idempotency, mutating.length, noIdem, `All ${mutating.length} mutating operations document Idempotency-Key or explain why not.`, (n) => `Mutating operations with no Idempotency-Key and no explanation: ${n}.`, "Accept an Idempotency-Key header on each flagged operation, or say in its description why retries are safe."));
    }
    const arrays = ops.filter((o) => returnsArray(doc, o.op));
    if (arrays.length === 0) {
        out.push(na("openapi.pagination", titles.pagination, "No operation returns an array.", "No action needed until a list endpoint exists."));
    }
    else {
        const noPaging = arrays
            .filter((o) => {
            const paged = params(doc, pathItem(o), o.op).some((p) => typeof p.name === "string" && PAGINATION_PARAM.test(p.name));
            return !paged && !/paginat|cursor/i.test(`${o.op.description ?? ""}`);
        })
            .map(label);
        out.push(finding("openapi.pagination", titles.pagination, arrays.length, noPaging, `All ${arrays.length} array-returning operations describe pagination.`, (n) => `Array-returning operations with no pagination: ${n}.`, "Add limit and cursor parameters to each flagged operation, or state in its description that the list is bounded."));
    }
    return out;
}
export function usabilityChecks(bundle) {
    return [...mcpUsabilityChecks(bundle), ...openapiUsabilityChecks(bundle)];
}
