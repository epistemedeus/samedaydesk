import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = here;
export const ROOT = join(here, "../..");
const DEFAULT_CATALOG = join(here, "catalog.json");
const VALID_FIXTURES = join(here, "fixtures/valid");
const INVALID_FIXTURES = join(here, "fixtures/invalid");
const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const SCHEMA_COMBINATORS = ["anyOf", "oneOf", "allOf"];

export function defaultCatalogPath() {
  return DEFAULT_CATALOG;
}

export function validFixtureDir() {
  return VALID_FIXTURES;
}

export function invalidFixtureDir() {
  return INVALID_FIXTURES;
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!catalog?.consumerEvidence || !Array.isArray(catalog.rejectCodes)) {
    throw new Error("catalog must declare consumerEvidence and rejectCodes");
  }
  return catalog;
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function loadInvalidManifest(manifestPath = INVALID_MANIFEST) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function fileDigest(filePath, root = ROOT) {
  const buf = readFileSync(filePath);
  return {
    path: relative(root, filePath).replaceAll("\\", "/"),
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.length,
  };
}

function error(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

export function routeId(method, path) {
  return `${String(method || "GET").toUpperCase()} ${path}`;
}

export function detectKind(doc) {
  if (!isPlainObject(doc)) return "invalid";
  if (typeof doc.kind === "string" && doc.kind) return doc.kind;
  if (typeof doc.openapi === "string" && isPlainObject(doc.paths)) return "openapi";
  if (doc.x402Version != null && Array.isArray(doc.items)) return "x402_manifest";
  if (doc.x402Version != null && Array.isArray(doc.resources)) return "bazaar_listing";
  if (doc.schemaVersion === "samedaydesk.seller-conformance-crawl.v1") return "conformance_crawl";
  if (doc.schema === "useful-jobs.catalog.v1") return "useful_jobs_catalog";
  if (doc.schemaVersion === "samedaydesk.x402-verified-feed.v1") return "verified_feed";
  if (isPlainObject(doc.route) && isPlainObject(doc.contract)) return "buyer_runtime_catalog";
  if (doc.status === 402 && isPlainObject(doc.body) && Array.isArray(doc.body.accepts)) {
    return "unpaid_402_observation";
  }
  if (typeof doc.method === "string" && typeof doc.path === "string") return "single_route";
  return "unknown";
}

const SCHEMA_FIELD_NAME_KEYS = new Set(["properties", "patternProperties", "example", "examples"]);

function forbiddenKeySet(catalog) {
  return new Set((catalog.catalogOnlyForbiddenKeys || []).map((key) => String(key).toLowerCase()));
}

function walkForbidden(value, path, forbidden, hits, flagKeys = true) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbidden(item, `${path}[${index}]`, forbidden, hits, flagKeys));
    return hits;
  }
  if (!isPlainObject(value)) {
    if (typeof value === "string" && /neomorphic\.io/i.test(value)) {
      hits.push(error("catalog_only_violation", path, "that host is outside this evaluation"));
    }
    return hits;
  }
  for (const key of ownKeys(value)) {
    const next = path === "$" ? `$.${key}` : `${path}.${key}`;
    if (flagKeys && forbidden.has(key.toLowerCase())) {
      hits.push(error("catalog_only_violation", next, `catalog-only evaluation rejects ${key}`));
    }
    const nextFlag = flagKeys && !SCHEMA_FIELD_NAME_KEYS.has(key);
    walkForbidden(value[key], next, forbidden, hits, nextFlag);
  }
  return hits;
}

export function detectCatalogOnlyViolations(value, catalog = loadCatalog()) {
  return walkForbidden(value, "$", forbiddenKeySet(catalog), []);
}

function cleanMediaType(value) {
  if (typeof value !== "string") return null;
  const mediaType = value.split(";")[0].trim().toLowerCase();
  return mediaType || null;
}

function exampleKeys(example) {
  if (!isPlainObject(example)) return [];
  return Object.keys(example).sort();
}

function isTypedNonObject(schema) {
  const type = schema?.type;
  return type === "string" || type === "number" || type === "integer" || type === "boolean" || type === "null";
}

