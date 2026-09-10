#!/usr/bin/env node
/**
 * NL-DISTRIBUTION-06 CLI — Record04 → DIST-08 conversion diagnosis join
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs join <feed.json>
 *   node src/cli.mjs bundle <feed.json>
 *   node src/cli.mjs validate <join-result.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBundleFromFeed,
  joinRecordToDiagnosis,
} from "./join.mjs";
import { validateJoinResult } from "./validate.mjs";
import { PINS } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs join <feed-or-input.json>
  node src/cli.mjs bundle <feed.json>
  node src/cli.mjs validate <join-result.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const clock = () => Date.parse("2026-09-10T20:15:00.000Z");

try {
  if (cmd === "bundle") {
    if (!a) usage();
    const { bundle, gaps, joinable } = buildBundleFromFeed(loadJson(a));
    console.log(
      JSON.stringify(
        { bundle, gaps, joinableCount: joinable.length, pins: PINS },
        null,
        2,
      ),
    );
  } else if (cmd === "join") {
    if (!a) usage();
    const result = await joinRecordToDiagnosis(loadJson(a), { clock });
    console.log(JSON.stringify(result, null, 2));
    process.exit(
      result.status === "unavailable" || result.status === "partial" ? 1 : 0,
    );
  } else if (cmd === "validate") {
    if (!a) usage();
    const result = validateJoinResult(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          schema: result.schema,
          status: result.status,
          joinableCount: result.joinableCount,
          gapsCount: result.gaps?.length ?? 0,
          diagnosisStatus: result.diagnosis?.status ?? null,
          joinedCount: result.diagnosis?.joined?.length ?? 0,
          claims: result.claims,
          pins: result.pins,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const positive = await joinRecordToDiagnosis(
      loadJson(join(root, "fixtures/dist-repair-feed.positive.json")),
      { clock },
    );
    const partial = await joinRecordToDiagnosis(
      loadJson(join(root, "fixtures/dist-repair-feed.partial.json")),
      { clock },
    );
    const unavailable = await joinRecordToDiagnosis(
      loadJson(join(root, "fixtures/join-input.unavailable.json")),
      { clock },
    );

    let inventedRejected = null;
    try {
      await joinRecordToDiagnosis(
        loadJson(join(root, "fixtures/dist-repair-feed.invented-revenue.json")),
        { clock },
      );
      inventedRejected = { rejected: false };
    } catch (err) {
      inventedRejected = {
        rejected: true,
        code: err.code,
        message: err.message,
      };
    }

    const outDir = join(root, "artifacts");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "join-result.positive.json");
    writeFileSync(outPath, JSON.stringify(positive, null, 2) + "\n");

    const sampleJoin = positive.diagnosis?.joined?.[0] || null;
    console.log(
      JSON.stringify(
        {
          positive: {
            status: positive.status,
            joinableCount: positive.joinableCount,
            diagnosisStatus: positive.diagnosis?.status,
            joinedCount: positive.diagnosis?.joined?.length,
            gapsCount: positive.gaps?.length,
            sampleJoin: sampleJoin
              ? {
                  acquisitionId: sampleJoin.acquisitionId,
                  usefulOutputId: sampleJoin.usefulOutputId,
                  compatibilityKeys: sampleJoin.compatibilityKeys,
                  causationKnown: sampleJoin.causationKnown,
                  customerIndependenceKnown:
                    sampleJoin.customerIndependenceKnown,
                  unknownsHead: (sampleJoin.unknowns || []).slice(0, 3),
                  claims: sampleJoin.claims,
                }
              : null,
            beforeAfterRoute: positive.beforeAfter?.routeKey ?? null,
            claims: positive.claims,
          },
          partial: {
            status: partial.status,
            diagnosisStatus: partial.diagnosis?.status,
            gapsCodes: (partial.gaps || []).map((g) => g.code),
            currentCaptureIncomplete:
              partial.diagnosis?.nl06?.currentCaptureIncomplete === true,
          },
          unavailable: {
            status: unavailable.status,
            diagnosisStatus: unavailable.diagnosis?.status,
            hasActivationCount: Object.prototype.hasOwnProperty.call(
              unavailable.diagnosis || {},
              "activationCount",
            ),
            gapsCodes: (unavailable.gaps || []).map((g) => g.code),
          },
          inventedRevenue: inventedRejected,
          unavailableNeNoUsers:
            unavailable.diagnosis?.status === "unavailable" &&
            !Object.prototype.hasOwnProperty.call(
              unavailable.diagnosis || {},
              "activationCount",
            ),
          pins: PINS,
          wrote: outPath,
          sequencing: {
            s172TipDone: PINS.s172Tip,
            record04ExportPin: PINS.record04Export,
            dist08Pin: PINS.dist08,
            overlapWithS172: false,
          },
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
