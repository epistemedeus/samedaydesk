import { MAP_PATH, PIN_PATH, loadJson } from "./paths.mjs";

const REQUIRED_MAP_FIELDS = [
  "schema",
  "feature",
  "goal",
  "entrypoint",
  "command",
  "state",
  "pin",
  "surfaces",
  "jobs",
  "seededFailures",
];

export function loadMap(path = MAP_PATH) {
  const map = loadJson(path);
  const pin = loadJson(PIN_PATH);
  const errors = [];
  for (const field of REQUIRED_MAP_FIELDS) {
    if (map[field] == null) errors.push(`map missing ${field}`);
  }
  if (map.schema !== "samedaydesk.verify-sds.feature-map.v1") {
    errors.push(`unexpected map schema ${map.schema}`);
  }
  if (map.feature !== "useful-jobs") errors.push("feature must be useful-jobs");
  if (!Array.isArray(map.jobs) || map.jobs.length !== 10) {
    errors.push(`expected 10 jobs, got ${map.jobs?.length}`);
  }
  const ids = (map.jobs || []).map((j) => j.id);
  if (new Set(ids).size !== ids.length) errors.push("duplicate job ids");
  if (map.pin?.sha256 !== pin.sha256) errors.push("map.pin.sha256 != PIN.json");
  if (map.pin?.bytes !== pin.bytes) errors.push("map.pin.bytes != PIN.json");
  if (map.pin?.version !== pin.version) errors.push("map.pin.version != PIN.json");
  if (map.pin?.purchaseAuthority !== false) errors.push("purchaseAuthority must be false");
  const forbidden = map.outOfScope || [];
  for (const item of ["publish", "registry", "payment", "checkout", "neomorphic-io"]) {
    if (!forbidden.includes(item)) errors.push(`outOfScope missing ${item}`);
  }
  return { map, pin, errors, ids };
}
