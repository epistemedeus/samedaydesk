import { createHash } from "node:crypto";
import { ERROR_CODES, TERMS_KINDS } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

function omitIdentity(doc) {
  const rest = { ...doc };
  delete rest.kind;
  delete rest.schema;
  return rest;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashTermsDocument(doc = {}) {
  const kind = doc.kind;
  if (!TERMS_KINDS.includes(kind)) {
    return refuse("unknown_terms_kind", "terms kind must be disclosure, kernel, settlement-ledger, or wrapper-receipt", {
      kind,
    });
  }
  const schema = typeof doc.schema === "string" ? doc.schema : null;
  const body = Object.prototype.hasOwnProperty.call(doc, "body") ? doc.body : omitIdentity(doc);
  const sha256 = createHash("sha256")
    .update(stableStringify({ kind, schema, body }), "utf8")
    .digest("hex");
  return {
    ok: true,
    kind,
    schema,
    sha256,
  };
}

export function compareTerms(left, right, options = {}) {
  const a = hashTermsDocument(left);
  if (!a.ok) return a;
  const b = hashTermsDocument(right);
  if (!b.ok) return b;
  const unlike = a.kind !== b.kind || (a.schema && b.schema && a.schema !== b.schema);
  if (options.forceEqual === true && unlike) {
    return refuse(
      ERROR_CODES.UNLIKE_TERMS_FORCED_EQUAL,
      "unlike terms documents cannot be forced equal",
      { left: { kind: a.kind, schema: a.schema, sha256: a.sha256 }, right: { kind: b.kind, schema: b.schema, sha256: b.sha256 } },
    );
  }
  return {
    ok: true,
    comparable: !unlike,
    equal: !unlike && a.sha256 === b.sha256,
    left: { kind: a.kind, schema: a.schema, sha256: a.sha256 },
    right: { kind: b.kind, schema: b.schema, sha256: b.sha256 },
  };
}
