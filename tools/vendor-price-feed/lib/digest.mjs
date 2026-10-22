import { createHash } from "node:crypto";
import { OBSERVATION_FIELDS } from "./pins.mjs";

export function canonicalObservation(input) {
  const body = {};
  for (const key of OBSERVATION_FIELDS) {
    body[key] = input[key] === undefined ? null : input[key];
  }
  return body;
}

export function observationDigest(input) {
  const canonical = canonicalObservation(input);
  const json = JSON.stringify(canonical);
  return createHash("sha256").update(json).digest("hex");
}
