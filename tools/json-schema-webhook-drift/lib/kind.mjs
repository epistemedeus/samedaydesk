const SCHEMA_TYPES = new Set(["string", "number", "integer", "object", "array", "boolean", "null"]);

function isSchemaType(value) {
  if (typeof value === "string") return SCHEMA_TYPES.has(value);
  if (Array.isArray(value)) return value.length > 0 && value.every((item) => SCHEMA_TYPES.has(item));
  return false;
}

export function detectKind(doc) {
  if (typeof doc === "boolean") return "json-schema";
  if (doc === null || typeof doc !== "object") return "invalid";
  if (Array.isArray(doc)) return "webhook-example";
  if (typeof doc.openapi === "string" || typeof doc.swagger === "string") return "openapi";
  if (typeof doc.$schema === "string") return "json-schema";
  if (isSchemaType(doc.type) && doc.properties && typeof doc.properties === "object" && !Array.isArray(doc.properties)) {
    return "json-schema";
  }
  if (doc.$defs && typeof doc.$defs === "object") return "json-schema";
  if (doc.definitions && typeof doc.definitions === "object") return "json-schema";
  return "webhook-example";
}

export function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function looksLikeHtmlOrMarkup(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed.startsWith("<") || trimmed.startsWith("<!");
}

export function looksLikeYamlDocument(text) {
  const trimmed = String(text ?? "").trim();
  try {
    JSON.parse(trimmed);
    return false;
  } catch {
    // Continue with the intentionally small YAML/plain-text refusal heuristic.
  }
  return trimmed.startsWith("---") || (trimmed.length > 0 && !trimmed.startsWith("{") && !trimmed.startsWith("["));
}
