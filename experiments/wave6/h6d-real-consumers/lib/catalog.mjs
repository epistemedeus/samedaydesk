import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const EXPERIMENT_ROOT = resolve(here, "..");
export const CONSUMERS_DIR = join(EXPERIMENT_ROOT, "consumers");
export const ASSIGNMENT_PATH = join(EXPERIMENT_ROOT, "catalog", "ASSIGNMENT.json");

export const FAMILIES = Object.freeze(["lockfile", "schemaWebhook", "apiRoutes", "pageSnapshots"]);

export const JOB_BY_FAMILY = Object.freeze({
  lockfile: "lockfile-pin-delta",
  schemaWebhook: "json-schema-webhook-drift",
  apiRoutes: "api-upgrade-brief",
  pageSnapshots: "page-change-offline-job",
});

/** Honest non-equivalent projections. Never claim these are the same job. */
export const MIGRATIONS = Object.freeze({
  "openapi-to-sds-route-table": {
    equivalent: false,
    from: "OpenAPI/Swagger path + method (+ operationId)",
    to: "samedaydesk.route-table.v1 {path, canonical, title, robots?}",
    dropped: ["httpMethod", "operationId", "parameters", "requestBody", "responses"],
    note: "route-table-diff refuses OpenAPI path maps. A projection is caller-owned and not a published SDS table.",
  },
  "html-to-extract-batch": {
    equivalent: false,
    from: "HTML/markdown/JSON-LD vendor page bytes",
    to: "samedaydesk.extract-batch.v0 selected fields",
    dropped: ["unselected markup", "live freshness", "payment"],
    note: "page-change-offline-job never fetches. claims.fresh stays false. Clock is required.",
  },
  "yarn-to-npm-lock": {
    equivalent: false,
    from: "yarn.lock / pnpm-lock.yaml / bun.lockb",
    to: "npm package-lock.json lockfileVersion 2 or 3",
    dropped: ["entire foreign lock format"],
    note: "lockfile-pin-delta refuses yarn/pnpm/bun. That refuse is the product, not a conversion.",
  },
  "openapi-as-json-schema": {
    equivalent: false,
    from: "OpenAPI document",
    to: "json-schema-webhook-drift used JSON Pointers",
    dropped: ["paths", "operations"],
    note: "json-schema-webhook-drift refuses OpenAPI with not-this-job-openapi. Use api-upgrade-brief for used operations.",
  },
});

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadAssignment() {
  return readJson(ASSIGNMENT_PATH);
}

export function listConsumerIds() {
  if (!existsSync(CONSUMERS_DIR)) return [];
  return readdirSync(CONSUMERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function consumerDir(id) {
  return join(CONSUMERS_DIR, id);
}

export function loadConsumerRecord(id) {
  const dir = consumerDir(id);
  const assignmentPath = join(dir, "ASSIGNMENT.json");
  const ownedFile = join(dir, "owned-paths.json");
  const resultPath = join(dir, "RESULT.json");
  const acquisitionPath = join(dir, "acquisition.json");
  const briefPath = join(dir, "BRIEF.md");
  if (!existsSync(assignmentPath) && !existsSync(briefPath)) {
    const err = new Error(`unknown consumer ${id}`);
    err.code = "unknown-job";
    throw err;
  }
  const assignment = existsSync(assignmentPath) ? readJson(assignmentPath) : { id };
  const owned = existsSync(ownedFile) ? readJson(ownedFile) : null;
  const result = existsSync(resultPath) ? readJson(resultPath) : null;
  const acquisition = existsSync(acquisitionPath) ? readJson(acquisitionPath) : null;
  const family = assignment.family || owned?.family || null;
  const jobId = assignment.jobId || owned?.jobId || (family && JOB_BY_FAMILY[family]) || null;
  const migration = owned?.migration || assignment.migration || null;
  const ownedPath =
    owned?.ownedPath ||
    (Array.isArray(owned?.ownedPaths) ? owned.ownedPaths[0] : null) ||
    `experiments/wave6/h6d-real-consumers/consumers/${id}/`;
  if (owned && !owned.ownedPath) owned.ownedPath = ownedPath;
  return {
    id,
    dir,
    family,
    jobId,
    repo: assignment.repo || acquisition?.repo || null,
    path: assignment.path || acquisition?.path || null,
    assignment,
    owned,
    result,
    acquisition,
    ready: Boolean(result && owned && existsSync(join(dir, "adapter.mjs"))),
    testsPass: result?.testsPass === true,
    migration,
    purchaseAuthority: false,
    schedulerDaemon: false,
  };
}

export function loadCatalog() {
  const assignment = loadAssignment();
  const ids = listConsumerIds();
  const consumers = ids.map((id) => {
    try {
      return loadConsumerRecord(id);
    } catch (err) {
      return { id, error: err.code || err.message, ready: false };
    }
  });
  const byFamily = Object.fromEntries(FAMILIES.map((f) => [f, consumers.filter((c) => c.family === f)]));
  return {
    schema: "h6d.real-consumers.catalog.v1",
    assignment: assignment.assignment,
    usefulJobs: assignment.usefulJobs,
    baselinePin: assignment.baselinePin,
    parentSessionId: assignment.parentSessionId,
    purchaseAuthority: false,
    consumers,
    byFamily,
    counts: {
      listed: consumers.length,
      ready: consumers.filter((c) => c.ready).length,
      testsPass: consumers.filter((c) => c.testsPass).length,
    },
    migrations: MIGRATIONS,
  };
}

export function selectJob(id) {
  if (!id) {
    const err = new Error("missing job id");
    err.code = "missing-job-id";
    throw err;
  }
  return loadConsumerRecord(id);
}
