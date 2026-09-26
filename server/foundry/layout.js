import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const F93_LAYOUT = [
  "scripts/visitor-foundry/integration/src/extension.mjs",
  "scripts/visitor-foundry/integration/src/store.mjs",
  "scripts/visitor-foundry/integration/src/router.mjs",
  "scripts/visitor-foundry/integration/src/supervisor.mjs",
  "scripts/visitor-foundry/integration/src/recover.mjs",
  "scripts/visitor-foundry/integration/worker.mjs",
  "scripts/visitor-foundry/integration/migrate.mjs",
  "services/correspondence/src/visitor-foundry/host.ts",
  "services/correspondence/migrations/visitor-foundry/001_vf04_integration.sql",
  "services/correspondence/migrations/visitor-foundry/002_vf04_wire.sql",
  "services/correspondence/migrations/visitor-work-cells/001_vf02_work_cells.sql",
  "services/correspondence/dist/visitor-foundry/boundary.js",
  "services/correspondence/dist/visitor-work-cells/index.js",
];

export const VF08_LAYOUT = [
  "scripts/visitor-foundry/execution/CONTRACT.md",
  "scripts/visitor-foundry/execution/src/contracts.mjs",
  "scripts/visitor-foundry/execution/src/supervisor.mjs",
  "scripts/visitor-foundry/execution/src/ports.mjs",
];

export function resolveLayout(root, files) {
  if (!root) return { ok: false, missing: ["root"] };
  const missing = files.filter((rel) => !existsSync(path.join(root, rel)));
  return { ok: missing.length === 0, missing };
}

export async function loadFoundryExtension(root, config) {
  const layout = resolveLayout(root, F93_LAYOUT);
  if (!layout.ok) return { ok: false, reason: "layout_unavailable", missing: layout.missing };
  try {
    const href = pathToFileURL(path.join(root, "scripts/visitor-foundry/integration/src/extension.mjs")).href;
    const mod = await import(href);
    if (typeof mod.createFoundryExtension !== "function") {
      return { ok: false, reason: "layout_unavailable", missing: ["createFoundryExtension"] };
    }
    return {
      ok: true,
      create: () => mod.createFoundryExtension({
        enabled: true,
        databaseUrl: config.databaseUrl,
        schema: config.pgSchema,
        poolMax: 2,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      reason: "layout_unavailable",
      missing: [error instanceof Error ? error.name : "import_failed"],
    };
  }
}
