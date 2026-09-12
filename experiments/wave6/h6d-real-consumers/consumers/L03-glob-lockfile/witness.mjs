/**
 * Independent lockfile pin witness for isaacs/node-glob package-lock.json.
 * Does not import useful-jobs engine compare/oracle modules.
 *
 * Pin identity: name + version + integrity + resolved.
 * npm lockfileVersion 2 or 3 only. yarn/pnpm/bun/HTML/package.json-only refuse.
 */
const PIN_FIELDS = Object.freeze(["name", "version", "integrity", "resolved"]);
const HTML_RE = /^\s*(<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i;
const YARN_V1_RE = /^\s*#\s*yarn lockfile\b/i;
const YARN_V2_RE = /^\s*__metadata:\s*$/m;
const PNPM_RE = /^\s*lockfileVersion:\s*['"]?\d/m;
const BOM = "\uFEFF";

function asText(input) {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (Buffer.isBuffer(input)) return input.toString("utf8");
  if (typeof input === "object") return null;
  return String(input);
}

function stripBom(text) {
  return String(text || "").replace(new RegExp(`^${BOM}`), "");
}

function trimOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function refuse(code, message, detail = {}) {
  return { refused: true, code, message, detail };
}

function nameFromPackagesKey(key) {
  if (!key) return null;
  const marker = "node_modules/";
  const idx = key.lastIndexOf(marker);
  const rest = idx >= 0 ? key.slice(idx + marker.length) : key;
  return rest || null;
}

function looksLikePackageJsonOnly(doc) {
  if (!isPlainObject(doc)) return false;
  if (typeof doc.lockfileVersion === "number") return false;
  if (isPlainObject(doc.packages)) return false;
  const deps = doc.dependencies;
  if (isPlainObject(deps)) {
    const values = Object.values(deps);
    if (values.length > 0 && values.every((v) => typeof v === "string")) return true;
  }
  if (typeof doc.name === "string" && (doc.scripts || doc.devDependencies || doc.main)) return true;
  if (typeof doc.name === "string" && typeof doc.version === "string" && !doc.packages && !doc.dependencies) {
    return true;
  }
  return false;
}

function looksLikeYarnOrPnpmOrBun(text) {
  const raw = stripBom(text);
  if (YARN_V1_RE.test(raw) || YARN_V2_RE.test(raw)) {
    return { code: "yarn-lockfile", message: "yarn.lock is not npm package-lock.json" };
  }
  if (PNPM_RE.test(raw) && !/^\s*\{/.test(raw)) {
    return { code: "pnpm-lockfile", message: "pnpm-lock.yaml is not npm package-lock.json" };
  }
  if (raw.startsWith("bun-lockfile") || raw.includes("\0")) {
    return { code: "bun-lockfile", message: "bun lock is not npm package-lock.json" };
  }
  return null;
}

function pinFromEntry(id, entry) {
  const name = trimOrNull(entry?.name) || nameFromPackagesKey(id);
  const version = trimOrNull(entry?.version);
  const integrity = trimOrNull(entry?.integrity);
  const resolved = trimOrNull(entry?.resolved);
  return {
    id,
    name,
    version,
    integrity,
    resolved,
    missingIntegrity: integrity == null,
  };
}

function collectFromPackages(packages) {
  const pins = [];
  if (!isPlainObject(packages)) return pins;
  for (const [id, entry] of Object.entries(packages)) {
    if (id === "") continue;
    if (!isPlainObject(entry)) continue;
    if (entry.link === true) continue;
    pins.push(pinFromEntry(id, entry));
  }
  return pins;
}

function walkDependencies(deps, prefix, pins) {
  if (!isPlainObject(deps)) return;
  for (const [name, entry] of Object.entries(deps)) {
    if (!isPlainObject(entry)) continue;
    const id = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    pins.push(pinFromEntry(id, entry));
    if (entry.dependencies) walkDependencies(entry.dependencies, id, pins);
  }
}

export function classifyLockfile(input, label = "lockfile") {
  if (isPlainObject(input) && (typeof input.lockfileVersion === "number" || input.packages || input.dependencies)) {
    return { ok: true, label, doc: input, text: null };
  }
  const text = asText(input);
  if (text == null && isPlainObject(input)) {
    return { ok: true, label, doc: input, text: null };
  }
  const raw = stripBom(text);
  if (!raw.trim()) {
    return refuse("empty-input", `${label} is empty`, { label });
  }
  if (HTML_RE.test(raw)) {
    return refuse("html-input", `${label} is HTML, not a package-lock.json`, { label });
  }
  const foreign = looksLikeYarnOrPnpmOrBun(raw);
  if (foreign) {
    return refuse(foreign.code, `${label}: ${foreign.message}`, { label });
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    return refuse("parse-error", `${label} is not JSON: ${err.message}`, { label });
  }
  if (!isPlainObject(doc)) {
    return refuse("not-a-lockfile", `${label} is not a lockfile object`, { label });
  }
  if (looksLikePackageJsonOnly(doc)) {
    return refuse("package-json-only", `${label} looks like package.json, not package-lock.json`, { label });
  }
  return { ok: true, label, doc, text: raw };
}

export function extractPins(doc) {
  if (typeof doc.lockfileVersion !== "number") {
    return refuse("not-a-lockfile", "JSON is not an npm lockfile (missing lockfileVersion)", {});
  }
  if (doc.lockfileVersion !== 2 && doc.lockfileVersion !== 3) {
    return refuse(
      "unsupported-lockfile-version",
      `lockfileVersion ${doc.lockfileVersion} is not 2 or 3`,
      { lockfileVersion: doc.lockfileVersion },
    );
  }
  const hasPackages = isPlainObject(doc.packages);
  const hasDependencies = isPlainObject(doc.dependencies);
  if (!hasPackages && !hasDependencies) {
    return refuse("missing-packages-and-dependencies", "lockfile has neither packages nor dependencies maps", {
      lockfileVersion: doc.lockfileVersion,
    });
  }
  let mapSource = "packages";
  let pins;
  if (hasPackages) {
    pins = collectFromPackages(doc.packages);
    mapSource = "packages";
  } else {
    pins = [];
    walkDependencies(doc.dependencies, "", pins);
    mapSource = "dependencies";
  }
  return {
    ok: true,
    lockfileVersion: doc.lockfileVersion,
    mapSource,
    rootName: typeof doc.name === "string" ? doc.name : null,
    pins,
    missingIntegrityCount: pins.filter((p) => p.missingIntegrity).length,
  };
}

function loadSide(input, label) {
  const classified = classifyLockfile(input, label);
  if (classified.refused) return classified;
  const extracted = extractPins(classified.doc);
  if (extracted.refused) return extracted;
  return { ok: true, label, ...extracted };
}

function publicPin(pin) {
  return {
    id: pin.id,
    name: pin.name,
    version: pin.version,
    integrity: pin.integrity,
    resolved: pin.resolved,
  };
}

function pinEqual(a, b) {
  return PIN_FIELDS.every((field) => trimOrNull(a?.[field]) === trimOrNull(b?.[field]));
}

function changeKinds(a, b) {
  return PIN_FIELDS.filter((field) => trimOrNull(a?.[field]) !== trimOrNull(b?.[field]));
}

function highlight(pinsById, name) {
  const id = `node_modules/${name}`;
  const pin = pinsById.get(id);
  if (!pin) return null;
  return publicPin(pin);
}

/**
 * @param {string|object} before
 * @param {string|object} after
 * @param {unknown} [used] ignored; lockfile-pin-delta has no used-pointer set
 * @returns {{fact: object, changed: object[], unchanged: object[], added: object[], removed: object[], unknown: object[]}}
 */
export function witness(before, after, used = undefined) {
  void used;
  const beforeSide = loadSide(before, "before");
  const afterSide = loadSide(after, "after");
  if (beforeSide.refused || afterSide.refused) {
    const hit = beforeSide.refused ? beforeSide : afterSide;
    return {
      fact: {
        job: "lockfile-pin-delta",
        status: "refused",
        refused: true,
        code: hit.code,
        message: hit.message,
        equality: "name+version+integrity+resolved",
        usedIgnored: true,
      },
      changed: [],
      unchanged: [],
      added: [],
      removed: [],
      unknown: [],
    };
  }

  const beforeMap = new Map(beforeSide.pins.map((p) => [p.id, p]));
  const afterMap = new Map(afterSide.pins.map((p) => [p.id, p]));
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
      unknown.push({ id, name: (a || b).name, reason: "missing-integrity" });
    }
    if (!b && a) {
      added.push(publicPin(a));
      continue;
    }
    if (b && !a) {
      removed.push(publicPin(b));
      continue;
    }
    if (pinEqual(b, a)) {
      unchanged.push({ id, name: a.name, version: a.version });
      continue;
    }
    changed.push({
      id,
      name: a.name || b.name,
      before: publicPin(b),
      after: publicPin(a),
      changeKinds: changeKinds(b, a),
    });
  }

  const missingIntegrity = unknown.length;
  const hasDelta = added.length + removed.length + changed.length > 0;
  const status = missingIntegrity > 0 ? "partial" : hasDelta ? "actionable" : "informational";

  const uuid = {
    before: highlight(beforeMap, "uuid"),
    after: highlight(afterMap, "uuid"),
  };
  const tap = {
    before: highlight(beforeMap, "tap"),
    after: highlight(afterMap, "tap"),
  };

  return {
    fact: {
      job: "lockfile-pin-delta",
      status,
      refused: false,
      equality: "name+version+integrity+resolved",
      lockfileVersion: {
        before: beforeSide.lockfileVersion,
        after: afterSide.lockfileVersion,
      },
      mapSource: {
        before: beforeSide.mapSource,
        after: afterSide.mapSource,
      },
      counts: {
        beforePins: beforeSide.pins.length,
        afterPins: afterSide.pins.length,
        added: added.length,
        removed: removed.length,
        changed: changed.length,
        unchanged: unchanged.length,
        missingIntegrity,
      },
      uuid,
      tap,
      usedIgnored: true,
    },
    changed,
    unchanged,
    added,
    removed,
    unknown,
  };
}

export { PIN_FIELDS };
