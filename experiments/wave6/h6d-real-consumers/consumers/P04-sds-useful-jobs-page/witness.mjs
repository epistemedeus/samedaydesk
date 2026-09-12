/**
 * Independent page-fact witness for the SDS useful-jobs surface.
 * Compares title/description/headings on held extract-batch JSON.
 * Does not import useful-jobs engines or merchant compare.
 */
export const SELECTED_FIELDS = Object.freeze(["title", "description", "headings"]);
export const PAGE_SOURCE = "https://samedaydesk.com/for-agents/useful-jobs";
export const EXTRACT_PRODUCT = "samedaydesk-extract-batch";
export const EXTRACT_SCHEMA = "samedaydesk.extract-batch.v0";

const DEFAULT_FIELDS = SELECTED_FIELDS;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  return JSON.stringify(value);
}

export function normalizeUsed(used) {
  if (used == null) return [...DEFAULT_FIELDS];
  if (typeof used === "string") {
    return used.split(",").map((part) => part.trim()).filter(Boolean);
  }
  if (Array.isArray(used)) return used.map(String);
  if (isPlainObject(used) && Array.isArray(used.fields)) return used.fields.map(String);
  return [...DEFAULT_FIELDS];
}

export function extractJsxHeadings(tsx, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out = [];
  let match;
  while ((match = re.exec(tsx))) {
    let inner = match[1];
    inner = inner.replace(/\{\s*["'] ["']\s*\}/g, " ");
    inner = inner.replace(/<[^>]+>/g, "");
    inner = inner.replace(/\{[^}]*\}/g, "");
    inner = inner.replace(/\s+/g, " ").trim();
    if (inner) out.push(inner);
  }
  return out;
}

export function factsFromPageSource(tsx, excerpt) {
  const titleMatch = String(excerpt).match(/export const USEFUL_JOBS_TITLE = "([^"]+)";/);
  const descMatch = String(excerpt).match(/export const USEFUL_JOBS_DESCRIPTION =\s*"([^"]+)";/);
  if (!titleMatch || !descMatch) {
    return { ok: false, reason: "shell-title-or-description-missing" };
  }
  return {
    ok: true,
    title: titleMatch[1],
    description: descMatch[1],
    headings: {
      h1: extractJsxHeadings(tsx, "h1"),
      h2: extractJsxHeadings(tsx, "h2"),
    },
  };
}

export function factsFromBatch(input) {
  let batch = input;
  if (typeof batch === "string") {
    try {
      batch = JSON.parse(batch);
    } catch {
      return { ok: false, reason: "not-json" };
    }
  }
  if (!isPlainObject(batch)) return { ok: false, reason: "not-object" };
  if (batch.product !== EXTRACT_PRODUCT || batch.schemaVersion !== EXTRACT_SCHEMA) {
    return { ok: false, reason: "not-extract-batch" };
  }
  const sources = Array.isArray(batch.sources) ? batch.sources : [];
  const row = sources.find((item) => isPlainObject(item) && item.status === "success" && isPlainObject(item.data));
  if (!row) return { ok: false, reason: "no-success-row" };
  return {
    ok: true,
    source: row.source,
    charged: batch.charged,
    data: row.data,
    title: row.data.title,
    description: row.data.description,
    headings: row.data.headings,
  };
}

function fieldValue(facts, field) {
  if (!facts?.ok) return undefined;
  if (Object.hasOwn(facts, field)) return facts[field];
  if (isPlainObject(facts.data) && Object.hasOwn(facts.data, field)) return facts.data[field];
  return undefined;
}

function present(value) {
  return value !== undefined;
}

/**
 * @param {object|string} before held extract-batch JSON
 * @param {object|string} after held extract-batch JSON
 * @param {string[]|{fields?: string[]}|string} [used] selected fields
 * @returns {{fact: string, changed: object[], unchanged: object[], added: object[], removed: object[], unknown: object[]}}
 */
export function witness(before, after, used) {
  const fields = normalizeUsed(used);
  const beforeFacts = factsFromBatch(before);
  const afterFacts = factsFromBatch(after);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  const unknown = [];

  if (!beforeFacts.ok || !afterFacts.ok) {
    if (!beforeFacts.ok) unknown.push({ side: "before", reason: beforeFacts.reason });
    if (!afterFacts.ok) unknown.push({ side: "after", reason: afterFacts.reason });
    return { fact: "unknown", changed, unchanged, added, removed, unknown };
  }

  for (const field of fields) {
    const left = fieldValue(beforeFacts, field);
    const right = fieldValue(afterFacts, field);
    const leftOn = present(left);
    const rightOn = present(right);
    if (!leftOn && !rightOn) {
      unknown.push({ field, reason: "absent_both_sides" });
      continue;
    }
    if (!leftOn && rightOn) {
      added.push({ field, after: right });
      changed.push({ field, op: "add", after: right });
      continue;
    }
    if (leftOn && !rightOn) {
      removed.push({ field, before: left });
      changed.push({ field, op: "remove", before: left });
      continue;
    }
    if (canonical(left) === canonical(right)) {
      unchanged.push({ field, value: left });
    } else {
      changed.push({ field, op: "replace", before: left, after: right });
    }
  }

  const fact = changed.length ? "changed" : unknown.length && !unchanged.length ? "unknown" : "unchanged";
  return { fact, changed, unchanged, added, removed, unknown };
}

export function expectedOfficialDelta() {
  return {
    title: "unchanged",
    description: "changed",
    headings: "changed",
  };
}
