/**
 * Independent semantic witness for SPDX MIT html/jsonld selected fields.
 * Does not import useful-jobs engine compare/oracle modules.
 */
import { CONTROL_FIELDS, SELECTED_FIELDS, pickSourceData } from "./wrap-extract-batch.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canon(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canon(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function normalizeTitle(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[ \t]+/g, " ").trim();
}

function fieldValue(data, field) {
  if (!isPlainObject(data) || !Object.hasOwn(data, field)) return { present: false, value: undefined };
  let value = data[field];
  if (field === "title") value = normalizeTitle(value);
  return { present: true, value };
}

function usedFields(used) {
  if (used == null) return [...SELECTED_FIELDS];
  if (Array.isArray(used)) return used.filter((field) => typeof field === "string");
  if (isPlainObject(used) && Array.isArray(used.fields)) {
    return used.fields.filter((field) => typeof field === "string");
  }
  return [...SELECTED_FIELDS];
}

function seeAlsoList(jsonLd) {
  if (!isPlainObject(jsonLd)) return [];
  const raw = jsonLd.seeAlso;
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((item) => typeof item === "string");
  return [];
}

/**
 * @param {object} before extract-batch or selected-field object
 * @param {object} after extract-batch or selected-field object
 * @param {string[]|{fields?: string[]}} [used]
 * @returns {{fact: string, changed: string[], unchanged: string[], added: string[], removed: string[], unknown: string[]}}
 */
export function witness(before, after, used) {
  const fields = usedFields(used);
  const beforeData = pickSourceData(before);
  const afterData = pickSourceData(after);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  const unknown = [];

  if (!beforeData || !afterData) {
    unknown.push("sources[].data");
    return {
      fact: "held extract-batch source data missing; incomparable",
      changed,
      unchanged,
      added,
      removed,
      unknown,
    };
  }

  for (const field of fields) {
    const left = fieldValue(beforeData, field);
    const right = fieldValue(afterData, field);
    if (!left.present || !right.present) {
      unknown.push(field);
      continue;
    }
    if (canon(left.value) === canon(right.value)) {
      unchanged.push(field);
      continue;
    }
    changed.push(field);
    if (field === "jsonLd") {
      const beforeUrls = new Set(seeAlsoList(left.value));
      const afterUrls = new Set(seeAlsoList(right.value));
      for (const url of afterUrls) {
        if (!beforeUrls.has(url)) added.push(`jsonLd.seeAlso:${url}`);
      }
      for (const url of beforeUrls) {
        if (!afterUrls.has(url)) removed.push(`jsonLd.seeAlso:${url}`);
      }
    }
  }

  const textChanged = changed.includes("text");
  const jsonLdChanged = changed.includes("jsonLd");
  const titleUnchanged = unchanged.includes("title");
  const headingsUnchanged = unchanged.includes("headings");

  let fact;
  if (fields.length === 0) {
    fact = "no selected fields";
  } else if (unknown.length && !changed.length && !unchanged.length) {
    fact = "selected fields incomparable";
  } else if (!changed.length && !unknown.length) {
    fact =
      fields.every((field) => CONTROL_FIELDS.includes(field))
        ? "SPDX MIT title/headings unchanged across publisher builds (generator noise excluded)"
        : "SPDX MIT selected fields unchanged";
  } else {
    const bits = [];
    if (titleUnchanged && headingsUnchanged) bits.push("title and headings unchanged");
    if (textChanged) {
      bits.push("HTML text gained optional 'on' after 'without limitation'");
    }
    if (jsonLdChanged) {
      bits.push("jsonLd seeAlso gained additional listed URLs");
    }
    if (!bits.length) bits.push(`changed ${changed.join(", ")}`);
    fact = `SPDX MIT listed-license html/jsonld: ${bits.join("; ")}. CrossRef timestamps/blank-node ids excluded as generator noise.`;
  }

  return { fact, changed, unchanged, added, removed, unknown };
}

export { SELECTED_FIELDS, CONTROL_FIELDS };
