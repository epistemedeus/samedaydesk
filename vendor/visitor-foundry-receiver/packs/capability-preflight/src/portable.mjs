/**
 * Portable output hygiene: relativize designated filesystem locators only.
 * Source/TAP content, payloads, requirement equals, and CLI argv stay opaque.
 */
const ABS_RE = /(?:^|[\s"'=`])(\/(?:workspace|home|Users|tmp|var|opt|private)[^\s"'`]*)/g;
const HOST_PREFIXES = [
  "/workspace/",
  "/home/",
  "/Users/",
  "/private/tmp/",
  "/tmp/",
  "/opt/",
  "/var/",
];

/** Filesystem locator keys that may be relativized when they contain kit markers. */
export const LOCATOR_KEYS = new Set([
  "importPath",
  "resolvedFrom",
  "packageRoot",
  "file",
  "filename",
  "filepath",
  "artifactRelPath",
  "nextRunInputRelPath",
  "coldStartArtifactPath",
  "out",
  "outDir",
  "modulePath",
  "abs",
  "cwd",
  "path",
  "sourcePath",
]);

/** Opaque data: never rewritten, even if a substring looks like a host path. */
export const OPAQUE_KEYS = new Set([
  "content",
  "payload",
  "value",
  "equals",
  "argv",
  "body",
  "bodyPreview",
  "sourceContent",
  "tapContent",
  "code",
  "text",
  "url",
  "endpoint",
  "location",
  "sourceSha256",
  "sha256",
  "digest",
  "evidenceDigest",
  "headers",
]);

const NOTE_KEYS = new Set(["note", "notes"]);

export function isOpaqueKey(key) {
  return typeof key === "string" && OPAQUE_KEYS.has(key);
}

export function isLocatorKey(key) {
  return typeof key === "string" && LOCATOR_KEYS.has(key);
}

export function isMachineAbsolutePath(value) {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/")) return false;
  return HOST_PREFIXES.some((p) => value === p.slice(0, -1) || value.startsWith(p));
}

export function relativizePath(value, opts = {}) {
  if (typeof value !== "string") return value;
  if (!isMachineAbsolutePath(value)) return value;
  const kitRoot = opts.kitRoot;
  if (typeof kitRoot === "string" && kitRoot) {
    const root = kitRoot.endsWith("/") ? kitRoot : `${kitRoot}/`;
    if (value === kitRoot) return ".";
    if (value.startsWith(root)) return value.slice(root.length);
  }
  const markers = [
    "experiments/s180-capability-consumer-kit/",
    "experiments/s138-capability-evidence/",
    "experiments/scale-r2-20260910/",
    "experiments/s146-capability-consumer-gates/",
    "s180-capability-consumer-kit/",
  ];
  for (const m of markers) {
    const idx = value.indexOf(m);
    if (idx >= 0) return value.slice(idx);
  }
  // Do not basename-collapse semantic values such as /tmp/data or /tmp/.../caller.json.
  return value;
}

function redactEmbeddedHostPaths(value, opts) {
  return value.replace(ABS_RE, (full, path) => full.replace(path, relativizePath(path, opts)));
}

export function scrubPortable(value, opts = {}, key = null) {
  if (value == null) return value;
  if (isOpaqueKey(key)) return value;
  if (typeof value === "string") {
    if (isLocatorKey(key) && isMachineAbsolutePath(value)) return relativizePath(value, opts);
    if (isLocatorKey(key)) return redactEmbeddedHostPaths(value, opts);
    if (typeof key === "string" && NOTE_KEYS.has(key)) return redactEmbeddedHostPaths(value, opts);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubPortable(v, opts, key));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = scrubPortable(v, opts, k);
    }
    return out;
  }
  return value;
}

/** Assert no machine-absolute *locator* paths remain (opaque and semantic values ignored). */
export function findAbsolutePaths(value, found = [], path = "$", key = null) {
  if (isOpaqueKey(key)) return found;
  if (typeof value === "string") {
    if (isLocatorKey(key) && isMachineAbsolutePath(value)) found.push({ path, value });
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findAbsolutePaths(v, found, `${path}[${i}]`, key));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      findAbsolutePaths(v, found, `${path}.${k}`, k);
    }
  }
  return found;
}
