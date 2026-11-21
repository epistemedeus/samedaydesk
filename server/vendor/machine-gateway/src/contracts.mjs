import { schemas, object } from "./schemas.mjs";
import { builtinRoutes } from "./providers.mjs";

export function openapi() {
  const ref = name => ({ $ref: `#/components/schemas/${name}` });
  const response = (name, description = "Validated response") => ({ description, content: { "application/json": { schema: ref(name) } } });
  const operation = (id, name, { request, auth = false } = {}) => ({
    operationId: id, security: auth ? [{ tenantBearer: [] }] : [],
    ...(request ? { requestBody: { required: true, content: { "application/json": { schema: ref(request) } } } } : {}),
    responses: { "200": response(name), default: response("error", "Bounded JSON error; no provider text or credentials") },
  });
  const paths = {
    "/healthz": { get: operation("gatewayHealth", "health") },
    "/v1/discover": { get: operation("discoverRoutes", "discovery") },
    "/v1/quote": { post: { ...operation("quoteRoute", "quote", { request: "quoteRequest" }), security: [{}, { tenantBearer: [] }],
      description: "Free. Anonymous quotes are previews; authenticated quotes bind one tenant, route, price and exact input for 60 seconds." } },
    "/v1/test": { post: { ...operation("testRouteFixture", "test", { request: "testRequest" }),
      description: "Free deterministic test fixture. Does not execute caller input or enter payment adapters." } },
    "/v1/execute": { post: { ...operation("executeBoundQuote", "receipt", { request: "executeRequest", auth: true }),
      parameters: [
        { in: "header", name: "Idempotency-Key", required: true, schema: { type: "string", pattern: "^[A-Za-z0-9_.-]{16,128}$" } },
        { in: "header", name: "Payment-Signature", required: false, schema: { type: "string", maxLength: 16384 }, description: "Only for a deployment-enabled paid route using its existing facilitator adapter. Free routes reject this header." },
      ],
      description: "One execution per quote and one possible settlement per authorization. Retry identical bytes/fields and the same idempotency key; unresolved attempts never restart.",
      responses: { "200": response("receipt", "Persisted completed, failed or uncertain receipt"), "202": response("receipt", "Same admitted attempt is still running"), default: response("error") },
    } },
    "/v1/receipts/{id}": { get: { ...operation("readPersistedReceipt", "receipt", { auth: true }),
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", pattern: "^[a-f0-9-]{36}$" } }],
      description: "Tenant-bound persisted readback. Another tenant receives 404. Expired in-flight work becomes uncertain without resending.",
    } },
  };
  const components = structuredClone(schemas);
  const quoteInputs = [];
  for (const route of builtinRoutes()) {
    const key = route.id.replaceAll(".", "_");
    components[`${key}_input`] = route.inputSchema;
    components[`${key}_output`] = route.outputSchema;
    quoteInputs.push(object({ routeId: { const: route.id }, input: ref(`${key}_input`) }));
    for (const side of ["input", "output"]) paths[`/v1/routes/${route.id}/${side}.schema.json`] = {
      get: { operationId: `${key}_${side}_schema`, security: [], responses: {
        "200": { description: `JSON Schema for ${route.id} ${side}`, content: { "application/json": { schema: { type: "object" } } } }, default: response("error"),
      } },
    };
  }
  components.quoteRequest = { oneOf: quoteInputs };
  return { openapi: "3.1.0", info: { title: "Neomorphic Machine gateway", version: "0.1.1",
    description: "Mounted service contract. Prepared for deployment; this document is not evidence of a live endpoint." },
    "x-release-state": "prepared-not-deployed", servers: [{ url: "/api/machine-gateway" }], paths,
    components: { securitySchemes: { tenantBearer: { type: "http", scheme: "bearer" } }, schemas: components },
  };
}
