import { canonicalize, isPlainObject } from "./canonical.mjs";
import { DEFAULT_LIMITS } from "./constants.mjs";

function display(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function sameMultiset(before, after) {
  if (before.length !== after.length) return false;
  const left = [...before].sort();
  const right = [...after].sort();
  return left.join("\0") === right.join("\0");
}

function pathDepth(path) {
  if (!path) return 0;
  return path.split("/").filter(Boolean).length;
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
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxExcerptBytes) return text;
  let cut = text;
  while (Buffer.byteLength(cut, "utf8") > maxExcerptBytes) cut = cut.slice(0, Math.max(0, cut.length - 1));
  return cut;
}

export function diffJson(before, after, limitsInput = {}) {
  const limits = {
    maxChanges: limitsInput.maxChanges ?? DEFAULT_LIMITS.maxChanges,
    maxExcerptBytes: limitsInput.maxExcerptBytes ?? DEFAULT_LIMITS.maxExcerptBytes,
    maxJsonDepth: limitsInput.maxJsonDepth ?? DEFAULT_LIMITS.maxJsonDepth,
    maxJsonNodes: limitsInput.maxJsonNodes ?? DEFAULT_LIMITS.maxJsonNodes,
  };
  const changes = [];
  const stats = { nodes: 0 };
  visit(before, after, "", changes, limits, stats);
  return {
    changes: changes.slice(0, limits.maxChanges).map((change) => ({
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

function visit(before, after, path, changes, limits, stats) {
  stats.nodes += 1;
  if (stats.nodes > limits.maxJsonNodes) {
    markTruncated(changes, "maxJsonNodes");
    return;
  }
  if (pathDepth(path) > limits.maxJsonDepth) {
    markTruncated(changes, "maxJsonDepth");
    return;
  }
  try {
    if (canonicalize(before) === canonicalize(after)) return;
  } catch {
    pushChange(changes, limits.maxChanges, {
      class: "semantic",
      op: "replace",
      path: path || "/",
      before: display(before),
      after: display(after),
    });
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const beforeKeys = before.map((item) => canonicalize(item));
    const afterKeys = after.map((item) => canonicalize(item));
    if (sameMultiset(beforeKeys, afterKeys) && beforeKeys.join("\0") !== afterKeys.join("\0")) {
      pushChange(changes, limits.maxChanges, {
        class: "order",
        op: "reorder",
        path: path || "/",
        before: JSON.stringify(before),
        after: JSON.stringify(after),
      });
      return;
    }
    pushChange(changes, limits.maxChanges, {
      class: "semantic",
      op: "replace",
      path: path || "/",
      before: display(before),
      after: display(after),
    });
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      if (changes.length >= limits.maxChanges) {
        markTruncated(changes, "maxChanges");
        return;
      }
      const childPath = `${path}/${key}`;
      const hasBefore = Object.hasOwn(before, key);
      const hasAfter = Object.hasOwn(after, key);
      if (!hasBefore) {
        pushChange(changes, limits.maxChanges, {
          class: "semantic",
          op: "add",
          path: childPath,
          after: display(after[key]),
        });
        continue;
      }
      if (!hasAfter) {
        pushChange(changes, limits.maxChanges, {
          class: "semantic",
          op: "replace",
          path: childPath,
          before: display(before[key]),
          after: display(null),
        });
        continue;
      }
      visit(before[key], after[key], childPath, changes, limits, stats);
    }
    return;
  }

  pushChange(changes, limits.maxChanges, {
    class: "semantic",
    op: "replace",
    path: path || "/",
    before: display(before),
    after: display(after),
  });
}
