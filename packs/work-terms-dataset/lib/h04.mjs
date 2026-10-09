import { DISJOINT_FROM, H04_MARKERS } from "./schema.mjs";

const H04_TEXT_RE =
  /\b(licensed regression pack|hidden evaluator answers?|gold answers?|evaluator oracle)\b/i;

export function detectH04Leak(record) {
  const errors = [];
  if (!record || typeof record !== "object") return errors;

  for (const key of H04_MARKERS) {
    if (Object.hasOwn(record, key)) {
      errors.push({
        code: "h04_regression_pack_leak",
        path: key,
        message: `field ${key} belongs to H04 licensed regression packs, which this dataset does not own`,
      });
    }
  }

  const blobs = [];
  if (typeof record.body === "string") blobs.push(["body", record.body]);
  if (record.republication && typeof record.republication.statement === "string") {
    blobs.push(["republication.statement", record.republication.statement]);
  }
  if (record.provenance && typeof record.provenance.sourceNote === "string") {
    blobs.push(["provenance.sourceNote", record.provenance.sourceNote]);
  }
  for (const [path, text] of blobs) {
    if (H04_TEXT_RE.test(text)) {
      errors.push({
        code: "h04_regression_pack_leak",
        path,
        message: "text claims H04 licensed-regression material",
      });
    }
  }

  return errors;
}

export function disjointFromH04(catalog) {
  const listed = catalog?.disjointFrom;
  if (!Array.isArray(listed)) return false;
  return DISJOINT_FROM.every((item) => listed.includes(item));
}
