import Ajv from "ajv";
import { fail } from "./errors.mjs";

export const object = (properties, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
export const text = (maxLength = 128) => ({ type: "string", minLength: 1, maxLength });
export const integer = (maximum = Number.MAX_SAFE_INTEGER, minimum = 0) => ({ type: "integer", minimum, maximum });
export const nullable = schema => ({ anyOf: [schema, { type: "null" }] });
export const idSchema = { ...text(64), pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]*$" };
export const hashSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };
export const priceSchema = object({ amount: integer(1_000_000_000), unit: idSchema });
export const requirementsSchema = object({
  scheme: { const: "exact" }, network: text(), asset: text(), amount: { ...text(32), pattern: "^[1-9][0-9]*$" },
  payTo: text(), maxTimeoutSeconds: integer(3600, 1),
  extra: object({ name: text(), version: text() }, []),
}, ["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds"]);

const anyOutput = nullable({ type: "object", additionalProperties: true });
export const paymentSchema = object({
  state: { enum: ["not_required", "not_attempted", "possible", "settled", "declined"] },
  adapter: nullable(text()), evidence: { enum: ["none", "unsigned_fixture", "facilitator_response"] },
  reference: nullable(text(256)), network: nullable(text()),
});
export const descriptorSchema = object({
  id: idSchema, version: text(40), provider: text(), description: text(512), price: priceSchema,
  timeoutMs: integer(30000, 10), maxOutputBytes: integer(262144, 128), routeDigest: hashSchema,
  inputSchemaPath: text(256), outputSchemaPath: text(256), executable: { type: "boolean" },
});
export const schemas = {
  quoteRequest: object({ routeId: idSchema, input: { type: "object" } }),
  executeRequest: object({ quoteId: { ...text(36), pattern: "^[a-f0-9-]{36}$" }, input: { type: "object" }, maxUnits: integer(1_000_000_000) }),
  testRequest: object({ routeId: idSchema }),
  quote: object({
    schema: { const: "neomorphic.machine-gateway.quote.v1" }, quoteId: nullable(text(36)),
    routeId: idSchema, routeDigest: hashSchema, inputDigest: hashSchema,
    expiresAt: integer(), tenantBound: { type: "boolean" }, executable: { type: "boolean" },
    price: priceSchema, requirements: nullable(requirementsSchema),
  }),
  receipt: object({
    schema: { const: "neomorphic.machine-gateway.receipt.v1" }, id: text(36), quoteId: text(36),
    routeId: idSchema, routeVersion: text(40), requestDigest: hashSchema, inputDigest: hashSchema,
    createdAt: integer(), deadlineAt: integer(), completedAt: nullable(integer()),
    status: { enum: ["running", "completed", "failed", "uncertain"] },
    price: priceSchema, payment: paymentSchema, output: anyOutput,
    error: nullable(object({ code: text() })), readbackPath: text(256),
  }),
  test: object({
    schema: { const: "neomorphic.machine-gateway.test.v1" }, routeId: idSchema,
    fixture: { const: true }, paymentAttempts: { const: 0 }, output: { type: "object" },
  }),
  discovery: object({
    schema: { const: "neomorphic.machine-gateway.discovery.v1" }, version: { const: "0.1.0" },
    basePath: { type: "string", maxLength: 128 }, budgetUnit: idSchema,
    paymentsEnabled: { type: "boolean" },
    paths: object({ quote: text(256), test: text(256), execute: text(256), receipt: text(256) }),
    routes: { type: "array", minItems: 1, maxItems: 100, items: descriptorSchema },
  }),
  health: object({
    schema: { const: "neomorphic.machine-gateway.health.v1" }, ready: { type: "boolean" },
    runtime: { const: "mounted-node" }, persistence: { enum: ["sqlite-wal", "postgres"] },
    paymentsEnabled: { type: "boolean" }, routeCount: integer(100, 1),
  }),
  error: object({ error: object({ code: text() }) }),
  tenantConfig: object({ tenants: { type: "array", minItems: 1, maxItems: 1000, items: object({
    id: idSchema, tokenSha256: hashSchema, routes: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: idSchema },
    maxUnits: integer(1_000_000_000), maxCalls: integer(1_000_000, 1), maxConcurrent: integer(4, 1),
  }) } }),
};

export const ajv = new Ajv({ strict: true, allErrors: false, validateFormats: false, ownProperties: true });
const compiled = new Map(Object.entries(schemas).map(([key, value]) => [key, ajv.compile(value)]));
export function validate(name, value, { response = false } = {}) {
  if (!compiled.get(name)(value)) fail(response ? "response_schema_invalid" : "request_schema_invalid", response ? 502 : 400);
  return value;
}
