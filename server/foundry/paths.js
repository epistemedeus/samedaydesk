import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RECEIVER_ROOT = fileURLToPath(new URL("../../vendor/visitor-foundry-receiver/", import.meta.url));

export const RECEIVER_PIN = new URL("../../vendor/visitor-foundry-receiver/SOURCE-PIN.json", import.meta.url);

export const CORRESPONDENCE_PACKAGE = path.join(RECEIVER_ROOT, "services/correspondence");

export const ENTRY_MOUNT_URL = pathToFileURL(
  path.join(RECEIVER_ROOT, "scripts/visitor-foundry/integration/entry/mount.mjs"),
).href;

export const CANONICAL_WORKER = path.join(
  RECEIVER_ROOT,
  "scripts/visitor-foundry/integration/worker.mjs",
);

export const PORTABLE_PROFILE_URL = pathToFileURL(
  path.join(RECEIVER_ROOT, "scripts/visitor-foundry/integration/src/portable-profile.mjs"),
).href;

export const HOST_PREPARE_URL = pathToFileURL(
  path.join(CORRESPONDENCE_PACKAGE, "dist/visitor-foundry/host.js"),
).href;

export const LAYOUT_FILES = [
  "scripts/visitor-foundry/integration/entry/mount.mjs",
  "scripts/visitor-foundry/integration/entry/receiver.mjs",
  "scripts/visitor-foundry/integration/entry/visitor.mjs",
  "scripts/visitor-foundry/integration/src/extension.mjs",
  "scripts/visitor-foundry/integration/worker.mjs",
  "scripts/visitor-foundry/entry/src/mount.mjs",
  "scripts/visitor-foundry/entry/migrations/001_entry.sql",
  "scripts/visitor-foundry/entry/migrations/002_versioned_profile.sql",
  "scripts/visitor-foundry/execution/src/supervisor.mjs",
  "services/correspondence/dist/index.js",
  "services/correspondence/dist/visitor-foundry/host.js",
  "services/correspondence/dist/visitor-foundry/boundary.js",
  "services/correspondence/dist/visitor-work-cells/index.js",
  "services/correspondence/migrations/001_init.sql",
  "services/correspondence/migrations/visitor-foundry/001_vf04_integration.sql",
  "services/correspondence/migrations/visitor-foundry/002_vf04_wire.sql",
  "services/correspondence/migrations/visitor-foundry/003_vf04_revalidation.sql",
  "services/correspondence/migrations/visitor-foundry/004_vf09_portable.sql",
  "services/correspondence/migrations/visitor-foundry/005_vf12_entry.sql",
  "services/correspondence/migrations/visitor-work-cells/001_vf02_work_cells.sql",
  "packs/exchange-townsquare/exchange/01/src/run-checks.mjs",
  "SOURCE-PIN.json",
];

// One web process: base pool plus entry, work-cell, and integration pools.
// A worker adds its own integration pool. These are not the cohort's admission caps.
export const POOL_MULTIPLIERS = Object.freeze({
  entry: 2,
  workCells: 2,
  integration: 2,
  worker: 2,
});

export function connectionBudget({ httpProcesses = 1, workers = 0, basePoolMax = 4 } = {}) {
  const perHttp = basePoolMax + POOL_MULTIPLIERS.entry + POOL_MULTIPLIERS.workCells + POOL_MULTIPLIERS.integration;
  return perHttp * httpProcesses + POOL_MULTIPLIERS.worker * workers;
}
