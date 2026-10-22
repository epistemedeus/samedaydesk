import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CORPUS_ROOT } from "./root.mjs";
import { CURRENT_PIN } from "./pin.mjs";

export const CATALOG_SCHEMA = "samedaydesk.regression-sds.stale-output.catalog.v1";
export const FIXTURE_SCHEMA = "samedaydesk.regression-sds.stale-output.fixture.v1";

const SURFACES = new Set(["useful-jobs", "listing", "verify"]);
const CLASSES = new Set(["stale", "fabricated", "greenwash", "control"]);
const EXPECTS = new Set(["reject", "accept"]);

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

export function loadManifest() {
  const abs = join(CORPUS_ROOT, "MANIFEST.json");
  const manifest = JSON.parse(readFileSync(abs, "utf8"));
  if (manifest.schema !== CATALOG_SCHEMA) {
    fail("CATALOG_SCHEMA", `expected ${CATALOG_SCHEMA}`);
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length < 5) {
    fail("CATALOG_CASES", "catalog must list at least 5 cases");
  }
  const seeded = manifest.cases.filter((row) => row.seededGreenwash);
  if (seeded.length !== 1) fail("CATALOG_SEED", "catalog must name exactly one seededGreenwash case");
  if (manifest.seededGreenwash !== seeded[0].id) {
    fail("CATALOG_SEED", "seededGreenwash id mismatch");
  }
  if (
    manifest.currentPin?.version !== CURRENT_PIN.version ||
    manifest.currentPin?.sha256 !== CURRENT_PIN.sha256 ||
    manifest.currentPin?.bytes !== CURRENT_PIN.bytes
  ) {
    fail("CATALOG_PIN", "MANIFEST currentPin does not match live useful-jobs kit");
  }
  const ids = new Set();
  for (const row of manifest.cases) {
    if (!row.id || ids.has(row.id)) fail("CATALOG_ID", `duplicate or missing case id ${row.id}`);
    ids.add(row.id);
    if (!EXPECTS.has(row.expect)) fail("CATALOG_EXPECT", `${row.id} expect must be reject|accept`);
    if (!CLASSES.has(row.class)) fail("CATALOG_CLASS", `${row.id} unknown class`);
    if (!row.file) fail("CATALOG_FILE", `${row.id} missing file`);
    const fixtureAbs = join(CORPUS_ROOT, row.file);
    if (!existsSync(fixtureAbs)) fail("CATALOG_FILE", `missing ${row.file}`);
    if (row.seededGreenwash && row.expect !== "reject") {
      fail("CATALOG_SEED", "seeded greenwash must expect reject");
    }
  }
  return manifest;
}

export function loadFixture(relOrAbs) {
  const candidates = [relOrAbs, join(CORPUS_ROOT, relOrAbs), join(CORPUS_ROOT, "fixtures", relOrAbs)];
  let abs = null;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      abs = candidate;
      break;
    }
  }
  if (!abs) fail("FIXTURE_MISSING", `fixture not found: ${relOrAbs}`);
  const raw = JSON.parse(readFileSync(abs, "utf8"));
  validateFixture(raw);
  return { abs, raw };
}

export function validateFixture(raw) {
  if (!raw || typeof raw !== "object") fail("FIXTURE_SCHEMA", "fixture must be an object");
  if (raw.schema && raw.schema !== FIXTURE_SCHEMA) {
    fail("FIXTURE_SCHEMA", `expected ${FIXTURE_SCHEMA}`);
  }
  if (!raw.id || typeof raw.id !== "string") fail("FIXTURE_SCHEMA", "fixture.id required");
  if (!SURFACES.has(raw.surface)) fail("FIXTURE_SCHEMA", `${raw.id} surface must be useful-jobs|listing|verify`);
  if (!CLASSES.has(raw.class)) fail("FIXTURE_SCHEMA", `${raw.id} unknown class`);
  if (typeof raw.expectReject !== "boolean") fail("FIXTURE_SCHEMA", `${raw.id} expectReject boolean required`);
  if (!raw.output || typeof raw.output !== "object") fail("FIXTURE_SCHEMA", `${raw.id} output object required`);
  if (raw.class === "control" && raw.expectReject !== false) {
    fail("FIXTURE_SCHEMA", "control fixtures must expectReject false");
  }
  if (raw.seededGreenwash && raw.expectReject !== true) {
    fail("FIXTURE_SCHEMA", "seeded greenwash must expectReject true");
  }
  return true;
}

export function loadSeed(name = "false-accept.json") {
  return loadFixture(join("fixtures", "seeded", name));
}
