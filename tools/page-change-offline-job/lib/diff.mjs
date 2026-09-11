import { canonicalize, isPlainObject } from "./canonical.mjs";

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

export function excerpt(value, maxExcerptBytes) {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxExcerptBytes) return text;
  let cut = text;
  while (Buffer.byteLength(cut, "utf8") > maxExcerptBytes) cut = cut.slice(0, Math.max(0, cut.length - 1));
  return cut;
}

export function diffJson(before, after, { maxChanges = 64, maxExcerptBytes = 200 } = {}) {
  const changes = [];
  visit(before, after, "", changes, maxChanges);
  return {
    changes: changes.slice(0, maxChanges).map((change) => ({
      ...change,
      beforeEvidence: change.before === undefined ? undefined : excerpt(change.before, maxExcerptBytes),
      afterEvidence: change.after === undefined ? undefined : excerpt(change.after, maxExcerptBytes),
      evidenceTruncated: [change.before, change.after].some((value) =>
        value !== undefined && Buffer.byteLength(String(value), "utf8") > maxExcerptBytes),
    })),
    truncated: changes.length > maxChanges,
    canonicalEqual: changes.length === 0,
  };
}

function visit(before, after, path, changes, maxChanges) {
  if (changes.length >= maxChanges) return;
  try {
    if (canonicalize(before) === canonicalize(after)) return;
  } catch {
    changes.push({
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
      changes.push({
        class: "order",
        op: "reorder",
        path: path || "/",
        before: JSON.stringify(before),
        after: JSON.stringify(after),
      });
      return;
    }
    changes.push({
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
      if (changes.length >= maxChanges) return;
      const childPath = `${path}/${key}`;
      const hasBefore = Object.hasOwn(before, key);
      const hasAfter = Object.hasOwn(after, key);
      if (!hasBefore) {
        changes.push({
          class: "semantic",
          op: "add",
          path: childPath,
          after: display(after[key]),
        });
        continue;
      }
      if (!hasAfter) {
        changes.push({
          class: "semantic",
          op: "replace",
          path: childPath,
          before: display(before[key]),
          after: display(null),
        });
        continue;
      }
      visit(before[key], after[key], childPath, changes, maxChanges);
    }
    return;
  }

  changes.push({
    class: "semantic",
    op: "replace",
    path: path || "/",
    before: display(before),
    after: display(after),
  });
}
