import { cliRefuse } from "./errors.mjs";

export const JSON_LIMITS = Object.freeze({
  maxInputBytes: 16 * 1024 * 1024,
  maxDepth: 128,
  maxMembers: 100_000,
  maxArrayElements: 100_000,
  maxKeyChars: 4_096,
});

function resourceLimit(label, resource, limit, observed) {
  throw cliRefuse("resource-limit", `${label} exceeds the ${resource} limit (${limit})`, {
    label,
    resource,
    limit,
    observed,
  });
}

function shortPath(path) {
  return path.length <= 240 ? path : `${path.slice(0, 237)}...`;
}

/**
 * Validate JSON structure before JSON.parse so duplicate object members cannot
 * silently become last-write-wins pins. This scanner also places finite bounds
 * on nesting and member count. JSON.parse remains the authoritative decoder.
 */
export function assertJsonInputSize(text, { label = "lockfile" } = {}) {
  const raw = String(text ?? "");
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > JSON_LIMITS.maxInputBytes) {
    resourceLimit(label, "input-bytes", JSON_LIMITS.maxInputBytes, bytes);
  }
  return bytes;
}

export function inspectJsonStructure(text, { label = "lockfile" } = {}) {
  const raw = String(text ?? "");
  const bytes = assertJsonInputSize(raw, { label });

  let i = 0;
  let members = 0;
  let arrayElements = 0;

  const refuseSyntax = (message) => {
    throw cliRefuse("parse-error", `${label} is not JSON: ${message} at offset ${i}`, {
      label,
      offset: i,
    });
  };

  const whitespace = () => {
    while (i < raw.length && /[\u0009\u000a\u000d\u0020]/.test(raw[i])) i += 1;
  };

  const parseString = (decode) => {
    if (raw[i] !== '"') refuseSyntax("expected string");
    const start = i;
    i += 1;
    while (i < raw.length) {
      const code = raw.charCodeAt(i);
      if (code === 0x22) {
        i += 1;
        const token = raw.slice(start, i);
        if (!decode) return null;
        try {
          return JSON.parse(token);
        } catch {
          refuseSyntax("invalid string escape");
        }
      }
      if (code < 0x20) refuseSyntax("unescaped control character in string");
      if (code === 0x5c) {
        i += 1;
        if (i >= raw.length) refuseSyntax("unterminated string escape");
        if (raw[i] === "u") {
          const hex = raw.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) refuseSyntax("invalid unicode escape");
          i += 5;
          continue;
        }
        if (!/^["\\/bfnrt]$/.test(raw[i])) refuseSyntax("invalid string escape");
      }
      i += 1;
    }
    refuseSyntax("unterminated string");
  };

  const parseNumber = () => {
    if (raw[i] === "-") i += 1;
    if (raw[i] === "0") i += 1;
    else {
      if (!/[1-9]/.test(raw[i] || "")) refuseSyntax("invalid number");
      while (/[0-9]/.test(raw[i] || "")) i += 1;
    }
    if (raw[i] === ".") {
      i += 1;
      if (!/[0-9]/.test(raw[i] || "")) refuseSyntax("invalid number fraction");
      while (/[0-9]/.test(raw[i] || "")) i += 1;
    }
    if (raw[i] === "e" || raw[i] === "E") {
      i += 1;
      if (raw[i] === "+" || raw[i] === "-") i += 1;
      if (!/[0-9]/.test(raw[i] || "")) refuseSyntax("invalid number exponent");
      while (/[0-9]/.test(raw[i] || "")) i += 1;
    }
  };

  const pathFor = (parent, key) => {
    const segment = /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key)
      ? `.${key}`
      : `[${JSON.stringify(key.slice(0, 80))}]`;
    return shortPath(`${parent}${segment}`);
  };

  const parseValue = (depth, path) => {
    whitespace();
    if (depth > JSON_LIMITS.maxDepth) {
      resourceLimit(label, "json-depth", JSON_LIMITS.maxDepth, depth);
    }
    const c = raw[i];
    if (c === "{") {
      i += 1;
      whitespace();
      const keys = new Set();
      if (raw[i] === "}") {
        i += 1;
        return;
      }
      while (i < raw.length) {
        const key = parseString(true);
        if (key.length > JSON_LIMITS.maxKeyChars) {
          resourceLimit(label, "json-key-chars", JSON_LIMITS.maxKeyChars, key.length);
        }
        members += 1;
        if (members > JSON_LIMITS.maxMembers) {
          resourceLimit(label, "json-members", JSON_LIMITS.maxMembers, members);
        }
        if (keys.has(key)) {
          throw cliRefuse("duplicate-json-key", `${label} contains duplicate JSON member ${JSON.stringify(key)}`, {
            label,
            path: shortPath(path),
            key,
          });
        }
        keys.add(key);
        whitespace();
        if (raw[i] !== ":") refuseSyntax("expected ':' after object member");
        i += 1;
        parseValue(depth + 1, pathFor(path, key));
        whitespace();
        if (raw[i] === "}") {
          i += 1;
          return;
        }
        if (raw[i] !== ",") refuseSyntax("expected ',' or '}'");
        i += 1;
        whitespace();
      }
      refuseSyntax("unterminated object");
    }
    if (c === "[") {
      i += 1;
      whitespace();
      if (raw[i] === "]") {
        i += 1;
        return;
      }
      let index = 0;
      while (i < raw.length) {
        arrayElements += 1;
        if (arrayElements > JSON_LIMITS.maxArrayElements) {
          resourceLimit(label, "json-array-elements", JSON_LIMITS.maxArrayElements, arrayElements);
        }
        parseValue(depth + 1, shortPath(`${path}[${index}]`));
        index += 1;
        whitespace();
        if (raw[i] === "]") {
          i += 1;
          return;
        }
        if (raw[i] !== ",") refuseSyntax("expected ',' or ']'");
        i += 1;
        whitespace();
      }
      refuseSyntax("unterminated array");
    }
    if (c === '"') {
      parseString(false);
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (raw.startsWith(literal, i)) {
        i += literal.length;
        return;
      }
    }
    if (c === "-" || /[0-9]/.test(c || "")) {
      parseNumber();
      return;
    }
    refuseSyntax("unexpected token");
  };

  parseValue(0, "$");
  whitespace();
  if (i !== raw.length) refuseSyntax("unexpected trailing content");
  return { bytes, members, arrayElements };
}
