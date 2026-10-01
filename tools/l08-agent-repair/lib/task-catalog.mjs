// Machine catalog for the task-specific check. No human page and no score.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NEO230, PIN_SOURCES, S14_PIN, STALE_NEO } from "./pins.mjs";
import { ALLOWED_FIXTURES } from "./public-adapter.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export const CATALOG_REL = "client/public/discovery/task-readiness.json";

export function catalogDocument() {
  return {
    schema: "samedaydesk.acquisition-discovery.v1",
    packageId: "task-readiness",
    title: "Free task-specific readiness check",
    summary: "One supplied success contract, one HTTP method, and one path. A concrete finding can authorize a repair packet the in-repo public adapter consumes. A failed probe is not demand.",
    page: null,
    invokesPricedExecution: false,
    runsOffline: true,
    offlineAfterPublicInstall: true,
    productionAcquisition: false,
    privateGitRequired: false,
    paid: false,
    humanPageAdded: false,
    coldStart: [
      "npm ci --ignore-scripts --prefix vendor/agent-payment-integrity",
      "node tools/l08-agent-repair/cold-client.mjs task-readiness",
    ],
    pins: {
      neo230: {
        commit: NEO230,
        repository: PIN_SOURCES.neo.repo,
        acquired: false,
        reason: "private",
      },
      s14: {
        commit: S14_PIN,
        repository: PIN_SOURCES.s14.repo,
        license: "MIT",
        acquired: "vendored",
        path: PIN_SOURCES.s14.path,
      },
      staleNeoRefused: STALE_NEO,
      fixtures: ALLOWED_FIXTURES,
      install: "npm ci --ignore-scripts --prefix vendor/agent-payment-integrity",
    },
    canonical: {
      method: "POST",
      path: "/mcp",
      header: "MCP-Protocol-Version",
      version: "2025-11-25",
      unsupportedValue: "1999-01-01",
      requiredStatus: 400,
      missingHeader: "accepted",
      repaired: true,
      repairScope: "compiled-process",
      note: "A follow-up POST with an unsupported MCP-Protocol-Version returns HTTP 400 and no result on this process. A missing header stays HTTP 200. Initialize negotiates the body version. This is the compiled repair, not a public-host readback.",
    },
    publicDeployment: {
      activated: false,
      readback: null,
    },
    materialLimit: "Absence of demand is only a caller-supplied empty ledger. The canonical protocol version this server speaks is 2025-11-25.",
  };
}

export function catalogPath(root) {
  return join(root, CATALOG_REL);
}

export function catalogText() {
  return `${JSON.stringify(catalogDocument(), null, 2)}\n`;
}

export function writeCatalog(root) {
  const path = catalogPath(root);
  writeFileSync(path, catalogText());
  return path;
}

export const catalogModulePath = here;
