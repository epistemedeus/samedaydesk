#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-DISTRIBUTION-03.
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs build <inventory.json>
 *   node src/cli.mjs validate <catalog.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortableCatalog, CATALOG_STATUS } from "./catalog.mjs";
import { validateCatalog } from "./validate.mjs";
import { AVAILABILITY_STATUS } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs build <inventory.json>
  node src/cli.mjs validate <catalog.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "build") {
    if (!a) usage();
    const catalog = buildPortableCatalog(loadJson(a), {
      clock: () => Date.parse("2026-09-10T18:45:00.000Z"),
    });
    console.log(JSON.stringify(catalog, null, 2));
    const bad = [CATALOG_STATUS.PARTIAL, CATALOG_STATUS.UNAVAILABLE].includes(catalog.status);
    process.exit(bad ? 1 : 0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const catalog = validateCatalog(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: catalog.status,
          packageCount: catalog.packages?.length ?? 0,
          statuses: (catalog.packages || []).map((p) => ({
            id: p.id,
            availability: p.availability?.status,
          })),
          schema: catalog.schema,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const clock = () => Date.parse("2026-09-10T18:45:00.000Z");
    const positive = buildPortableCatalog(
      loadJson(join(root, "fixtures/inventory.positive.json")),
      { clock },
    );
    const partial = buildPortableCatalog(
      loadJson(join(root, "fixtures/inventory.partial.json")),
      { clock },
    );
    const unavailable = buildPortableCatalog(
      loadJson(join(root, "fixtures/inventory.unavailable.json")),
      { clock },
    );
    const noUsers = buildPortableCatalog(
      loadJson(join(root, "fixtures/inventory.no-users.json")),
      { clock },
    );
    const outPath = "/tmp/r2-dist-03-catalog.json";
    writeFileSync(outPath, JSON.stringify(positive, null, 2));
    const grexal = positive.packages.find((p) => p.id.includes("grexal"));
    const agensi = positive.packages.find((p) => p.id.includes("agensi"));
    console.log(
      JSON.stringify(
        {
          positive: {
            status: positive.status,
            packageIds: positive.packages.map((p) => p.id),
            grexalAvailability: grexal?.availability?.status,
            agensiAvailability: agensi?.availability?.status,
            grexalObservedCmds: grexal?.installCommands?.filter((c) => c.observed).map((c) => c.command),
            grexalRecommendedNotRun: grexal?.installCommands
              ?.filter((c) => !c.observed)
              .map((c) => c.command),
          },
          partial: {
            status: partial.status,
            missingInputs: partial.missingInputs,
          },
          unavailable: {
            status: unavailable.status,
            availability: unavailable.packages[0]?.availability?.status,
            hasUsersField: Object.prototype.hasOwnProperty.call(
              unavailable.packages[0]?.availability || {},
              "users",
            ),
          },
          noUsers: {
            status: noUsers.status,
            availability: noUsers.packages[0]?.availability?.status,
            users: noUsers.packages[0]?.availability?.users,
          },
          distinct:
            unavailable.packages[0]?.availability?.status === AVAILABILITY_STATUS.UNAVAILABLE &&
            noUsers.packages[0]?.availability?.status === AVAILABILITY_STATUS.NO_USERS &&
            unavailable.packages[0]?.availability?.status !==
              noUsers.packages[0]?.availability?.status,
          wroteCatalog: outPath,
          mutationBoundary: positive.mutationBoundary,
        },
        null,
        2,
      ),
    );
  } else {
    usage();
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err.code || "error",
      message: err.message,
      details: err.details || null,
    }),
  );
  process.exit(1);
}