function isConstrainedArray(schema) {
  return schema?.type === "array" && schema.items != null;
}

function isUnconstrainedObject(schema) {
  if (!isPlainObject(schema)) return false;
  if (typeof schema.$ref === "string" && schema.$ref) return false;
  if (SCHEMA_COMBINATORS.some((key) => Array.isArray(schema[key]) && schema[key].length > 0)) return false;
  if (isTypedNonObject(schema) || isConstrainedArray(schema)) return false;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return false;
  const properties = schema.properties;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const hasProps = isPlainObject(properties) && ownKeys(properties).length > 0;
  return !hasProps && required.length === 0;
}

function unwrapOutputSchema(outputSchema) {
  if (!isPlainObject(outputSchema)) return { schema: null, example: null };
  const inner = outputSchema.output;
  if (isPlainObject(inner)) {
    const hasShape = inner.type || inner.properties || inner.required || inner.$ref;
    return {
      schema: hasShape
        ? {
            type: inner.type || (inner.properties ? "object" : undefined),
            properties: inner.properties,
            required: inner.required,
            additionalProperties: inner.additionalProperties,
            $ref: inner.$ref,
          }
        : null,
      example: isPlainObject(inner.example) ? inner.example : null,
    };
  }
  return {
    schema: outputSchema,
    example: isPlainObject(outputSchema.example) ? outputSchema.example : null,
  };
}

