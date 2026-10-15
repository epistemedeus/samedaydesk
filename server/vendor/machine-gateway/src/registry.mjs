import { ajv, validate, descriptorSchema } from "./schemas.mjs";
import { digest, deepFreeze } from "./util.mjs";
import { fail } from "./errors.mjs";

const descriptorValid = ajv.compile(descriptorSchema);

// Providers are trusted deployment code, never request URLs or module names.
export class RouteRegistry {
  #routes = new Map();
  constructor(definitions, { budgetUnit = "usd-micros" } = {}) {
    if (!Array.isArray(definitions) || !definitions.length || definitions.length > 100) throw new Error("invalid route registry");
    this.budgetUnit = budgetUnit;
    for (const definition of definitions) {
      const route = structuredClone(Object.fromEntries(Object.entries(definition).filter(([, value]) => typeof value !== "function")));
      for (const key of ["run", "test", "preflight"]) route[key] = definition[key];
      if (this.#routes.has(route.id) || route.price?.unit !== budgetUnit || typeof route.run !== "function" || typeof route.test !== "function") {
        throw new Error("invalid route definition");
      }
      // Both ends of every provider have a closed top-level object contract.
      for (const schema of [route.inputSchema, route.outputSchema]) {
        if (schema?.type !== "object" || schema.additionalProperties !== false) throw new Error("route requires closed object schemas");
      }
      route.checkInput = ajv.compile(route.inputSchema);
      route.checkOutput = ajv.compile(route.outputSchema);
      route.routeDigest = digest({ id: route.id, version: route.version, provider: route.provider, price: route.price,
        input: route.inputSchema, output: route.outputSchema, timeoutMs: route.timeoutMs, maxOutputBytes: route.maxOutputBytes,
        paymentRequirements: route.paymentRequirements ?? null });
      this.#routes.set(route.id, deepFreeze(route));
      if (!descriptorValid(this.describe(route.id, "", true))) throw new Error("invalid route descriptor");
    }
    Object.freeze(this);
  }
  get(id) { const route = this.#routes.get(id); if (!route) fail("route_not_found", 404); return route; }
  list() { return [...this.#routes.values()]; }
  input(route, input) {
    if (!route.checkInput(input)) fail("request_schema_invalid");
    route.preflight?.(input);
  }
  output(route, output) {
    if (Buffer.byteLength(JSON.stringify(output)) > route.maxOutputBytes) fail("response_too_large", 502);
    if (!route.checkOutput(output)) fail("response_schema_invalid", 502);
    return output;
  }
  describe(id, prefix, paidEnabled) {
    const r = this.get(id);
    return {
      id: r.id, version: r.version, provider: r.provider, description: r.description, price: r.price,
      timeoutMs: r.timeoutMs, maxOutputBytes: r.maxOutputBytes, routeDigest: r.routeDigest,
      inputSchemaPath: `${prefix}/v1/routes/${r.id}/input.schema.json`,
      outputSchemaPath: `${prefix}/v1/routes/${r.id}/output.schema.json`,
      executable: r.price.amount === 0 || paidEnabled,
    };
  }
  discover(prefix, paymentsEnabled) {
    return validate("discovery", {
      schema: "neomorphic.machine-gateway.discovery.v1", version: "0.1.0", basePath: prefix,
      budgetUnit: this.budgetUnit, paymentsEnabled,
      paths: { quote: `${prefix}/v1/quote`, test: `${prefix}/v1/test`, execute: `${prefix}/v1/execute`, receipt: `${prefix}/v1/receipts/{id}` },
      routes: this.list().map(r => this.describe(r.id, prefix, paymentsEnabled)),
    }, { response: true });
  }
}
