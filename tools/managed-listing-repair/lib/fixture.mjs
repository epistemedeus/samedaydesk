import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CASE_SCHEMA, CLOCK_ISO } from "./pins.mjs";
import { sha256Text } from "./digest.mjs";

export class FixtureRefuse extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function loadFixtureFile(filePath) {
  const abs = resolve(filePath);
  const text = readFileSync(abs, "utf8");
  let object;
  try {
    object = JSON.parse(text);
  } catch {
    throw new FixtureRefuse("invalid_fixture_json", "Fixture is not JSON");
  }
  return {
    path: abs,
    text,
    object,
    digest: sha256Text(text),
  };
}

export function validateCaseObject(caseObject) {
  if (!isPlainObject(caseObject)) {
    throw new FixtureRefuse("invalid_fixture", "Fixture must be a JSON object");
  }
  if (caseObject.schema !== CASE_SCHEMA) {
    throw new FixtureRefuse(
      "unsupported_case_schema",
      `Expected schema ${CASE_SCHEMA}`,
    );
  }
  if (typeof caseObject.clock === "string" && !CLOCK_ISO.test(caseObject.clock)) {
    throw new FixtureRefuse("invalid_clock", "clock must be ISO-8601");
  }
  if (!isPlainObject(caseObject.source)) {
    throw new FixtureRefuse("missing_source", "Fixture source observation is required");
  }
  if (!isPlainObject(caseObject.packet)) {
    throw new FixtureRefuse("missing_packet", "Fixture repair packet is required");
  }
  if (!isPlainObject(caseObject.engineInput)) {
    throw new FixtureRefuse(
      "missing_engine_input",
      "Fixture must include engineInput for listing-repair-packet",
    );
  }
  return caseObject;
}
