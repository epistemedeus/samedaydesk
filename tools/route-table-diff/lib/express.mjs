import { METHODS } from "node:http";
import { refused } from "./errors.mjs";

const EXPRESS_NAME = "express";
const EXPRESS_MAJOR = 5;
const METHOD_SET = new Set(METHODS.map((method) => method.toUpperCase()));
const METHOD_PREFERENCE = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED = new Set(["{", "}", "(", ")", "[", "]", "+", "?", "!", ":", "*"]);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseMajor(value) {
  if (value === EXPRESS_MAJOR || value === String(EXPRESS_MAJOR)) return EXPRESS_MAJOR;
  if (typeof value === "string" && /^5(?:\.|$)/.test(value)) return EXPRESS_MAJOR;
  return null;
}

export function frameworkConfigOf(envelope) {
  if (!isPlainObject(envelope) || !Object.prototype.hasOwnProperty.call(envelope, "framework")) return null;
  const framework = envelope.framework;
  if (!isPlainObject(framework)) {
    refused(
      "unsupported_catalog",
      "Framework catalogs require framework: {name, major}. Unmarked method/path records remain unsupported.",
      { framework },
    );
  }
  const name = typeof framework.name === "string" ? framework.name.toLowerCase() : "";
  const major = parseMajor(framework.major ?? framework.version);
  if (name !== EXPRESS_NAME || major !== EXPRESS_MAJOR) {
    refused(
      "unsupported_catalog",
      "Only explicitly marked Express 5 route catalogs are supported. Unknown frameworks or versions are refused, not reported as no-change.",
      { framework },
    );
  }

  const settings = envelope.settings;
  if (!isPlainObject(settings) || typeof settings.caseSensitive !== "boolean" || typeof settings.strict !== "boolean") {
    refused(
      "unsupported_catalog",
      "Express catalogs must record boolean settings.caseSensitive and settings.strict so matcher semantics are not guessed.",
      { settings: settings ?? null },
    );
  }

  return {
    kind: "express",
    name: EXPRESS_NAME,
    major,
    caseSensitive: settings.caseSensitive,
    strict: settings.strict,
  };
}

function parseParameterName(value, prefix, path) {
  const source = value.slice(prefix.length);
  if (IDENTIFIER.test(source)) return source;
  if (source.startsWith('"') && source.endsWith('"')) {
    try {
      const decoded = JSON.parse(source);
      if (typeof decoded === "string" && decoded.length > 0 && !decoded.includes("/")) return decoded;
    } catch {
      // Refuse below with the same bounded public detail.
    }
  }
  refused(
    "unsupported_express_path",
    "Express parameter and wildcard names must be an ASCII identifier or a non-empty quoted name in the supported subset.",
    { path },
  );
}

function staticSegment(segment, path, caseSensitive) {
  let value = "";
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (char === "\\") {
      const next = segment[index + 1];
      if (next == null || next === "/") {
        refused(
          "unsupported_express_path",
          "A trailing escape or escaped slash is outside the supported Express path subset.",
          { path },
        );
      }
      value += next;
      index += 1;
      continue;
    }
    if (RESERVED.has(char)) {
      refused(
        "unsupported_express_path",
        "Express optional groups and mixed literal/parameter segments are outside the supported subset; escape reserved literal characters.",
        { path },
      );
    }
    const code = char.codePointAt(0);
    if (code < 0x20 || code > 0x7e) {
      refused(
        "unsupported_express_path",
        "Non-ASCII Express literals are outside the matcher-proved subset.",
        { path },
      );
    }
    value += char;
  }
  return { kind: "literal", value: caseSensitive ? value : value.toLowerCase() };
}

function parseSegment(segment, path, caseSensitive) {
  if (segment.startsWith(":")) {
    parseParameterName(segment, ":", path);
    return { kind: "parameter" };
  }
  if (segment.startsWith("*")) {
    parseParameterName(segment, "*", path);
    return { kind: "wildcard" };
  }
  return staticSegment(segment, path, caseSensitive);
}

/**
 * Dependency-free semantic subset of Express 5 string route paths.
 *
 * Supported: ASCII literal segments (including escaped reserved characters),
 * whole-segment named parameters, a final named wildcard, and root-inclusive
 * /{*name}. Other path-to-regexp grammar is refused rather than approximated.
 */
