#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-DISTRIBUTION-08.
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs diagnose <bundle.json>
 *   node src/cli.mjs validate <diagnosis.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIAGNOSIS_STATUS } from "./constants.mjs";
import { diagnoseConversion, assertCaptureDistinct } from "./diagnose.mjs";
import { validateDiagnosis } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs diagnose <bundle.json>
  node src/cli.mjs validate <diagnosis.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const clock = () => Date.parse("2026-09-10T20:00:00.000Z");

try {
  if (cmd === "diagnose") {
    if (!a) usage();
    const diagnosis = diagnoseConversion(loadJson(a), { clock });
    console.log(JSON.stringify(diagnosis, null, 2));
    const bad = [
      DIAGNOSIS_STATUS.PARTIAL,
      DIAGNOSIS_STATUS.UNAVAILABLE,
    ].includes(diagnosis.status);
    process.exit(bad ? 1 : 0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const diagnosis = validateDiagnosis(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: diagnosis.status,
          joinedCount: diagnosis.joined?.length ?? 0,
          unjoinedCount: diagnosis.unjoined?.length ?? 0,
          causationKnownCount:
            diagnosis.joined?.filter((j) => j.causationKnown).length ?? 0,
          independenceKnownCount:
            diagnosis.joined?.filter((j) => j.customerIndependenceKnown)
              .length ?? 0,
          hasActivationCount: Object.prototype.hasOwnProperty.call(
            diagnosis,
            "activationCount",
          ),
          activationCount: Object.prototype.hasOwnProperty.call(
            diagnosis,
            "activationCount",
          )
            ? diagnosis.activationCount
            : null,
          customerRevenueClaimed:
            diagnosis.grexalS149?.customerExecutionRevenuePayout === true,
          schema: diagnosis.schema,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const available = diagnoseConversion(
      loadJson(join(root, "fixtures/bundle.positive.json")),
      { clock },
    );
    const incompatible = diagnoseConversion(
      loadJson(join(root, "fixtures/bundle.neg-incompatible.json")),
      { clock },
    );
    const partial = diagnoseConversion(
      loadJson(join(root, "fixtures/bundle.partial.json")),
      { clock },
    );
    const unavailable = diagnoseConversion(
      loadJson(join(root, "fixtures/bundle.unavailable.json")),
      { clock },
    );
    const noUsers = diagnoseConversion(
      loadJson(join(root, "fixtures/bundle.no-users.json")),
      { clock },
    );
    assertCaptureDistinct(unavailable, noUsers);
    const outPath = "/tmp/r2-dist-08-diagnosis.json";
    writeFileSync(outPath, JSON.stringify(available, null, 2));
    const sampleJoin = available.joined?.[0] || null;
    console.log(
      JSON.stringify(
        {
          available: {
            status: available.status,
            joinedCount: available.joined?.length,
            unjoinedCount: available.unjoined?.length,
            activationCount: available.activationCount,
            sampleJoin: sampleJoin
              ? {
                  acquisitionId: sampleJoin.acquisitionId,
                  usefulOutputId: sampleJoin.usefulOutputId,
                  compatibilityKeys: sampleJoin.compatibilityKeys,
                  causationKnown: sampleJoin.causationKnown,
                  customerIndependenceKnown:
                    sampleJoin.customerIndependenceKnown,
                  unknowns: sampleJoin.unknowns,
                  claims: sampleJoin.claims,
                }
              : null,
            grexalPricingRunCompletedUsd:
              available.grexalS149?.pricingRunCompletedUsd,
            customerRevenueClaimed:
              available.grexalS149?.customerExecutionRevenuePayout === true,
          },
          incompatible: {
            status: incompatible.status,
            joinedCount: incompatible.joined?.length,
            unjoinedCount: incompatible.unjoined?.length,
            sampleUnjoinedReason: incompatible.unjoined?.[0]?.reason ?? null,
          },
          partial: {
            status: partial.status,
            missingInputs: partial.missingInputs,
          },
          unavailable: {
            status: unavailable.status,
            hasActivationCount: Object.prototype.hasOwnProperty.call(
              unavailable,
              "activationCount",
            ),
          },
          noUsers: {
            status: noUsers.status,
            activationCount: noUsers.activationCount,
            usefulOutputActionableCount: noUsers.usefulOutputActionableCount,
          },
          distinct:
            unavailable.status === DIAGNOSIS_STATUS.UNAVAILABLE &&
            noUsers.status === DIAGNOSIS_STATUS.NO_USERS &&
            unavailable.status !== noUsers.status,
          clickIsNotConversion:
            sampleJoin?.claims?.conversionFromClick === false,
          listPriceIsNotRevenue:
            available.grexalS149?.customerExecutionRevenuePayout === false,
          wroteDiagnosis: outPath,
          mutationBoundary: available.mutationBoundary,
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