export function evaluateOutputContract(input, catalog = loadCatalog()) {
  const errors = [];
  if (input == null || (typeof input !== "object" && typeof input !== "function")) {
    return {
      ok: false,
      completeness: "absent",
      catalogEligible: false,
      mediaType: null,
      requiredPaths: [],
      propertyNames: [],
      exampleKeys: [],
      errors: [error("invalid_shape", "$", "output contract input is required")],
    };
  }

  const violations = detectCatalogOnlyViolations(input, catalog);
  if (violations.length > 0) {
    return {
      ok: false,
      completeness: "out_of_scope",
      catalogEligible: false,
      mediaType: null,
      requiredPaths: [],
      propertyNames: [],
      exampleKeys: exampleKeys(input.example),
      errors: violations,
    };
  }

  const mediaType = cleanMediaType(input.mediaType);
  const allowedMedia = new Set(catalog.mediaTypes);
  const example = isPlainObject(input.example) ? input.example : null;
  const hintedRequired = Array.isArray(input.requiredPaths)
    ? input.requiredPaths.filter((item) => typeof item === "string" && item)
    : [];
  let schema = isPlainObject(input.schema) ? input.schema : null;

  if (schema && Object.keys(schema).length === 0) schema = null;

  if (schema && typeof schema.$ref === "string" && schema.$ref && !input.resolvedSchema) {
    errors.push(error("unresolved_ref", "$.schema.$ref", "catalog-only evaluation does not invent $ref targets"));
    return {
      ok: false,
      completeness: "absent",
      catalogEligible: false,
      mediaType,
      requiredPaths: [],
      propertyNames: [],
      exampleKeys: exampleKeys(example),
      errors,
    };
  }
  if (isPlainObject(input.resolvedSchema)) schema = input.resolvedSchema;

  if (!schema) {
    if (example && exampleKeys(example).length > 0) {
      errors.push(error("example_is_not_schema", "$.example", "an example is not a machine-verifiable output schema"));
      return {
        ok: false,
        completeness: "example_only",
        catalogEligible: false,
        mediaType,
        requiredPaths: hintedRequired,
        propertyNames: [],
        exampleKeys: exampleKeys(example),
        errors,
      };
    }
    if (hintedRequired.length > 0) {
      errors.push(error("output_schema_absent", "$.schema", "required path names are not a typed schema"));
      return {
        ok: false,
        completeness: "required_paths",
        catalogEligible: false,
        mediaType,
        requiredPaths: hintedRequired,
        propertyNames: [],
        exampleKeys: [],
        errors,
      };
    }
    errors.push(error("output_schema_absent", "$.schema", "no output schema was declared"));
    return {
      ok: false,
      completeness: "absent",
      catalogEligible: false,
      mediaType,
      requiredPaths: [],
      propertyNames: [],
      exampleKeys: [],
      errors,
    };
  }

  if (!mediaType || !allowedMedia.has(mediaType)) {
    errors.push(error("media_type_missing", "$.mediaType", "application/json media type is required"));
  }

  if (!isPlainObject(schema)) {
    errors.push(error("invalid_shape", "$.schema", "schema must be a plain object"));
    return {
      ok: false,
      completeness: "absent",
      catalogEligible: false,
      mediaType,
      requiredPaths: [],
      propertyNames: [],
      exampleKeys: exampleKeys(example),
      errors,
    };
  }

  const properties = schema.properties;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const hasProps = isPlainObject(properties) && ownKeys(properties).length > 0;

  if (isUnconstrainedObject(schema)) {
    if (example && exampleKeys(example).length > 0) {
      errors.push(error("example_is_not_schema", "$.example", "example keys do not constrain an unconstrained object"));
      return {
        ok: false,
        completeness: "example_only",
        catalogEligible: false,
        mediaType,
        requiredPaths: [],
        propertyNames: [],
        exampleKeys: exampleKeys(example),
        errors,
      };
    }
    errors.push(error("unconstrained_object", "$.schema", "object schema has no properties or required paths"));
    return {
      ok: false,
      completeness: "unconstrained",
      catalogEligible: false,
      mediaType,
      requiredPaths: [],
      propertyNames: [],
      exampleKeys: exampleKeys(example),
      errors,
    };
  }

  if (!hasProps && required.length === 0) {
    errors.push(
      error("invalid_shape", "$.schema", "catalog output contract must be a typed object with named properties"),
    );
    return {
      ok: false,
      completeness: "absent",
      catalogEligible: false,
      mediaType,
      requiredPaths: [],
      propertyNames: [],
      exampleKeys: exampleKeys(example),
      errors,
    };
  }

  if (!hasProps) {
    errors.push(error("unconstrained_object", "$.schema.properties", "required paths need named properties"));
  }

  if (required.length === 0) {
    errors.push(error("required_paths_missing", "$.schema.required", "at least one required output path is required"));
  }

  const propertyNames = hasProps ? ownKeys(properties).sort() : [];
  for (const name of required) {
    if (typeof name !== "string" || !name) {
      errors.push(error("required_paths_missing", "$.schema.required", "required path names must be strings"));
      continue;
    }
    if (!hasProps || !Object.hasOwn(properties, name)) {
      errors.push(error("required_paths_missing", `$.schema.required.${name}`, "required path is missing from properties"));
      continue;
    }
    if (isUnconstrainedObject(properties[name])) {
      errors.push(
        error("unconstrained_object", `$.schema.properties.${name}`, "required property is an unconstrained object"),
      );
    }
  }

  const completeness = errors.some((item) => item.code === "unconstrained_object")
    ? "unconstrained"
    : errors.some((item) => item.code === "required_paths_missing")
      ? "required_paths"
      : errors.some((item) => item.code === "example_is_not_schema")
        ? "example_only"
        : errors.length > 0
          ? "absent"
          : "complete";
  const catalogEligible = completeness === "complete" && errors.length === 0;
  return {
    ok: catalogEligible,
    completeness,
    catalogEligible,
    mediaType,
    requiredPaths: required.filter((item) => typeof item === "string"),
    propertyNames,
    exampleKeys: exampleKeys(example),
    errors,
  };
}

function pickContentMediaType(content, catalog) {
  const keys = ownKeys(content);
  const allowed = new Set((catalog.mediaTypes || []).map((item) => cleanMediaType(item)).filter(Boolean));
  return keys.find((key) => allowed.has(cleanMediaType(key))) || keys.sort()[0];
}

