export function looksJsonText(value) {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

/**
 * Classify a CLI/library input value the way D01 materializeInputs does:
 * object, inline JSON text, or filesystem path. Does not copy that module.
 */
export function classifyInputValue(value) {
  if (value == null || value === false || value === "") {
    return { kind: "empty" };
  }
  if (typeof value === "object") {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    return { kind: "json-value", text, value };
  }
  if (typeof value === "string" && looksJsonText(value)) {
    return { kind: "json-text", text: value };
  }
  if (typeof value === "string") {
    return { kind: "path", path: value };
  }
  return { kind: "invalid", value };
}
