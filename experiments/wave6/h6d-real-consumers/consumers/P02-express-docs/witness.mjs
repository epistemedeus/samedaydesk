/**
 * Independent semantic witness for P02 expressjs.com docs/content.md.
 * Compares derived title/headings/text. Does not import kit engine compare.
 */
import { extractMarkdownFacts, normalizeTitleFact, SELECTED_FIELDS } from "./md-facts.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function dataFrom(input) {
  if (typeof input === "string") return extractMarkdownFacts(input);
  if (!isPlainObject(input)) return {};
  if (Array.isArray(input.sources) && isPlainObject(input.sources[0]?.data)) {
    return input.sources[0].data;
  }
  if (isPlainObject(input.data)) return input.data;
  return input;
}

function fieldsFrom(used) {
  if (!used) return [...SELECTED_FIELDS];
  if (Array.isArray(used)) return used.filter(Boolean);
  if (typeof used === "string") {
    return used.split(",").map((part) => part.trim()).filter(Boolean);
  }
  if (Array.isArray(used.fields)) return used.fields.filter(Boolean);
  return [...SELECTED_FIELDS];
}

function headingValues(headings, level) {
  if (!isPlainObject(headings)) return [];
  const list = headings[level];
  return Array.isArray(list) ? list.map(String) : [];
}

function multisetDelta(beforeList, afterList) {
  const counts = new Map();
  for (const item of beforeList) counts.set(item, (counts.get(item) ?? 0) + 1);
  const added = [];
  const removed = [];
  const afterCounts = new Map();
  for (const item of afterList) afterCounts.set(item, (afterCounts.get(item) ?? 0) + 1);
  const keys = new Set([...counts.keys(), ...afterCounts.keys()]);
  for (const key of keys) {
    const beforeN = counts.get(key) ?? 0;
    const afterN = afterCounts.get(key) ?? 0;
    if (afterN > beforeN) {
      for (let i = 0; i < afterN - beforeN; i += 1) added.push(key);
    } else if (beforeN > afterN) {
      for (let i = 0; i < beforeN - afterN; i += 1) removed.push(key);
    }
  }
  return { added, removed };
}

export function witness(before, after, used) {
  const fields = fieldsFrom(used);
  const beforeData = dataFrom(before);
  const afterData = dataFrom(after);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  const unknown = [];

  for (const field of fields) {
    const beforeHas = Object.hasOwn(beforeData, field);
    const afterHas = Object.hasOwn(afterData, field);
    if (!beforeHas || !afterHas) {
      unknown.push({
        field,
        beforePresent: beforeHas,
        afterPresent: afterHas,
        reason: "absent_field_is_coverage_unknown_not_deletion",
      });
      continue;
    }
    let beforeValue = beforeData[field];
    let afterValue = afterData[field];
    if (field === "title") {
      beforeValue = normalizeTitleFact(beforeValue);
      afterValue = normalizeTitleFact(afterValue);
    }
    if (canonical(beforeValue) === canonical(afterValue)) {
      unchanged.push(field);
      continue;
    }
    changed.push(field);
    if (field === "headings" && isPlainObject(beforeValue) && isPlainObject(afterValue)) {
      for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
        const delta = multisetDelta(headingValues(beforeValue, level), headingValues(afterValue, level));
        for (const item of delta.added) added.push(`${level}:${item}`);
        for (const item of delta.removed) removed.push(`${level}:${item}`);
      }
    }
  }

  const codeTabsAdded = added.includes("h2:Code Tabs");
  const titleUnchanged = unchanged.includes("title");
  let fact = "selected-field compare of held extract-batch facts derived from expressjs.com docs/content.md";
  if (codeTabsAdded && titleUnchanged) {
    fact =
      "expressjs.com docs/content.md gained h2 Code Tabs; title Content is unchanged; text changed. Not a live fetch.";
  } else if (changed.length === 0 && unknown.length === 0) {
    fact = "selected fields title/headings/text are unchanged on this pair";
  } else if (changed.length) {
    fact = `selected fields changed: ${changed.join(", ")}`;
  }

  return {
    fact,
    changed,
    unchanged,
    added,
    removed,
    unknown,
  };
}

export default witness;