function fromOpenApiOperation(op, catalog) {
  const success = isPlainObject(op?.responses) ? op.responses["200"] || op.responses["201"] || null : null;
  if (!isPlainObject(success) || ownKeys(success).length === 0) {
    return { emptySuccess: true, mediaType: null, schema: null, example: null };
  }
  const content = isPlainObject(success.content) ? success.content : null;
  if (!content || ownKeys(content).length === 0) {
    return { emptySuccess: true, mediaType: null, schema: null, example: null };
  }
  const mediaType = pickContentMediaType(content, catalog);
  const media = content[mediaType];
  return {
    emptySuccess: false,
    mediaType,
    schema: isPlainObject(media?.schema) ? media.schema : null,
    example: isPlainObject(media?.example) ? media.example : null,
  };
}

function evaluateOpenApiPaid(doc, catalog) {
  const routes = [];
  const paths = isPlainObject(doc.paths) ? doc.paths : {};
  for (const path of ownKeys(paths).sort()) {
    const methods = paths[path];
    if (!isPlainObject(methods)) continue;
    for (const method of ownKeys(methods).sort()) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const op = methods[method];
      if (!isPlainObject(op) || !isPlainObject(op["x-payment-info"])) continue;
      const extracted = fromOpenApiOperation(op, catalog);
      const contract = extracted.emptySuccess
        ? {
            ok: false,
            completeness: "empty_success",
            catalogEligible: false,
            mediaType: null,
            requiredPaths: [],
            propertyNames: [],
            exampleKeys: [],
            errors: [
              error("empty_openapi_success", `$.paths.${path}.${method}.responses.200`, "OpenAPI success body is empty"),
            ],
          }
        : evaluateOutputContract(extracted, catalog);
      routes.push({
        id: routeId(method, path),
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === "string" ? op.operationId : null,
        surface: "openapi",
        completeness: contract.completeness,
        catalogEligible: contract.catalogEligible,
        errors: contract.errors,
        requiredPaths: contract.requiredPaths,
        mediaType: contract.mediaType,
      });
    }
  }
  return routes;
}

function evaluateX402Items(doc, catalog) {
  const routes = [];
  for (const item of doc.items || []) {
    if (!isPlainObject(item)) continue;
    const method = String(item.request?.method || "GET").toUpperCase();
    const path = item.resource?.routeTemplate || item.resource?.path || null;
    if (typeof path !== "string" || !path) continue;
    const accept = Array.isArray(item.accepts) && isPlainObject(item.accepts[0]) ? item.accepts[0] : {};
    const bazaar = item.extensions?.bazaar;
    const unwrapped = unwrapOutputSchema(accept.outputSchema);
    const bazaarExample = bazaar?.info?.output?.example;
    const bazaarRequired = bazaar?.schema?.properties?.output?.properties?.example?.required;
    const bazaarProperties = bazaar?.schema?.properties?.output?.properties;
    const schema =
      unwrapped.schema ||
      (isPlainObject(bazaarProperties)
        ? { type: "object", properties: bazaarProperties, required: bazaarRequired }
        : Array.isArray(bazaarRequired)
          ? { type: "object", properties: {}, required: bazaarRequired }
          : null);
    const example = unwrapped.example || (isPlainObject(bazaarExample) ? bazaarExample : null);
    const inputSchema = isPlainObject(item.request?.schema) ? item.request.schema : null;
    const contract = evaluateOutputContract(
      {
        mediaType: item.resource?.mimeType || null,
        schema,
        example,
        requiredPaths: Array.isArray(bazaarRequired) ? bazaarRequired : [],
      },
      catalog,
    );
    let completeness = contract.completeness;
    if (!contract.catalogEligible && completeness === "absent" && inputSchema) {
      completeness = "input_only";
      if (!contract.errors.some((itemError) => itemError.code === "output_schema_absent")) {
        contract.errors.push(error("output_schema_absent", "$.accepts[0].outputSchema", "x402 item has input schema only"));
      }
    }
    routes.push({
      id: routeId(method, path),
      method,
      path,
      surface: "x402_manifest",
      completeness,
      catalogEligible: contract.catalogEligible,
      errors: contract.errors,
      requiredPaths: contract.requiredPaths,
      mediaType: contract.mediaType,
      inputSchema: Boolean(inputSchema),
    });
  }
  return routes;
}

