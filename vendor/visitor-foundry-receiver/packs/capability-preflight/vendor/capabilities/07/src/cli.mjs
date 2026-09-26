#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-CAPABILITIES-07 (buyer-controlled context pack).
 *
 *   node src/cli.mjs pack <input.json>
 *   node src/cli.mjs pack -   # read JSON from stdin
 *   node src/cli.mjs validate <input.json>
 *   node src/cli.mjs demo
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACK_STATUS, SCHEMA } from "./constants.mjs";
import { buildBuyerContextPack } from "./pack.mjs";
import { validateBuyerContextPackInput } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  if (path === "-" || path === "/dev/stdin") {
    return JSON.parse(readFileSync(0, "utf8"));
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs pack <input.json|->
  node src/cli.mjs validate <input.json|->
  node src/cli.mjs demo`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "pack") {
    if (!a) usage();
    const result = buildBuyerContextPack(loadJson(a));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === PACK_STATUS.REJECTED) process.exit(1);
  } else if (cmd === "validate") {
    if (!a) usage();
    const normalized = validateBuyerContextPackInput(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          taskId: normalized.taskId,
          descriptorCount: normalized.descriptors.length,
          endpointScope: normalized.endpointScope,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const fixtures = [
      "positive.json",
      "partial-missing-secret.json",
      "negative-forbidden.json",
    ];
    const results = {};
    for (const name of fixtures) {
      const raw = loadJson(join(root, "fixtures", name));
      const out = buildBuyerContextPack(raw, {
        clock: () => Date.parse("2026-09-10T19:00:00.000Z"),
      });
      results[name] = {
        status: out.status,
        includedInputIds: (out.includedInputs || []).map((i) => i.id),
        excludedExtras: (out.excludedExtras || []).map((e) => e.id),
        missingInputs: (out.missingInputs || []).map((m) => m.id),
        dryRunReadback: out.dryRunReadback
          ? {
              method: out.dryRunReadback.method,
              url: out.dryRunReadback.url,
              headerNames: Object.keys(out.dryRunReadback.headers || {}),
              bodyKeys: Object.keys(out.dryRunReadback.bodyPreview || {}),
            }
          : null,
        error: out.error ?? null,
        dryRun: out.dryRun === true,
        paidCalls: out.paidCalls,
        hasBuyerCount: Object.prototype.hasOwnProperty.call(out, "buyerCount"),
        hasRevenue: Object.prototype.hasOwnProperty.call(out, "revenue"),
      };
    }
    console.log(
      JSON.stringify(
        {
          schema: SCHEMA,
          demo: true,
          note: "Synthetic fixtures only; dry-run readback; no live paid calls.",
          reuseFrom: ["R2-CAPABILITIES-01"],
          results,
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
