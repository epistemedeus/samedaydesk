import { jsonType } from "./kind.mjs";
import { remoteRefsInNode, resolveLocalRef } from "./refs.mjs";

function normalizeType(type) {
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return [...type].map(String).sort();
  return null;
}

function intOrNull(value) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function sortedStrings(value) {
  if (!Array.isArray(value)) return null;
  return [...value].map(String).sort();
}

function stableLiteral(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

export function fingerprintSchemaNode(node, doc) {
  if (node === undefined) return { kind: "absent" };
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return { kind: "literal", jsonType: jsonType(node) };
  }

  const remote = remoteRefsInNode(node);
  if (remote.length) {
    return { kind: "remote-ref", refuse: true, refs: remote };
  }

  if (typeof node.$ref === "string") {
    const resolved = resolveLocalRef(doc, node.$ref);
    if (resolved.remote) {
      return { kind: "remote-ref", refuse: true, refs: [node.$ref] };
    }
    if (!resolved.ok) {
      return {
        kind: "unresolved-local-ref",
        ref: node.$ref,
        missing: Boolean(resolved.missing),
        cycle: Boolean(resolved.cycle),
        truncated: Boolean(resolved.truncated),
      };
    }
    const target = fingerprintSchemaNode(resolved.value, doc);
    return { kind: "local-ref", ref: node.$ref, target };
  }

  return {
    kind: "schema-object",
    type: normalizeType(node.type),
    format: typeof node.format === "string" ? node.format : null,
    enum: Array.isArray(node.enum) ? [...node.enum].map(stableLiteral).sort() : null,
    constJson: Object.prototype.hasOwnProperty.call(node, "const") ? stableLiteral(node.const) : null,
    required: sortedStrings(node.required),
    additionalProperties:
      typeof node.additionalProperties === "boolean" ? node.additionalProperties : node.additionalProperties === undefined ? null : "schema",
    propertiesKeys:
      node.properties && typeof node.properties === "object" && !Array.isArray(node.properties)
        ? Object.keys(node.properties).sort()
        : null,
    itemsType: node.items && typeof node.items === "object" ? normalizeType(node.items.type) : null,
    minLength: intOrNull(node.minLength),
    maxLength: intOrNull(node.maxLength),
    minimum: intOrNull(node.minimum),
    maximum: intOrNull(node.maximum),
    minItems: intOrNull(node.minItems),
    maxItems: intOrNull(node.maxItems),
    nullable: node.nullable === true,
  };
}

export function fingerprintExampleNode(node) {
  if (node === undefined) return { kind: "absent" };
  return {
    kind: "example-value",
    jsonType: jsonType(node),
    valueJson: stableLiteral(node),
  };
}

export function fingerprintUsedNode(node, doc, kind) {
  if (kind === "json-schema") return fingerprintSchemaNode(node, doc);
  return fingerprintExampleNode(node);
}

function fpKey(fp) {
  return JSON.stringify(fp ?? null);
}

function typeChanged(beforeFp, afterFp) {
  if (beforeFp.kind === "schema-object" && afterFp.kind === "schema-object") {
    return JSON.stringify(beforeFp.type) !== JSON.stringify(afterFp.type);
  }
  if (beforeFp.kind === "example-value" && afterFp.kind === "example-value") {
    return beforeFp.jsonType !== afterFp.jsonType;
  }
  if (beforeFp.kind === "literal" && afterFp.kind === "example-value") {
    return beforeFp.jsonType !== afterFp.jsonType;
  }
  return false;
}

export function classifyPair(beforeFp, afterFp) {
  if (beforeFp?.refuse || afterFp?.refuse) {
    return { class: "remote-ref", reason: "remote-ref" };
  }
  if (beforeFp?.kind === "absent" && afterFp?.kind === "absent") {
    return { class: "unknown", reason: "absent-in-both" };
  }
  if (beforeFp?.kind === "absent") {
    return { class: "added", reason: "present-after-only" };
  }
  if (afterFp?.kind === "absent") {
    return { class: "deleted", reason: "present-before-only" };
  }
  if (fpKey(beforeFp) === fpKey(afterFp)) {
    return { class: "unchanged", reason: "structural-equal" };
  }
  if (typeChanged(beforeFp, afterFp)) {
    return { class: "breaking", reason: "type-change" };
  }
  if (beforeFp.kind === "example-value" && afterFp.kind === "example-value") {
    return { class: "informational", reason: "value-change" };
  }
  if (beforeFp.kind === "unresolved-local-ref" || afterFp.kind === "unresolved-local-ref") {
    return { class: "unknown", reason: "unresolved-local-ref" };
  }
  return { class: "breaking", reason: "structural-change" };
}
