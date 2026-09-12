/**
 * Independent webhook-example JSON Pointer witness.
 * Does not import kit engine compare/oracle modules.
 * RFC 6901 presence + canonical-value equality only (not JSON Schema combinators).
 */

export const ADDED_POINTER = "/pull_request/auto_merge";
export const CONTROL_POINTER = "/action";
export const DEFAULT_USED = Object.freeze([ADDED_POINTER, CONTROL_POINTER]);

function parseJsonPointer(pointer) {
  if (pointer === "") return { ok: true, tokens: [] };
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    return { ok: false, pointer };
  }
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  return { ok: true, tokens };
}

export function getAtPointer(doc, pointer) {
  const parsed = parseJsonPointer(pointer);
  if (!parsed.ok) return { present: false, invalid: true, pointer };
  let cur = doc;
  for (const token of parsed.tokens) {
    if (cur === null || typeof cur !== "object") {
      return { present: false, pointer };
    }
    if (!Object.prototype.hasOwnProperty.call(cur, token)) {
      return { present: false, pointer };
    }
    cur = cur[token];
  }
  return { present: true, value: cur, pointer };
}

export function canonicalJson(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function normalizeUsed(used) {
  if (used == null) return [...DEFAULT_USED];
  if (Array.isArray(used)) return used.map(String);
  if (typeof used === "string") {
    const text = used.trim();
    if (text.startsWith("/") || text === "") return [used];
    return normalizeUsed(JSON.parse(text));
  }
  if (used && Array.isArray(used.pointers)) return used.pointers.map(String);
  throw new Error('used must be { "pointers": ["/json/pointer"] }');
}

function classifyHit(beforeHit, afterHit) {
  if (beforeHit.invalid || afterHit.invalid) {
    return { class: "unknown", reason: "invalid-json-pointer" };
  }
  if (!beforeHit.present && !afterHit.present) {
    return { class: "unknown", reason: "absent-in-both" };
  }
  if (!beforeHit.present && afterHit.present) {
    return { class: "added", reason: "present-after-only" };
  }
  if (beforeHit.present && !afterHit.present) {
    return { class: "removed", reason: "present-before-only" };
  }
  if (canonicalJson(beforeHit.value) === canonicalJson(afterHit.value)) {
    return { class: "unchanged", reason: "value-equal" };
  }
  return { class: "changed", reason: "value-change" };
}

function factFrom(rows) {
  const added = rows.filter((row) => row.class === "added").map((row) => row.pointer);
  const removed = rows.filter((row) => row.class === "removed").map((row) => row.pointer);
  const changed = rows.filter((row) => row.class === "changed").map((row) => row.pointer);
  const unchanged = rows.filter((row) => row.class === "unchanged").map((row) => row.pointer);
  const unknown = rows.filter((row) => row.class === "unknown").map((row) => row.pointer);
  if (added.includes(ADDED_POINTER) && unchanged.includes(CONTROL_POINTER)) {
    return "octokit pull_request.opened webhook example: /pull_request/auto_merge added; /action unchanged";
  }
  if (added.includes(ADDED_POINTER)) {
    return "octokit pull_request.opened webhook example: /pull_request/auto_merge added";
  }
  if (!added.length && !removed.length && !changed.length && unchanged.length && !unknown.length) {
    return "used pointers unchanged";
  }
  return [
    `added=${added.join(",") || "none"}`,
    `removed=${removed.join(",") || "none"}`,
    `changed=${changed.join(",") || "none"}`,
    `unchanged=${unchanged.join(",") || "none"}`,
    `unknown=${unknown.join(",") || "none"}`,
  ].join("; ");
}

/**
 * @param {unknown} before
 * @param {unknown} after
 * @param {{pointers: string[]}|string[]|string|null} [used]
 * @returns {{fact: string, changed: string[], unchanged: string[], added: string[], removed: string[], unknown: string[]}}
 */
export function witness(before, after, used) {
  const pointers = normalizeUsed(used);
  const rows = pointers.map((pointer) => {
    const beforeHit = getAtPointer(before, pointer);
    const afterHit = getAtPointer(after, pointer);
    const classified = classifyHit(beforeHit, afterHit);
    return {
      pointer,
      class: classified.class,
      reason: classified.reason,
      beforePresent: Boolean(beforeHit.present),
      afterPresent: Boolean(afterHit.present),
      beforeValue: beforeHit.present ? beforeHit.value : undefined,
      afterValue: afterHit.present ? afterHit.value : undefined,
    };
  });
  const pick = (cls) => rows.filter((row) => row.class === cls).map((row) => row.pointer);
  return {
    fact: factFrom(rows),
    changed: pick("changed"),
    unchanged: pick("unchanged"),
    added: pick("added"),
    removed: pick("removed"),
    unknown: pick("unknown"),
    rows,
  };
}

export default witness;
