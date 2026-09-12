/**
 * Independent selected-field witness for P01 nodejs.org site.json batches.
 * Does not import kit engines or compare/oracle modules.
 */

export const SELECTED_FIELDS = Object.freeze([
  "title",
  "description",
  "text",
  "jsonLd",
  "headings",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTitleFact(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[ \t]+/g, " ").trim();
}

function canonical(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "number";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function dataOf(document) {
  if (!isPlainObject(document)) return null;
  if (Array.isArray(document.sources) && isPlainObject(document.sources[0]?.data)) {
    return document.sources[0].data;
  }
  if (
    Object.hasOwn(document, "title")
    || Object.hasOwn(document, "description")
    || Object.hasOwn(document, "text")
    || Object.hasOwn(document, "jsonLd")
    || Object.hasOwn(document, "headings")
  ) {
    return document;
  }
  return null;
}

function fieldValue(data, field) {
  if (!isPlainObject(data) || !Object.hasOwn(data, field)) return { present: false, value: undefined };
  const value = field === "title" ? normalizeTitleFact(data[field]) : data[field];
  return { present: true, value };
}

/**
 * @param {object} before extract-batch or selected-field object
 * @param {object} after extract-batch or selected-field object
 * @param {{ fields?: string[] }} [used]
 * @returns {{ fact: string, changed: string[], unchanged: string[], added: string[], removed: string[], unknown: string[] }}
 */
export function witness(before, after, used = {}) {
  const fields = Array.isArray(used.fields) && used.fields.length ? [...used.fields] : [...SELECTED_FIELDS];
  const beforeData = dataOf(before);
  const afterData = dataOf(after);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  const unknown = [];

  if (!beforeData && !afterData) {
    return {
      fact: "both sides lack selected-field data",
      changed,
      unchanged,
      added,
      removed,
      unknown: [...fields],
    };
  }

  for (const field of fields) {
    const left = fieldValue(beforeData, field);
    const right = fieldValue(afterData, field);
    if (!left.present && !right.present) {
      unknown.push(field);
      continue;
    }
    if (!left.present && right.present) {
      added.push(field);
      continue;
    }
    if (left.present && !right.present) {
      removed.push(field);
      continue;
    }
    if (canonical(left.value) === canonical(right.value)) unchanged.push(field);
    else changed.push(field);
  }

  const fact = changed.length
    ? `selected fields changed: ${changed.join(", ")}`
    : unknown.length && !unchanged.length
      ? "selected fields coverage unknown"
      : "selected fields unchanged";

  return { fact, changed, unchanged, added, removed, unknown };
}

export function badgeFact(beforeSite, afterSite) {
  const beforeBadge = beforeSite?.websiteBadges?.index ?? null;
  const afterBadge = afterSite?.websiteBadges?.index ?? null;
  return {
    path: "websiteBadges.index",
    before: beforeBadge
      ? { title: beforeBadge.title ?? null, text: beforeBadge.text ?? null, link: beforeBadge.link ?? null }
      : null,
    after: afterBadge
      ? { title: afterBadge.title ?? null, text: afterBadge.text ?? null, link: afterBadge.link ?? null }
      : null,
    changed:
      canonical(beforeBadge?.title) !== canonical(afterBadge?.title)
      || canonical(beforeBadge?.text) !== canonical(afterBadge?.text)
      || canonical(beforeBadge?.link) !== canonical(afterBadge?.link),
  };
}
