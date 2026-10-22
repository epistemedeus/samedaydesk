import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CASES_DIR, CATALOG_PATH, SCHEMA_PATH } from "./paths.mjs";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertAllowed(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label}:${value}`);
}

export function validateCaseSpec(spec, schema, id = spec?.id) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error(`case_not_object:${id}`);
  }
  for (const key of schema.required) {
    if (spec[key] === undefined) throw new Error(`case_missing:${id}:${key}`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(spec)) {
      if (!(key in schema.properties)) throw new Error(`case_unknown_field:${id}:${key}`);
    }
  }
  if (spec.schemaVersion !== 1) throw new Error(`case_schema:${id}`);
  if (spec.repo !== "samedaydesk") throw new Error(`case_repo:${id}`);
  assertAllowed(spec.surface, schema.properties.surface.enum, `case_surface:${id}`);
  assertAllowed(spec.class, schema.properties.class.enum, `case_class:${id}`);
  assertAllowed(spec.source?.kind, schema.properties.source.properties.kind.enum, `case_source:${id}`);
  assertAllowed(spec.execute?.kind, schema.properties.execute.properties.kind.enum, `case_execute:${id}`);
  assertAllowed(
    spec.expectCorpus?.productVerdict,
    schema.properties.expectCorpus.properties.productVerdict.enum,
    `case_verdict:${id}`,
  );
  assertAllowed(
    spec.expectCorpus?.naiveRule,
    schema.properties.expectCorpus.properties.naiveRule.enum,
    `case_naive:${id}`,
  );
  if (spec.boundary?.paymentSent !== false || spec.boundary?.toolsCalled !== false) {
    throw new Error(`case_boundary:${id}`);
  }
  if (Array.isArray(spec.roles)) {
    for (const role of spec.roles) {
      assertAllowed(role, schema.properties.roles.items.enum, `case_role:${id}`);
    }
  }
  if (spec.class === "seeded-false-green" && !spec.roles?.includes("seeded-false-green")) {
    throw new Error(`case_roles:${id}`);
  }
  if (spec.class === "seeded-false-reject" && !spec.roles?.includes("seeded-false-reject")) {
    throw new Error(`case_roles:${id}`);
  }
  if (spec.execute.kind === "spawn" && !Array.isArray(spec.execute.argv)) {
    throw new Error(`case_argv:${id}`);
  }
  if (spec.execute.kind === "classify-http" && !spec.execute.fixture) {
    throw new Error(`case_fixture:${id}`);
  }
  if (spec.execute.kind === "soft-404-capture" && !spec.execute.fixture) {
    throw new Error(`case_fixture:${id}`);
  }
}

export function assertCatalogRowMatchesSpec(row, spec) {
  if (!row || row.id !== spec.id) throw new Error(`catalog_row_mismatch:${spec.id}`);
  if (row.surface !== spec.surface || row.feature !== spec.feature || row.class !== spec.class) {
    throw new Error(`catalog_row_mismatch:${spec.id}`);
  }
}

export function loadCatalog() {
  const catalog = readJson(CATALOG_PATH);
  if (catalog.schemaVersion !== 1) throw new Error("catalog_schema");
  if (catalog.repo !== "samedaydesk") throw new Error("catalog_repo");
  if (!Array.isArray(catalog.cases) || catalog.cases.length === 0) {
    throw new Error("catalog_empty");
  }
  return catalog;
}

export function discoverCaseIds() {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR)
    .filter((name) => statSync(join(CASES_DIR, name)).isDirectory())
    .filter((name) => existsSync(join(CASES_DIR, name, "case.json")))
    .sort();
}

export function loadCase(id, schema = readJson(SCHEMA_PATH)) {
  const dir = join(CASES_DIR, id);
  const spec = readJson(join(dir, "case.json"));
  if (spec.id !== id) throw new Error(`case_id_mismatch:${id}`);
  validateCaseSpec(spec, schema, id);
  return { id, dir, spec };
}

export function loadCorpus() {
  const catalog = loadCatalog();
  const schema = readJson(SCHEMA_PATH);
  const diskIds = discoverCaseIds();
  const catalogIds = catalog.cases.map((row) => row.id);
  const missingOnDisk = catalogIds.filter((id) => !diskIds.includes(id));
  const extraOnDisk = diskIds.filter((id) => !catalogIds.includes(id));
  if (missingOnDisk.length || extraOnDisk.length) {
    const error = new Error("catalog_disk_mismatch");
    error.detail = { missingOnDisk, extraOnDisk };
    throw error;
  }
  const cases = catalogIds.map((id) => {
    const loaded = loadCase(id, schema);
    const row = catalog.cases.find((item) => item.id === id);
    assertCatalogRowMatchesSpec(row, loaded.spec);
    return loaded;
  });
  const seededGreen = cases.find((item) => item.id === catalog.seededFalseGreen);
  if (!seededGreen || seededGreen.spec.class !== "seeded-false-green") {
    throw new Error("catalog_seeded_false_green");
  }
  const seededReject = cases.find((item) => item.id === catalog.seededFalseReject);
  if (!seededReject || seededReject.spec.class !== "seeded-false-reject") {
    throw new Error("catalog_seeded_false_reject");
  }
  return { catalog, schema, cases };
}
