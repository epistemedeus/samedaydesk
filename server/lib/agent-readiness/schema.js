export class BundleError extends Error {
}
const RESPONSE_KEYS = ["status", "contentType", "headers", "body"];
function isObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** Validate a parsed probe bundle. Throws BundleError with a readable message. */
export function validateBundle(input) {
    if (!isObject(input))
        throw new BundleError("Bundle must be a JSON object.");
    if (input.schema !== "agent-readiness.probe.v1") {
        throw new BundleError(`Unsupported schema: expected "agent-readiness.probe.v1", got ${JSON.stringify(input.schema ?? null)}.`);
    }
    if (typeof input.host !== "string" || input.host.trim() === "") {
        throw new BundleError("Bundle is missing a host string.");
    }
    if (typeof input.probedAt !== "string" || Number.isNaN(Date.parse(input.probedAt))) {
        throw new BundleError("probedAt must be an ISO date string.");
    }
    if (!isObject(input.responses)) {
        throw new BundleError("Bundle is missing a responses object.");
    }
    for (const [path, value] of Object.entries(input.responses)) {
        if (!isObject(value))
            throw new BundleError(`Response for ${path} must be an object.`);
        if (typeof value.status !== "number") {
            throw new BundleError(`Response for ${path} is missing a numeric status.`);
        }
        for (const key of Object.keys(value)) {
            if (!RESPONSE_KEYS.includes(key)) {
                throw new BundleError(`Response for ${path} has an unknown field: ${key}.`);
            }
        }
    }
    if (input.mcp !== undefined) {
        if (!isObject(input.mcp))
            throw new BundleError("mcp must be an object.");
        if (typeof input.mcp.url !== "string")
            throw new BundleError("mcp.url must be a string.");
        if (typeof input.mcp.offeredVersion !== "string") {
            throw new BundleError("mcp.offeredVersion must be a string.");
        }
    }
    if (input.corsPreflight !== undefined) {
        if (!isObject(input.corsPreflight))
            throw new BundleError("corsPreflight must be an object.");
        for (const [path, value] of Object.entries(input.corsPreflight)) {
            if (!isObject(value) || typeof value.status !== "number" || !isObject(value.headers)) {
                throw new BundleError(`corsPreflight for ${path} needs a status and a headers object.`);
            }
        }
    }
    return input;
}
export function parseBundleText(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (e) {
        throw new BundleError(`Not valid JSON: ${e.message}`);
    }
    return validateBundle(parsed);
}