function joinExact(openapiRoutes, x402Routes) {
  const byId = new Map();
  for (const route of openapiRoutes) {
    byId.set(route.id, { id: route.id, method: route.method, path: route.path, openapi: route, x402: null });
  }
  for (const route of x402Routes) {
    const existing = byId.get(route.id) || { id: route.id, method: route.method, path: route.path, openapi: null, x402: null };
    existing.x402 = route;
    byId.set(route.id, existing);
  }
  return [...byId.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((pair) => {
      const catalogEligible = Boolean(pair.openapi?.catalogEligible || pair.x402?.catalogEligible);
      const completeness = pair.x402?.catalogEligible
        ? pair.x402.completeness
        : pair.openapi?.catalogEligible
          ? pair.openapi.completeness
          : pair.x402?.completeness === "input_only" || pair.openapi?.completeness === "empty_success"
            ? pair.x402?.completeness === "input_only"
              ? "input_only"
              : pair.openapi?.completeness || pair.x402?.completeness || "absent"
            : pair.openapi?.completeness || pair.x402?.completeness || "absent";
      const errors = [...(pair.openapi?.errors || []), ...(pair.x402?.errors || [])];
      return {
        id: pair.id,
        method: pair.method,
        path: pair.path,
        completeness,
        catalogEligible,
        openapiCompleteness: pair.openapi?.completeness || "absent",
        x402Completeness: pair.x402?.completeness || "absent",
        exactJoin: Boolean(pair.openapi && pair.x402),
        errors,
      };
    });
}

function evaluateBazaar(doc, catalog) {
  return (doc.resources || [])
    .filter((item) => isPlainObject(item))
    .map((item, index) => {
      const accept = Array.isArray(item.accepts) && isPlainObject(item.accepts[0]) ? item.accepts[0] : {};
      const bazaar = item.extensions?.bazaar;
      const method = String(bazaar?.info?.input?.method || item.request?.method || "GET").toUpperCase();
      const resource = typeof item.resource === "string" ? item.resource : item.resource?.url || `resource[${index}]`;
      const unwrapped = unwrapOutputSchema(accept.outputSchema);
      const example = unwrapped.example || bazaar?.info?.output?.example || null;
      const required = bazaar?.schema?.properties?.output?.properties?.example?.required;
      const contract = evaluateOutputContract(
        {
          mediaType: item.mimeType || "application/json",
          schema: unwrapped.schema,
          example: isPlainObject(example) ? example : null,
          requiredPaths: Array.isArray(required) ? required : [],
        },
        catalog,
      );
      return {
        id: resource,
        method,
        surface: "bazaar_listing",
        completeness: contract.completeness,
        catalogEligible: contract.catalogEligible,
        errors: contract.errors,
      };
    });
}

function evaluateUsefulJobs(doc) {
  const jobs = Array.isArray(doc.jobs) ? doc.jobs : [];
  const rows = jobs.map((job, index) => {
    const id = typeof job?.id === "string" ? job.id : `job[${index}]`;
    const outputs = Array.isArray(job?.outputs) ? job.outputs.filter((item) => typeof item === "string" && item) : [];
    const requiredInputs = Array.isArray(job?.requiredInputs) ? job.requiredInputs : [];
    const ok = outputs.length > 0;
    return {
      id,
      surface: "useful_jobs_catalog",
      completeness: ok ? "named_outputs" : "absent",
      catalogEligible: false,
      outputs,
      requiredInputs,
      errors: ok
        ? []
        : [error("output_schema_absent", `$.jobs[${index}].outputs`, "job declares no named outputs")],
    };
  });
  return rows;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = String(row[key] ?? "absent");
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function summarizeRoutes(routes) {
  return {
    total: routes.length,
    catalogEligible: routes.filter((row) => row.catalogEligible).length,
    completeness: countBy(routes, "completeness"),
  };
}

export function evaluateDocument(doc, catalog = loadCatalog()) {
  const kind = detectKind(doc);
  const violations = detectCatalogOnlyViolations(doc, catalog);
  if (kind === "invalid") {
    return {
      kind,
      ok: false,
      catalogEligible: false,
      completeness: "absent",
      errors: [error("invalid_shape", "$", "document must be a plain object")],
      routes: [],
    };
  }
  if (violations.length > 0) {
    return {
      kind,
      ok: false,
      catalogEligible: false,
      completeness: "out_of_scope",
      errors: violations,
      routes: [],
    };
  }
  if (kind === "unknown" || !catalog.documentKinds.includes(kind)) {
    return {
      kind,
      ok: false,
      catalogEligible: false,
      completeness: "absent",
      errors: [error("unknown_document_kind", "$.kind", "document kind is not a catalog-only output contract")],
      routes: [],
    };
  }

  if (kind === "single_route") {
    const contract = evaluateOutputContract(
      {
        mediaType: doc.mediaType,
        schema: doc.schema || doc.outputSchema,
        example: doc.example,
        requiredPaths: doc.requiredPaths,
        resolvedSchema: doc.resolvedSchema,
      },
      catalog,
    );
    return {
      kind,
      ok: contract.ok,
      catalogEligible: contract.catalogEligible,
      completeness: contract.completeness,
      errors: contract.errors,
      mediaType: contract.mediaType,
      requiredPaths: contract.requiredPaths,
      propertyNames: contract.propertyNames,
      routes: [
        {
          id: routeId(doc.method, doc.path),
          method: String(doc.method).toUpperCase(),
          path: doc.path,
          surface: "single_route",
          completeness: contract.completeness,
          catalogEligible: contract.catalogEligible,
          errors: contract.errors,
        },
      ],
    };
  }

  if (kind === "openapi") {
    const routes = evaluateOpenApiPaid(doc, catalog);
    const catalogEligible = routes.length > 0 && routes.every((row) => row.catalogEligible);
    return {
      kind,
      ok: catalogEligible,
      catalogEligible,
      completeness: catalogEligible ? "complete" : routes[0]?.completeness || "absent",
      errors: routes.flatMap((row) => row.errors),
      summary: summarizeRoutes(routes),
      routes,
    };
  }

  if (kind === "x402_manifest") {
    const routes = evaluateX402Items(doc, catalog);
    const catalogEligible = routes.length > 0 && routes.every((row) => row.catalogEligible);
    return {
      kind,
      ok: catalogEligible,
      catalogEligible,
      completeness: catalogEligible ? "complete" : routes[0]?.completeness || "absent",
      errors: routes.flatMap((row) => row.errors),
      summary: summarizeRoutes(routes),
      routes,
    };
  }

  if (kind === "bazaar_listing") {
    const routes = evaluateBazaar(doc, catalog);
    const catalogEligible = routes.length > 0 && routes.every((row) => row.catalogEligible);
    return {
      kind,
      ok: catalogEligible,
      catalogEligible,
      completeness: catalogEligible ? "complete" : "absent",
      errors: routes.flatMap((row) => row.errors),
      summary: summarizeRoutes(routes),
      routes,
    };
  }

  if (kind === "useful_jobs_catalog") {
    const routes = evaluateUsefulJobs(doc);
    return {
      kind,
      ok: false,
      catalogEligible: false,
      completeness: "named_outputs",
      errors: [
        error(
          "output_schema_absent",
          "$.jobs",
          "named output filenames are not a typed catalog output schema",
        ),
        ...routes.flatMap((row) => row.errors),
      ],
      summary: summarizeRoutes(routes),
      routes,
    };
  }

  if (kind === "conformance_crawl" || kind === "verified_feed" || kind === "unpaid_402_observation") {
    return {
      kind,
      ok: false,
      catalogEligible: false,
      completeness: "observation_only",
      errors: [
        error(
          "observation_is_not_catalog_declaration",
          "$",
          "unpaid-402 or crawl observations are not catalog-document eligibility",
        ),
      ],
      routes: [],
    };
  }

  if (kind === "buyer_runtime_catalog") {
    const paths = Array.isArray(doc.contract?.outputGuaranteedPaths) ? doc.contract.outputGuaranteedPaths : [];
    const published = Array.isArray(doc.publishedExtractContract?.outputGuaranteedPaths)
      ? doc.publishedExtractContract.outputGuaranteedPaths
      : [];
    return {
      kind,
      ok: false,
      catalogEligible: false,
      completeness: "required_paths",
      errors: [
        error("output_schema_absent", "$.contract.outputGuaranteedPaths", "a required-path pin is not a typed schema"),
      ],
      requiredPaths: paths,
      publishedPaths: published,
      routes: [
        {
          id: routeId(doc.route?.method || "GET", doc.route?.path || "/extract"),
          method: String(doc.route?.method || "GET").toUpperCase(),
          path: doc.route?.path || "/extract",
          surface: "buyer_runtime_catalog",
          completeness: "required_paths",
          catalogEligible: false,
          requiredPaths: paths,
        },
      ],
    };
  }

  return {
    kind,
    ok: false,
    catalogEligible: false,
    completeness: "absent",
    errors: [error("unknown_document_kind", "$.kind", "unhandled document kind")],
    routes: [],
  };
}

export function evaluateFile(filePath, catalog = loadCatalog()) {
  let doc;
  try {
    doc = loadJson(filePath);
  } catch (cause) {
    return {
      file: filePath,
      ok: false,
      catalogEligible: false,
      completeness: "absent",
      errors: [error("invalid_shape", filePath, String(cause.message || cause))],
    };
  }
  const result = evaluateDocument(doc, catalog);
  return { file: filePath, ...result };
}

function readConsumerFile(relPath, catalog) {
  const filePath = join(ROOT, relPath);
  try {
    return { digest: fileDigest(filePath), doc: loadJson(filePath) };
  } catch (cause) {
    throw Object.assign(new Error(`consumer_evidence_missing:${relPath}`), {
      errors: [error("consumer_evidence_missing", relPath, String(cause.message || cause))],
      catalog,
    });
  }
}

function consumerEvidenceFailure(catalog, errors) {
  return {
    schemaVersion: catalog.reportSchemaVersion,
    mode: "catalog-only",
    ok: false,
    fetched: false,
    paid: false,
    registryWrite: false,
    catalogEligible: false,
    errors,
  };
}

export function evaluateSdsConsumerEvidence(catalog = loadCatalog()) {
  const pins = catalog.consumerEvidence;
  if (!pins || typeof pins !== "object") {
    return consumerEvidenceFailure(catalog, [
      error("consumer_evidence_missing", "$.consumerEvidence", "catalog must declare consumerEvidence paths"),
    ]);
  }
  let openapi;
  let x402;
  let bazaar;
  let crawl;
  let buyer;
  let jobs;
  let observationFiles;
  try {
    openapi = readConsumerFile(pins.openapi, catalog);
    x402 = readConsumerFile(pins.x402, catalog);
    bazaar = readConsumerFile(pins.bazaar, catalog);
    crawl = readConsumerFile(pins.conformanceCrawl, catalog);
    buyer = readConsumerFile(pins.buyerRuntimeCatalog, catalog);
    jobs = readConsumerFile(pins.usefulJobsCatalog, catalog);
    observationFiles = listJsonFiles(join(ROOT, pins.verifiedFeedObservations));
  } catch (cause) {
    return consumerEvidenceFailure(catalog, cause.errors || [
      error("consumer_evidence_missing", "$", String(cause.message || cause)),
    ]);
  }
  let observations;
  try {
    observations = observationFiles.map((filePath) => ({
      digest: fileDigest(filePath),
      result: evaluateDocument(loadJson(filePath), catalog),
    }));
  } catch (cause) {
    return consumerEvidenceFailure(catalog, [
      error("consumer_evidence_missing", pins.verifiedFeedObservations, String(cause.message || cause)),
    ]);
  }

  const openapiEval = evaluateDocument(openapi.doc, catalog);
  const x402Eval = evaluateDocument(x402.doc, catalog);
  const joined = joinExact(openapiEval.routes || [], x402Eval.routes || []);
  const bazaarEval = evaluateDocument(bazaar.doc, catalog);
  const crawlEval = evaluateDocument(crawl.doc, catalog);
  const buyerEval = evaluateDocument(buyer.doc, catalog);
  const jobsEval = evaluateDocument(jobs.doc, catalog);

  const crawlRoutes = Array.isArray(crawl.doc.routes) ? crawl.doc.routes : [];
  const observationPresent = crawlRoutes.filter((row) => row.unpaid402OutputSchemaPresent).length;

  const catalogEligible = joined.length > 0 && joined.every((row) => row.catalogEligible);
  return {
    schemaVersion: catalog.reportSchemaVersion,
    mode: "catalog-only",
    ok: true,
    fetched: false,
    paid: false,
    registryWrite: false,
    catalogEligible,
    prohibitedInferences: catalog.prohibitedInferences,
    limitations: [
      "Catalog-only. Committed SDS consumer documents are read from this repository. No origin is fetched.",
      "Empty OpenAPI 200 objects in the presence catalog extract are empty_success, not output contracts.",
      "x402 well-known items with request schemas and no outputSchema are input_only.",
      "Unpaid 402 crawl fields are observation_only and do not make a catalog document eligible.",
      "Buyer-runtime guaranteed paths are a pin of names, not a typed catalog schema.",
      "Useful-jobs catalog outputs are filenames, not JSON Schema.",
      "This report is not settlement, demand, paid delivery, or registry proof.",
    ],
    sources: [
      openapi.digest,
      x402.digest,
      bazaar.digest,
      crawl.digest,
      buyer.digest,
      jobs.digest,
      ...observations.map((item) => item.digest),
    ],
    originCatalog: {
      openapiVersion: openapi.doc.info?.version || null,
      title: openapi.doc.info?.title || null,
      x402Version: x402.doc.x402Version ?? null,
      paidOperations: openapiEval.routes.length,
      x402Items: x402Eval.routes.length,
      exactJoins: joined.filter((row) => row.exactJoin).length,
      catalogEligible,
      summary: summarizeRoutes(joined),
      routes: joined,
    },
    bazaarListings: {
      resourceCount: bazaarEval.routes.length,
      catalogEligible: bazaarEval.catalogEligible,
      summary: summarizeRoutes(bazaarEval.routes),
    },
    consumerObservations: {
      completeness: "observation_only",
      catalogEligible: false,
      crawlSchemaVersion: crawl.doc.schemaVersion || null,
      crawlRoutes: crawlRoutes.length,
      unpaid402OutputSchemaPresent: observationPresent,
      errors: crawlEval.errors,
      verifiedFeedObservations: observations.length,
    },
    buyerRuntimePin: {
      completeness: buyerEval.completeness,
      catalogEligible: false,
      product: buyer.doc.route?.product || null,
      guaranteedPaths: buyerEval.requiredPaths || [],
      publishedPaths: buyerEval.publishedPaths || [],
      errors: buyerEval.errors,
    },
    usefulJobsCatalog: {
      completeness: "named_outputs",
      catalogEligible: false,
      version: jobs.doc.version || null,
      jobs: jobsEval.routes.length,
      withNamedOutputs: jobsEval.routes.filter((row) => row.outputs?.length).length,
      purchaseAuthority: jobs.doc.runtime?.purchaseAuthority === true,
      errors: jobsEval.errors.slice(0, 1),
    },
  };
}

export function runSuite(catalog = loadCatalog()) {
  const results = [];
  for (const filePath of listJsonFiles(validFixtureDir())) {
    const result = evaluateFile(filePath, catalog);
    results.push({
      filePath,
      expect: "accept",
      ok: result.ok === true && result.catalogEligible === true,
      codes: (result.errors || []).map((item) => item.code),
      result,
    });
  }
  const manifest = loadInvalidManifest();
  for (const filePath of listJsonFiles(invalidFixtureDir())) {
    const name = filePath.split("/").pop();
    const expectedCode = manifest[name]?.code;
    const result = evaluateFile(filePath, catalog);
    const codes = (result.errors || []).map((item) => item.code);
    results.push({
      filePath,
      expect: "reject",
      expectedCode,
      ok: result.ok === false && result.catalogEligible === false && expectedCode && codes.includes(expectedCode),
      codes,
      result,
    });
  }
  const failed = results.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    passed: results.length - failed.length,
    failed: failed.length,
    total: results.length,
    results,
  };
}
