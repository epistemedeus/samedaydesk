import { createHash } from "node:crypto";
import { ENGINE_REPORT_SCHEMA, TRIAL_SCHEMA } from "./pins.mjs";

export function sha256Text(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

/** Disclosure-shaped document. Distinct schema from lockfile pin terms. */
export function disclosureHash(fields) {
  return sha256Text(
    stableStringify({
      schema: "samedaydesk.disclosure.not-pin-terms.v1",
      ...fields,
    }),
  );
}

export function trialBodyDigest(body) {
  return sha256Text(
    stableStringify({
      schema: TRIAL_SCHEMA,
      engineSchema: ENGINE_REPORT_SCHEMA,
      changed: body.changed,
      added: body.added,
      removed: body.removed,
      omittedResolved: body.omittedResolved,
      staged: body.staged,
    }),
  );
}
