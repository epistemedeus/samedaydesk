/**
 * Independent used-pointer witness for SPDX JSON Schema 2.3 vs 3.0.1.
 * RFC 6901 presence + deep JSON equality. Does not import kit engines.
 */

function tokensOf(pointer) {
  if (pointer === "") return { ok: true, tokens: [] };
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    return { ok: false, tokens: [] };
  }
  return {
    ok: true,
    tokens: pointer
      .slice(1)
      .split("/")
      .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~")),
  };
}

export function getAtPointer(doc, pointer) {
  const parsed = tokensOf(pointer);
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

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

export function deepEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function asDoc(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function usedPointers(used) {
  if (!used) return [];
  if (Array.isArray(used)) return used.filter((p) => typeof p === "string");
  if (typeof used === "object" && Array.isArray(used.pointers)) {
    return used.pointers.filter((p) => typeof p === "string");
  }
  return [];
}

function factOf({ changed, unchanged, added, removed, unknown }) {
  if (added.length || removed.length || changed.length) {
    return [
      "used-pointer-drift",
      `added=${added.length}`,
      `removed=${removed.length}`,
      `changed=${changed.length}`,
      `unchanged=${unchanged.length}`,
      `unknown=${unknown.length}`,
    ].join(" ");
  }
  if (unknown.length && unchanged.length) {
    return `partial-unchanged-with-unknown unchanged=${unchanged.length} unknown=${unknown.length}`;
  }
  if (unknown.length) return `unknown-used-pointers count=${unknown.length}`;
  return `no-used-pointer-drift unchanged=${unchanged.length}`;
}

/**
 * @param {unknown} before
 * @param {unknown} after
 * @param {{pointers?: string[]}|string[]|null} [used]
 * @returns {{fact: string, changed: string[], unchanged: string[], added: string[], removed: string[], unknown: string[]}}
 */
export function witness(before, after, used) {
  const beforeDoc = asDoc(before);
  const afterDoc = asDoc(after);
  const pointers = usedPointers(used);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  const unknown = [];

  for (const pointer of pointers) {
    const left = getAtPointer(beforeDoc, pointer);
    const right = getAtPointer(afterDoc, pointer);
    if (left.invalid || right.invalid) {
      unknown.push(pointer);
      continue;
    }
    if (!left.present && !right.present) {
      unknown.push(pointer);
      continue;
    }
    if (!left.present && right.present) {
      added.push(pointer);
      continue;
    }
    if (left.present && !right.present) {
      removed.push(pointer);
      continue;
    }
    if (deepEqual(left.value, right.value)) unchanged.push(pointer);
    else changed.push(pointer);
  }

  return {
    fact: factOf({ changed, unchanged, added, removed, unknown }),
    changed,
    unchanged,
    added,
    removed,
    unknown,
  };
}
