import Ajv from "ajv";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false,
  allowUnionTypes: true,
});

const compiled = new Map();

export function typesOf(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node.type)) return node.type.filter((item) => typeof item === "string");
  if (typeof node.type === "string") return [node.type];
  return [];
}

function fail(reason) {
  return { ok: false, reason };
}

export function walkRequired(schema, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (parts.length === 0) return fail("path_absent");
  let node = schema;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!node || typeof node !== "object" || Array.isArray(node)) return fail(`path_absent:${path}`);
    const types = typesOf(node);
    if (types.length > 0 && !types.includes("object")) return fail(`path_absent:${path}`);
    const properties = node.properties;
    if (!properties || typeof properties !== "object" || !Object.prototype.hasOwnProperty.call(properties, part)) {
      return fail(`path_absent:${path}`);
    }
    if (!Array.isArray(node.required) || !node.required.includes(part)) return fail(`path_optional:${path}`);
    node = properties[part];
  }
  return { ok: true, node };
}

function typeOk(node, spec) {
  if (spec.type == null) return true;
  const want = Array.isArray(spec.type) ? spec.type : [spec.type];
  const got = typesOf(node);
  if (got.length === 0) return false;
  return want.every((type) => got.includes(type));
}

export function supportsOutput(schema, requiredOutput) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return fail("output_contract_absent");
  const paths = requiredOutput?.paths;
  if (!Array.isArray(paths) || paths.length === 0) return fail("output_contract_absent");
  for (const spec of paths) {
    if (!spec || typeof spec.path !== "string") return fail("path_absent");
    const walked = walkRequired(schema, spec.path);
    if (!walked.ok) return walked;
    if (!typeOk(walked.node, spec)) return fail(`type_mismatch:${spec.path}`);
    if (spec.const !== undefined && walked.node.const !== spec.const) return fail(`const_mismatch:${spec.path}`);
    if (Array.isArray(spec.enum)) {
      if (!Array.isArray(walked.node.enum)) return fail(`enum_unsupported:${spec.path}`);
      for (const value of spec.enum) {
        if (!walked.node.enum.includes(value)) return fail(`enum_mismatch:${spec.path}`);
      }
    }
    if (spec.items) {
      const itemTypes = typesOf(walked.node);
      if (!itemTypes.includes("array")) return fail(`type_mismatch:${spec.path}`);
      const item = walked.node.items;
      if (!item || typeof item !== "object" || Array.isArray(item)) return fail(`items_absent:${spec.path}`);
      for (const field of spec.items.required || []) {
        if (!Array.isArray(item.required) || !item.required.includes(field)) {
          return fail(`item_field_absent:${spec.path}:${field}`);
        }
        if (!item.properties || !Object.prototype.hasOwnProperty.call(item.properties, field)) {
          return fail(`item_field_absent:${spec.path}:${field}`);
        }
      }
    }
  }
  if (requiredOutput.witness !== undefined) {
    const checked = validateInstance(schema, requiredOutput.witness);
    if (!checked.ok) return fail(checked.reason === "schema_unsupported" ? "schema_unsupported" : "witness_rejected");
  }
  return { ok: true, reason: "output_supported" };
}

export function compileSchema(schema) {
  const key = JSON.stringify(schema);
  if (compiled.has(key)) return compiled.get(key);
  let validator = null;
  try {
    validator = ajv.compile(schema);
  } catch {
    validator = null;
  }
  compiled.set(key, validator);
  return validator;
}

export function validateInstance(schema, instance) {
  if (!schema || typeof schema !== "object") return fail("output_contract_absent");
  const validator = compileSchema(schema);
  if (!validator) return fail("schema_unsupported");
  const ok = validator(instance);
  if (!ok) return { ok: false, reason: "witness_rejected", errors: validator.errors || [] };
  return { ok: true, reason: "instance_valid" };
}

export const OPENAPI_DOCUMENT_SCHEMA = {
  type: "object",
  required: ["openapi", "info", "paths"],
  additionalProperties: true,
  properties: {
    openapi: { type: "string" },
    info: {
      type: "object",
      required: ["title", "version"],
      properties: {
        title: { type: "string" },
        version: { type: "string" },
      },
    },
    paths: { type: "object" },
  },
};

export const X402_DOCUMENT_SCHEMA = {
  type: "object",
  required: ["x402Version", "items"],
  additionalProperties: true,
  properties: {
    x402Version: {},
    lastUpdated: {},
    items: { type: "array" },
  },
};
