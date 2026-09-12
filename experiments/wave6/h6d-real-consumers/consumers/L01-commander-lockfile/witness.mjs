/**
 * Independent npm lockfile pin witness.
 * Compares lockfileVersion 2/3 pins on name+version+integrity+resolved.
 * Does not import useful-jobs kit engines.
 */
import { existsSync, readFileSync, statSync } from "node:fs";

export const PIN_FIELDS = Object.freeze(["name", "version", "integrity", "resolved"]);

const HTML_RE = /^\s*(<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i;
const YARN_RE = /(?:^|\n)\s*(?:#\s*)?yarn lockfile(?: v\d+)?\b/i;
const YARN_META_RE = /(?:^|\n)__metadata:\s*\n/;
const PNPM_RE = /(?:^|\n)lockfileVersion:\s*['"]?\d/i;
const BUN_RE = /^\s*\{\s*"lockfileVersion"\s*:\s*\d[\s\S]*"packages"\s*:\s*\{/i;

function norm(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyResult(extra = {}) {
  return {
    fact: extra.fact || "unknown",
    changed: [],
    unchanged: [],
    added: [],
    removed: [],
    unknown: extra.unknown || [],
    ...extra,
  };
}

function loadInput(value, label) {
  if (value == null || value === "") {
    return { error: { code: "missing-input", message: `${label} is missing`, label } };
  }
  if (Buffer.isBuffer(value)) {
    return { text: value.toString("utf8"), path: null, label };
  }
  if (isPlainObject(value)) {
    if (typeof value.text === "string" && value.lockfileVersion === undefined && value.packages === undefined) {
      return loadInput(value.text, label);
    }
    return { text: null, doc: value, path: null, label };
  }
  const str = String(value);
  if (str.length < 4096 && existsSync(str)) {
    try {
      if (statSync(str).isFile()) {
        return { text: readFileSync(str, "utf8"), path: str, label };
      }
    } catch {
      // treat as text
    }
  }
  return { text: str, path: null, label };
}

function classifyNonJson(text, path, label) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const base = path ? path.split(/[\\/]/).pop() : "";
  if (HTML_RE.test(raw)) {
    return { code: "html-input", message: `${label} is HTML, not a package-lock.json`, label };
  }
  if (base === "yarn.lock" || YARN_RE.test(raw) || YARN_META_RE.test(raw)) {
    return { code: "yarn-lock", message: `${label} is yarn.lock, not npm package-lock.json`, label };
  }
  if (base === "pnpm-lock.yaml" || base === "pnpm-lock.yml" || (PNPM_RE.test(raw) && /importers:|packages:/i.test(raw))) {
    return { code: "pnpm-lock", message: `${label} is pnpm-lock.yaml, not npm package-lock.json`, label };
  }
  if (base === "bun.lock" || base === "bun.lockb") {
    return { code: "bun-lock", message: `${label} is a bun lockfile, not npm package-lock.json`, label };
  }
  if (BUN_RE.test(raw) && /"workspace":\s*true/.test(raw) && !/"lockfileVersion"\s*:\s*[23]\b/.test(raw)) {
    return { code: "bun-lock", message: `${label} looks like bun.lock, not npm package-lock.json`, label };
  }
  return null;
}

function isPackageJsonOnly(doc) {
  if (!isPlainObject(doc)) return false;
  if (typeof doc.lockfileVersion === "number") return false;
  if (isPlainObject(doc.packages)) return false;
  const deps = doc.dependencies;
  if (isPlainObject(deps)) {
    const values = Object.values(deps);
    if (values.length > 0 && values.every((v) => typeof v === "string")) return true;
  }
  if (typeof doc.name === "string" && (doc.scripts || doc.devDependencies || doc.main)) return true;
  if (typeof doc.name === "string" && typeof doc.version === "string" && !doc.packages && !isPlainObject(doc.dependencies)) {
    return true;
  }
  return false;
}

function nameFromPackagesKey(key) {
  if (!key) return null;
  const marker = "node_modules/";
  const idx = key.lastIndexOf(marker);
  const rest = idx >= 0 ? key.slice(idx + marker.length) : key;
  return rest || null;
}

function gitCommitFromResolved(resolved) {
  if (typeof resolved !== "string" || resolved === "") return null;
  const looksGit = /(?:^git\+|github:|\.git(?:#|$))/i.test(resolved);
  if (!looksGit) return null;
  const hashIdx = resolved.lastIndexOf("#");
  if (hashIdx < 0) return null;
  const frag = resolved.slice(hashIdx + 1).trim();
  if (!/^[0-9a-f]{7,40}$/i.test(frag)) return null;
  return frag.toLowerCase();
}

function pinFromEntry(id, entry) {
  if (!isPlainObject(entry) || entry.link === true) return null;
  const name = norm(entry.name) || nameFromPackagesKey(id);
  const version = entry.version == null ? null : norm(entry.version);
  const integrity = typeof entry.integrity === "string" ? norm(entry.integrity) : null;
  const resolved = typeof entry.resolved === "string" ? norm(entry.resolved) : null;
  return {
    id,
    name,
    version,
    integrity,
    resolved,
    gitCommit: gitCommitFromResolved(resolved),
    missingIntegrity: integrity == null,
  };
}

function collectPins(doc) {
  const hasPackages = isPlainObject(doc.packages);
  const hasDependencies = isPlainObject(doc.dependencies);
  const pins = [];
  if (hasPackages) {
    for (const [id, entry] of Object.entries(doc.packages)) {
      if (id === "") continue;
      const pin = pinFromEntry(id, entry);
      if (pin) pins.push(pin);
    }
    return { pins, mapSource: "packages" };
  }
  function walk(deps, prefix) {
    if (!isPlainObject(deps)) return;
    for (const [name, entry] of Object.entries(deps)) {
      if (!isPlainObject(entry)) continue;
      const id = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
      const pin = pinFromEntry(id, { ...entry, name: entry.name || name });
      if (pin) pins.push(pin);
      if (entry.dependencies) walk(entry.dependencies, id);
    }
  }
  walk(hasDependencies ? doc.dependencies : {}, "");
  return { pins, mapSource: "dependencies" };
}

export function classifyLockfile(input, label = "lockfile") {
  const loaded = loadInput(input, label);
  if (loaded.error) return loaded.error;
  if (loaded.doc) {
    return classifyDoc(loaded.doc, label, loaded.path);
  }
  const text = String(loaded.text || "").replace(/^\uFEFF/, "");
  const nonJson = classifyNonJson(text, loaded.path, label);
  if (nonJson) return nonJson;
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    return { code: "parse-error", message: `${label} is not JSON: ${err.message}`, label };
  }
  return classifyDoc(doc, label, loaded.path);
}

function classifyDoc(doc, label, path) {
  if (!isPlainObject(doc)) {
    return { code: "not-a-lockfile", message: `${label} is not a lockfile object`, label };
  }
  if (isPackageJsonOnly(doc)) {
    return { code: "package-json-only", message: `${label} looks like package.json, not package-lock.json`, label };
  }
  if (typeof doc.lockfileVersion !== "number") {
    return { code: "not-a-lockfile", message: `${label} is not an npm lockfile (missing lockfileVersion)`, label };
  }
  if (doc.lockfileVersion !== 2 && doc.lockfileVersion !== 3) {
    return {
      code: "unsupported-lockfile-version",
      message: `lockfileVersion ${doc.lockfileVersion} is not 2 or 3`,
      lockfileVersion: doc.lockfileVersion,
      label,
    };
  }
  const hasPackages = isPlainObject(doc.packages);
  const hasDependencies = isPlainObject(doc.dependencies);
  if (!hasPackages && !hasDependencies) {
    return {
      code: "missing-packages-and-dependencies",
      message: "lockfile has neither packages nor dependencies maps",
      lockfileVersion: doc.lockfileVersion,
      label,
    };
  }
  const extracted = collectPins(doc);
  return {
    ok: true,
    label,
    path: path || null,
    doc,
    lockfileVersion: doc.lockfileVersion,
    rootName: typeof doc.name === "string" ? doc.name : null,
    ...extracted,
  };
}

function pinIdentity(pin) {
  const out = {};
  for (const field of PIN_FIELDS) out[field] = norm(pin?.[field]);
  return out;
}

function pinFieldsEqual(a, b) {
  const left = pinIdentity(a);
  const right = pinIdentity(b);
  return PIN_FIELDS.every((field) => left[field] === right[field]);
}

function pinChangeKinds(a, b) {
  const left = pinIdentity(a);
  const right = pinIdentity(b);
  return PIN_FIELDS.filter((field) => left[field] !== right[field]);
}

function publicPin(pin) {
  return {
    id: pin.id,
    name: pin.name,
    version: pin.version,
    integrity: pin.integrity,
    resolved: pin.resolved ?? null,
    gitCommit: pin.gitCommit ?? null,
    missingIntegrity: Boolean(pin.missingIntegrity),
  };
}

/**
 * @param {string|object} before before package-lock JSON text, path, or object
 * @param {string|object} after after package-lock JSON text, path, or object
 * @param {unknown} [_used] unused; lockfile pins are not JSON-pointer jobs
 * @returns {{fact: string, changed: object[], unchanged: string[], added: object[], removed: object[], unknown: object[]}}
 */
export function witness(before, after, _used) {
  const beforeExtract = classifyLockfile(before, "before");
  if (!beforeExtract.ok) {
    return emptyResult({
      fact: "refused",
      refused: true,
      code: beforeExtract.code,
      error: beforeExtract.message,
      side: "before",
    });
  }
  const afterExtract = classifyLockfile(after, "after");
  if (!afterExtract.ok) {
    return emptyResult({
      fact: "refused",
      refused: true,
      code: afterExtract.code,
      error: afterExtract.message,
      side: "after",
    });
  }

  const beforeMap = new Map(beforeExtract.pins.map((p) => [p.id, p]));
  const afterMap = new Map(afterExtract.pins.map((p) => [p.id, p]));
  const ids = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  const unknown = [];

  for (const id of ids) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);
    if ((b && b.missingIntegrity) || (a && a.missingIntegrity)) {
      unknown.push({ id, reason: "missing-integrity" });
    }
    if (!b && a) {
      added.push(publicPin(a));
      continue;
    }
    if (b && !a) {
      removed.push(publicPin(b));
      continue;
    }
    if (pinFieldsEqual(b, a)) {
      unchanged.push(id);
      continue;
    }
    changed.push({
      id,
      name: a.name || b.name,
      before: publicPin(b),
      after: publicPin(a),
      changeKinds: pinChangeKinds(b, a),
    });
  }

  const hasDelta = added.length + removed.length + changed.length > 0;
  const missingIntegrity = unknown.length;
  let fact = "identical";
  if (missingIntegrity > 0 && !hasDelta) fact = "partial";
  else if (hasDelta) fact = "actionable";

  return {
    fact,
    changed,
    unchanged,
    added,
    removed,
    unknown,
    equality: "name+version+integrity+resolved",
    lockfileVersion: {
      before: beforeExtract.lockfileVersion,
      after: afterExtract.lockfileVersion,
    },
    mapSource: {
      before: beforeExtract.mapSource,
      after: afterExtract.mapSource,
    },
    counts: {
      beforePins: beforeExtract.pins.length,
      afterPins: afterExtract.pins.length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
      missingIntegrity,
    },
    purchaseAuthority: false,
  };
}

export default witness;
