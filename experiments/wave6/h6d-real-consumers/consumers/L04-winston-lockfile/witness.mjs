/**
 * Independent lockfile pin witness.
 * Does not import useful-jobs compare/oracle modules.
 * Pin identity: name + version + integrity + resolved.
 */
const PIN_FIELDS = Object.freeze(["name", "version", "integrity", "resolved"]);
const HTML_RE = /^\s*(<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i;
const YARN_RE = /^\s*#\s*yarn lockfile\b/i;
const PNPM_RE = /^\s*lockfileVersion:\s*['"]?\d+/m;
const BUN_RE = /^\s*\{\s*"lockfileVersion"\s*:\s*\d+[\s\S]*"packages"\s*:\s*\{[\s\S]*"name"\s*:\s*"/;

function asText(input) {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (Buffer.isBuffer(input)) return input.toString("utf8");
  if (typeof input === "object") return null;
  return String(input);
}

function normalizeTerm(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function pinFields(pin) {
  return {
    name: normalizeTerm(pin?.name),
    version: normalizeTerm(pin?.version),
    integrity: normalizeTerm(pin?.integrity),
    resolved: normalizeTerm(pin?.resolved),
  };
}

function pinEqual(a, b) {
  const left = pinFields(a);
  const right = pinFields(b);
  return PIN_FIELDS.every((field) => left[field] === right[field]);
}

function changeKinds(a, b) {
  const left = pinFields(a);
  const right = pinFields(b);
  return PIN_FIELDS.filter((field) => left[field] !== right[field]);
}

function nameFromPackagesKey(key) {
  if (!key) return null;
  const marker = "node_modules/";
  const idx = key.lastIndexOf(marker);
  const rest = idx >= 0 ? key.slice(idx + marker.length) : key;
  return rest || null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function classifyText(text, label) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  if (!raw.trim()) {
    return { ok: false, code: "empty-input", error: `${label} is empty`, unknown: `${label}: empty` };
  }
  if (HTML_RE.test(raw)) {
    return { ok: false, code: "html-input", error: `${label} is HTML, not package-lock.json`, unknown: `${label}: html` };
  }
  if (YARN_RE.test(raw) || /^\s*__metadata:\s*$/m.test(raw)) {
    return {
      ok: false,
      code: "yarn-lockfile",
      error: `${label} is yarn.lock, not npm package-lock.json`,
      unknown: `${label}: yarn.lock`,
    };
  }
  if (PNPM_RE.test(raw) && !/^\s*\{/.test(raw)) {
    return {
      ok: false,
      code: "pnpm-lockfile",
      error: `${label} looks like pnpm-lock.yaml, not npm package-lock.json`,
      unknown: `${label}: pnpm-lock.yaml`,
    };
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      code: "parse-error",
      error: `${label} is not JSON: ${err.message}`,
      unknown: `${label}: not-json`,
    };
  }
  return classifyDoc(doc, label);
}

function classifyDoc(doc, label) {
  if (!isPlainObject(doc)) {
    return { ok: false, code: "not-a-lockfile", error: `${label} is not a lockfile object`, unknown: `${label}: not-object` };
  }
  if (looksLikePackageJsonOnly(doc)) {
    return {
      ok: false,
      code: "package-json-only",
      error: `${label} looks like package.json, not package-lock.json`,
      unknown: `${label}: package.json-only`,
    };
  }
  if (typeof doc.lockfileVersion !== "number") {
    if (BUN_RE.test(JSON.stringify(doc).slice(0, 200))) {
      return { ok: false, code: "bun-lockfile", error: `${label} is not npm lockfileVersion 2/3`, unknown: `${label}: bun` };
    }
    return {
      ok: false,
      code: "not-a-lockfile",
      error: `${label} is not an npm lockfile (missing lockfileVersion)`,
      unknown: `${label}: missing-lockfileVersion`,
    };
  }
  if (doc.lockfileVersion !== 2 && doc.lockfileVersion !== 3) {
    return {
      ok: false,
      code: "unsupported-lockfile-version",
      error: `${label} lockfileVersion ${doc.lockfileVersion} is not 2 or 3`,
      unknown: `${label}: lockfileVersion ${doc.lockfileVersion}`,
    };
  }
  if (!isPlainObject(doc.packages) && !isPlainObject(doc.dependencies)) {
    return {
      ok: false,
      code: "missing-packages-and-dependencies",
      error: `${label} has neither packages nor dependencies maps`,
      unknown: `${label}: no-pin-map`,
    };
  }
  return { ok: true, doc };
}

function pinFromEntry(id, entry) {
  const name = normalizeTerm(entry.name) || nameFromPackagesKey(id);
  return {
    id,
    name,
    version: normalizeTerm(entry.version),
    integrity: normalizeTerm(entry.integrity),
    resolved: normalizeTerm(entry.resolved),
    missingIntegrity: normalizeTerm(entry.integrity) == null,
  };
}

function walkDependencies(deps, prefix, pins) {
  if (!isPlainObject(deps)) return;
  for (const [name, entry] of Object.entries(deps)) {
    if (!isPlainObject(entry)) continue;
    const id = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    pins.set(id, pinFromEntry(id, { ...entry, name: entry.name || name }));
    if (entry.dependencies) walkDependencies(entry.dependencies, id, pins);
  }
}

function extractPins(doc) {
  const pins = new Map();
  let mapSource = "packages";
  if (isPlainObject(doc.packages)) {
    for (const [id, entry] of Object.entries(doc.packages)) {
      if (id === "") continue;
      if (!isPlainObject(entry)) continue;
      if (entry.link === true) continue;
      pins.set(id, pinFromEntry(id, entry));
    }
    mapSource = "packages";
  } else {
    walkDependencies(doc.dependencies, "", pins);
    mapSource = "dependencies";
  }
  return { pins, mapSource, lockfileVersion: doc.lockfileVersion, rootName: typeof doc.name === "string" ? doc.name : null };
}

function loadSide(input, label) {
  if (isPlainObject(input) && (input.lockfileVersion != null || input.packages || input.dependencies || input.name)) {
    return classifyDoc(input, label);
  }
  const text = asText(input);
  if (text == null && isPlainObject(input)) return classifyDoc(input, label);
  return classifyText(text, label);
}

function publicPin(pin) {
  return {
    id: pin.id,
    name: pin.name,
    version: pin.version,
    integrity: pin.integrity,
    resolved: pin.resolved,
    missingIntegrity: pin.missingIntegrity,
  };
}

function usedNames(used) {
  if (!used) return null;
  if (Array.isArray(used)) return new Set(used.map((v) => String(v)));
  if (typeof used === "string") return new Set([used]);
  if (isPlainObject(used) && Array.isArray(used.names)) return new Set(used.names.map((v) => String(v)));
  if (isPlainObject(used) && Array.isArray(used.ids)) return new Set(used.ids.map((v) => String(v)));
  return null;
}

function matchesUsed(pin, focus) {
  if (!focus) return true;
  return focus.has(pin.id) || focus.has(pin.name);
}

/**
 * @param {object|string} before parsed lockfile or raw text
 * @param {object|string} after parsed lockfile or raw text
 * @param {string[]|{names?:string[],ids?:string[]}|string} [used] optional pin name/id filter for fact
 * @returns {{fact:object,changed:object[],unchanged:number,added:object[],removed:object[],unknown:string[]}}
 */
export function witness(before, after, used) {
  const unknown = [];
  const left = loadSide(before, "before");
  const right = loadSide(after, "after");
  if (!left.ok) unknown.push(left.unknown || left.error);
  if (!right.ok) unknown.push(right.unknown || right.error);

  if (!left.ok || !right.ok) {
    const code = !left.ok ? left.code : right.code;
    return {
      fact: {
        job: "lockfile-pin-delta",
        equality: "name+version+integrity+resolved",
        refused: true,
        code,
        error: !left.ok ? left.error : right.error,
        focus: "async",
      },
      changed: [],
      unchanged: 0,
      added: [],
      removed: [],
      unknown,
    };
  }

  const beforeExtract = extractPins(left.doc);
  const afterExtract = extractPins(right.doc);
  const ids = [...new Set([...beforeExtract.pins.keys(), ...afterExtract.pins.keys()])].sort();
  const added = [];
  const removed = [];
  const changed = [];
  let unchanged = 0;

  for (const id of ids) {
    const b = beforeExtract.pins.get(id);
    const a = afterExtract.pins.get(id);
    if (!b && a) {
      added.push(publicPin(a));
      continue;
    }
    if (b && !a) {
      removed.push(publicPin(b));
      continue;
    }
    if (pinEqual(b, a)) {
      unchanged += 1;
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

  const focus = usedNames(used);
  const asyncChange =
    changed.find((row) => row.id === "node_modules/async" || row.name === "async") ||
    added.find((row) => row.id === "node_modules/async" || row.name === "async") ||
    null;
  const focusedChanged = focus ? changed.filter((row) => matchesUsed(row, focus)) : changed;

  const hasDelta = added.length + removed.length + changed.length > 0;
  const fact = {
    job: "lockfile-pin-delta",
    equality: "name+version+integrity+resolved",
    refused: false,
    status: hasDelta ? "actionable" : "informational",
    lockfileVersion: {
      before: beforeExtract.lockfileVersion,
      after: afterExtract.lockfileVersion,
    },
    mapSource: {
      before: beforeExtract.mapSource,
      after: afterExtract.mapSource,
    },
    rootName: {
      before: beforeExtract.rootName,
      after: afterExtract.rootName,
    },
    focus: "async",
    asyncPin: asyncChange
      ? {
          id: asyncChange.id || "node_modules/async",
          name: asyncChange.name || "async",
          before: asyncChange.before || null,
          after: asyncChange.after || asyncChange,
          changeKinds: asyncChange.changeKinds || ["added"],
        }
      : {
          id: "node_modules/async",
          name: "async",
          before: beforeExtract.pins.get("node_modules/async")
            ? publicPin(beforeExtract.pins.get("node_modules/async"))
            : null,
          after: afterExtract.pins.get("node_modules/async")
            ? publicPin(afterExtract.pins.get("node_modules/async"))
            : null,
          changeKinds: [],
        },
    focusedChanged,
  };

  return { fact, changed, unchanged, added, removed, unknown };
}

export const PIN_IDENTITY_FIELDS = PIN_FIELDS;
export { pinFields, changeKinds, pinEqual };
