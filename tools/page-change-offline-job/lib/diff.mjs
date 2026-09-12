import { isPlainObject } from "./canonical.mjs";
import { normalizeLimits } from "./limits.mjs";

const ABSENT = Symbol("absent JSON member");

function display(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function jsonType(value) {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}

function sameList(before, after) {
  return before.length === after.length && before.every((value, i) => value === after[i]);
}

function markTruncated(changes, limitHit) {
  changes.truncated = true;
  if (!changes.limitHit) changes.limitHit = limitHit;
}

function pushChange(changes, maxChanges, change) {
  if (changes.length >= maxChanges) {
    markTruncated(changes, "maxChanges");
    return;
  }
  changes.push(change);
}

export function excerpt(value, maxExcerptBytes) {
  if (value === undefined) return undefined;
  const text = display(value);
  if (Buffer.byteLength(text, "utf8") <= maxExcerptBytes) return text;
  let cut = "";
  let bytes = 0;
  for (const character of text) {
    bytes += Buffer.byteLength(character, "utf8");
    if (bytes > maxExcerptBytes) break;
    cut += character;
  }
  return cut;
}

export function diffJson(before, after, limitsInput = {}) {
  const limits = normalizeLimits(limitsInput);
  const changes = [];
  const stats = { nodes: 0 };
  visit(before, after, "", 0, changes, limits, stats);
  return {
    changes: changes.map((change) => ({
      ...change,
      beforeEvidence: change.before === undefined ? undefined : excerpt(change.before, limits.maxExcerptBytes),
      afterEvidence: change.after === undefined ? undefined : excerpt(change.after, limits.maxExcerptBytes),
      evidenceTruncated: [change.before, change.after].some((value) =>
        value !== undefined && Buffer.byteLength(String(value), "utf8") > limits.maxExcerptBytes),
    })),
    truncated: changes.truncated === true,
    canonicalEqual: changes.length === 0 && changes.truncated !== true,
    limitHit: changes.limitHit ?? null,
  };
}

function enter(depth, changes, limits, stats) {
  if (stats.nodes >= limits.maxJsonNodes) {
    markTruncated(changes, "maxJsonNodes");
    return false;
  }
  stats.nodes += 1;
  if (depth > limits.maxJsonDepth) {
    markTruncated(changes, "maxJsonDepth");
    return false;
  }
  return true;
}

// Array equality/order needs canonical element keys. Inspect their children
// within the same walk budget; never stringify an uninspected deep subtree.
function boundedKey(value, depth, changes, limits, stats, entered = false) {
  if (!entered && !enter(depth, changes, limits, stats)) return undefined;
  if (Array.isArray(value)) {
    const keys = arrayKeys(value, depth, changes, limits, stats);
    return keys === undefined ? undefined : `[${keys.join(",")}]`;
  }
  if (isPlainObject(value)) {
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      const child = boundedKey(value[key], depth + 1, changes, limits, stats);
      if (child === undefined) return undefined;
      parts.push(`${JSON.stringify(key)}:${child}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

function arrayKeys(value, depth, changes, limits, stats) {
  const keys = [];
  for (const item of value) {
    const key = boundedKey(item, depth + 1, changes, limits, stats);
    if (key === undefined) return undefined;
    keys.push(key);
  }
  return keys;
}

function record(before, after, path, changes, limits, order = false) {
  pushChange(changes, limits.maxChanges, {
    class: order ? "order" : "semantic",
    op: order ? "reorder" : before === ABSENT ? "add" : after === ABSENT ? "remove" : "replace",
    path: path || "/",
    ...(before === ABSENT ? {} : { before: display(before), beforeType: jsonType(before) }),
    ...(after === ABSENT ? {} : { after: display(after), afterType: jsonType(after) }),
  });
}

function visit(before, after, path, depth, changes, limits, stats) {
  if (!enter(depth, changes, limits, stats)) return;
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const segment = key.replace(/~/g, "~0").replace(/\//g, "~1");
      visit(
        Object.hasOwn(before, key) ? before[key] : ABSENT,
        Object.hasOwn(after, key) ? after[key] : ABSENT,
        `${path}/${segment}`, depth + 1, changes, limits, stats,
      );
      if (stats.nodes >= limits.maxJsonNodes && key !== keys.at(-1)) {
        markTruncated(changes, "maxJsonNodes");
        return;
      }
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const left = arrayKeys(before, depth, changes, limits, stats);
    const right = arrayKeys(after, depth, changes, limits, stats);
    if (left === undefined || right === undefined || sameList(left, right)) return;
    record(before, after, path, changes, limits, sameList([...left].sort(), [...right].sort()));
    return;
  }
  // JSON scalar equality is type-sensitive; containers and added/removed
  // subtrees must still be bounded before their full evidence is serialized.
  if (before === after) return;
  for (const value of [before, after]) {
    if (value !== ABSENT && (Array.isArray(value) || isPlainObject(value))
        && boundedKey(value, depth, changes, limits, stats, true) === undefined) return;
  }
  record(before, after, path, changes, limits);
}
