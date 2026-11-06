import { readBoundedJson, writeJsonAtomic } from "./json.mjs";
import { JOURNEY_SCHEMA } from "./constants.mjs";

export function readJourney(journeyPath) {
  const read = readBoundedJson(journeyPath);
  if (!read.ok && read.reason === "input_missing") return { ok: false, reason: "journey_missing" };
  if (!read.ok) return read;
  if (!read.value || read.value.schema !== JOURNEY_SCHEMA) {
    return { ok: false, reason: "journey_schema_refused" };
  }
  return { ok: true, journey: read.value };
}

export function writeJourney(journeyPath, journey) {
  writeJsonAtomic(journeyPath, journey);
}