export function parseExpressPath(path, config) {
  if (typeof path !== "string" || path.length === 0) {
    refused("pathless_record", "Express route records require a non-empty string path", { path });
  }
  if (!path.startsWith("/")) {
    refused("invalid_path", "Express route paths must start with /", { path });
  }

  let matcherPath = path;
  if (!config.strict && matcherPath !== "/") matcherPath = matcherPath.replace(/\/+$/, "") || "/";

  if (/^\/\{\*(?:[A-Za-z_$][A-Za-z0-9_$]*|"(?:[^"\\]|\\.)+")\}$/.test(matcherPath)) {
    const name = matcherPath.slice(3, -1);
    parseParameterName(`*${name}`, "*", path);
    const semantics = { segments: [], wildcard: "optional", trailingSlash: false };
    return {
      semantics,
      signature: JSON.stringify(semantics),
    };
  }

  if (matcherPath === "/") {
    const semantics = { segments: [], wildcard: null, trailingSlash: true };
    return { semantics, signature: JSON.stringify(semantics) };
  }

  const rawSegments = matcherPath.slice(1).split("/");
  const segments = [];
  let wildcard = null;
  for (let index = 0; index < rawSegments.length; index += 1) {
    const parsed = parseSegment(rawSegments[index], path, config.caseSensitive);
    if (parsed.kind === "wildcard") {
      if (index !== rawSegments.length - 1) {
        refused(
          "unsupported_express_path",
          "Only a final whole-segment named wildcard is supported for Express catalogs.",
          { path },
        );
      }
      wildcard = "required";
    } else {
      segments.push(parsed);
    }
  }

  const trailingSlash = config.strict && rawSegments.at(-1) === "";
  const semantics = { segments, wildcard, trailingSlash };
  return { semantics, signature: JSON.stringify(semantics) };
}

function normalizeMethod(method, path) {
  if (typeof method !== "string" || method.length === 0) {
    refused("missing_method", "Express route records require a method", { path, method });
  }
  const normalized = method.toUpperCase();
  if (normalized !== "ALL" && !METHOD_SET.has(normalized)) {
    refused("unsupported_method", "Express route method is not a Node HTTP method or ALL", {
      path,
      method,
    });
  }
  return normalized;
}

export function normalizeExpressRoute(record, index, config) {
  if (!isPlainObject(record)) {
    refused("invalid_record", "Catalog entry must be an object", { index });
  }
  if (typeof record.canonical === "string" || typeof record.title === "string") {
    refused(
      "unsupported_catalog",
      "Do not mix SDS crawler-shell fields with an Express route catalog.",
      { index, path: record.path ?? null },
    );
  }
  const method = normalizeMethod(record.method, record.path ?? null);
  const parsed = parseExpressPath(record.path, config);
  const matchKey = JSON.stringify({
    framework: `${config.name}@${config.major}`,
    caseSensitive: config.caseSensitive,
    strict: config.strict,
    method,
    path: parsed.semantics,
  });
  return {
    kind: "express",
    framework: `${config.name}@${config.major}`,
    caseSensitive: config.caseSensitive,
    strict: config.strict,
    method,
    path: record.path,
    matchSignature: parsed.signature,
    matchKey,
    index,
    _express: parsed.semantics,
  };
}

function handledMethods(method) {
  if (method === "ALL") return METHOD_SET;
  if (method === "GET") return new Set(["GET", "HEAD"]);
  return new Set([method]);
}

function methodWitness(left, right) {
  const leftMethods = handledMethods(left.method);
  const rightMethods = handledMethods(right.method);
  const shared = [...leftMethods].filter((method) => rightMethods.has(method));
  if (shared.length === 0) return null;
  return METHOD_PREFERENCE.find((method) => shared.includes(method)) || shared.sort()[0];
}

function segmentRange(route) {
  const fixed = route._express.segments.length;
  if (route._express.wildcard === "required") return { min: fixed + 1, max: Infinity };
  if (route._express.wildcard === "optional") return { min: fixed, max: Infinity };
  return { min: fixed, max: fixed };
}

function sharedLength(left, right) {
  const a = segmentRange(left);
  const b = segmentRange(right);
  if (Number.isFinite(a.max) && Number.isFinite(b.max)) return a.max === b.max ? a.max : null;
  if (Number.isFinite(a.max)) return a.max >= b.min ? a.max : null;
  if (Number.isFinite(b.max)) return b.max >= a.min ? b.max : null;
  return Math.max(a.min, b.min);
}

function tokenAt(route, index) {
  if (index < route._express.segments.length) return route._express.segments[index];
  return { kind: "wildcard" };
}

function pathWitness(left, right) {
  const length = sharedLength(left, right);
  if (length == null) return null;
  const segments = [];
  for (let index = 0; index < length; index += 1) {
    const a = tokenAt(left, index);
    const b = tokenAt(right, index);
    if (a.kind === "literal" && b.kind === "literal" && a.value !== b.value) return null;
    const literal = a.kind === "literal" ? a.value : b.kind === "literal" ? b.value : null;
    if (literal === "" && (a.kind === "parameter" || b.kind === "parameter")) return null;
    segments.push(literal ?? "x");
  }
  if (length === 0) return "/";
  return `/${segments.join("/")}`;
}

export function findExpressCollisions(records) {
  const collisions = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const right = records[rightIndex];
      const method = methodWitness(left, right);
      if (!method) continue;
      const path = pathWitness(left, right);
      if (!path) continue;
      collisions.push({
        kind: "request",
        framework: "express@5",
        method,
        path,
        witness: { method, path },
        indexes: [left.index, right.index],
        patterns: [
          { method: left.method, path: left.path },
          { method: right.method, path: right.path },
        ],
      });
    }
  }
  return collisions;
}

export function sameFrameworkConfig(left, right) {
  return (
    left?.kind === "express" &&
    right?.kind === "express" &&
    left.name === right.name &&
    left.major === right.major &&
    left.caseSensitive === right.caseSensitive &&
    left.strict === right.strict
  );
}
