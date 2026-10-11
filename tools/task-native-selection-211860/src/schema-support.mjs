import Ajv from "ajv";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false,
  allowUnionTypes: true,
});

const compiled = new Map();

const COMBINATORS = ["anyOf", "oneOf", "allOf", "not", "$ref", "if", "then", "else", "dependentSchemas", "patternProperties"];

export function typesOf(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node.type)) return node.type.filter((item) => typeof item === "string");
  if (typeof node.type === "string") return [node.type];
  return [];
}

function hasCombinator(node) {
  return Boolean(node && typeof node === "object" && COMBINATORS.some((key) => Object.prototype.hasOwnProperty.call(node, key)));
}

export function producedTypes(node) {
  const types = typesOf(node);
  if (node?.nullable === true) {
    if (types.length === 0 || types.includes("null")) return types;
    return [...types, "null"];
  }
  return types;
}

function fail(reason) {
  return { ok: false, reason, spec: "allowed_output_set", claim: "refused" };
}

function sameValue(left, right) {
  return Object.is(left, right);
}

export function walkRequired(schema, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (parts.length === 0) return fail("path_absent");
  let node = schema;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!node || typeof node !== "object" || Array.isArray(node)) return fail(`path_absent:${path}`);
    if (hasCombinator(node) || (node.nullable != null && typeof node.nullable !== "boolean")) {
      return fail(`schema_unsupported:${path}`);
    }
    const types = producedTypes(node);
    if (types.includes("null") || (types.length > 0 && types.some((type) => type !== "object"))) {
      return fail(`path_not_guaranteed:${path}`);
    }
    const properties = node.properties;
    if (!properties || typeof properties !== "object" || !Object.prototype.hasOwnProperty.call(properties, part)) {
      return fail(`path_absent:${path}`);
    }
    if (!Array.isArray(node.required) || !node.required.includes(part)) return fail(`path_optional:${path}`);
    node = properties[part];
  }
  return { ok: true, node };
}

function constraintOn(node, spec, path) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return fail(`path_absent:${path}`);
  if (node.nullable != null && typeof node.nullable !== "boolean") return fail(`schema_unsupported:${path}`);
  const wantsType = spec.type != null;
  const wantsEnum = Array.isArray(spec.enum);
  const wantsConst = Object.prototype.hasOwnProperty.call(spec, "const");
  if ((wantsType || wantsEnum || wantsConst) && hasCombinator(node)) return fail(`schema_unsupported:${path}`);
  if (wantsType) {
    const want = Array.isArray(spec.type) ? spec.type : [spec.type];
    if (want.length === 0 || want.some((type) => typeof type !== "string" || type.length === 0)) {
      return fail(`type_unknown:${path}`);
    }
    const got = producedTypes(node);
    if (got.length === 0) return fail(`type_unknown:${path}`);
    if (!got.every((type) => want.includes(type))) return fail(`type_not_guaranteed:${path}`);
  }
  if (wantsConst && !sameValue(node.const, spec.const)) return fail(`const_mismatch:${path}`);
  if (wantsEnum) {
    if (Array.isArray(node.enum)) {
      if (node.enum.length === 0) return fail(`enum_unknown:${path}`);
      if (!node.enum.every((value) => spec.enum.some((allowed) => sameValue(allowed, value)))) {
        return fail(`enum_not_guaranteed:${path}`);
      }
    } else if (Object.prototype.hasOwnProperty.call(node, "const")) {
      if (!spec.enum.some((allowed) => sameValue(allowed, node.const))) return fail(`enum_not_guaranteed:${path}`);
    } else {
      return fail(`enum_unknown:${path}`);
    }
  }
  return { ok: true };
}

export function supportsOutput(schema, requiredOutput) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return fail("output_contract_absent");
  const paths = requiredOutput?.paths;
  if (!Array.isArray(paths) || paths.length === 0) return fail("output_contract_absent");
  for (const spec of paths) {
    if (!spec || typeof spec.path !== "string") return fail("path_absent");
    const walked = walkRequired(schema, spec.path);
    if (!walked.ok) return walked;
    const checked = constraintOn(walked.node, spec, spec.path);
    if (!checked.ok) return checked;
    if (spec.items) {
      const item = walked.node.items;
      if (!item || typeof item !== "object" || Array.isArray(item)) return fail(`items_absent:${spec.path}`);
      if (hasCombinator(item) || (item.nullable != null && typeof item.nullable !== "boolean")) {
        return fail(`schema_unsupported:${spec.path}`);
      }
      const itemTypes = producedTypes(walked.node);
      if (!itemTypes.includes("array") || itemTypes.some((type) => type !== "array")) {
        return fail(itemTypes.length === 0 ? `type_unknown:${spec.path}` : `type_not_guaranteed:${spec.path}`);
      }
      for (const field of spec.items.required || []) {
        if (!Array.isArray(item.required) || !item.required.includes(field)) {
          return fail(`item_field_absent:${spec.path}:${field}`);
        }
        if (!item.properties || !Object.prototype.hasOwnProperty.call(item.properties, field)) {
          return fail(`item_field_absent:${spec.path}:${field}`);
        }
        const constraint = spec.items.properties?.[field];
        if (constraint && typeof constraint === "object") {
          const fieldChecked = constraintOn(item.properties[field], constraint, `${spec.path}.${field}`);
          if (!fieldChecked.ok) return fieldChecked;
        }
      }
    }
  }
  if (requiredOutput.witness !== undefined) {
    const checked = validateInstance(schema, requiredOutput.witness);
    if (!checked.ok) return fail(checked.reason === "schema_unsupported" ? "schema_unsupported" : "witness_rejected");
  }
  return { ok: true, reason: "output_supported", spec: "allowed_output_set", claim: "demonstrated_guarantee" };
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
