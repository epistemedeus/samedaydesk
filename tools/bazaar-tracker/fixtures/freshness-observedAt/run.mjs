#!/usr/bin/env node
/**
 * Cold-run freshness adapter. Readback-only. Refuses tracker --live / CDP refresh.
 */
import { parseArgs } from "node:util";
import { DEFAULT_DATA_DIR } from "../../lib.mjs";
import {
  DEFAULT_CLOCK,
  DEFAULT_MAX_AGE_MS,
  REFUSED_FLAGS,
  evaluateCase,
  evaluatePack,
  isSeededCase,
  loadCommittedObservation,
  loadJson,
  proveLastCalledAtIsNotRemovalClock,
  resolveCaseObservation,
  runFreshnessPack,
  spawnReadback,
} from "./adapter.mjs";

const refused = process.argv.slice(2).filter((arg) => REFUSED_FLAGS.includes(arg));
if (refused.length) {
  process.stderr.write(
    `refused: ${refused.join(" ")} is an owner CDP refresh / tracker --live path. Freshness is readback-only from observedAt.\n`,
  );
  process.exit(2);
}

const { values } = parseArgs({
  options: {
    help: { type: "boolean", default: false },
    pretty: { type: "boolean", default: false },
    case: { type: "string" },
    seeded: { type: "string" },
    clock: { type: "string" },
    "max-age-ms": { type: "string" },
    "data-dir": { type: "string" },
    "prove-volatile": { type: "boolean", default: false },
    "skip-volatile": { type: "boolean", default: false },
    readback: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  process.stdout.write(`Bazaar observation freshness from observedAt only (no --live).

Usage:
  node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs
  node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs --pretty
  node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs --case cases/seeded-lastCalledAt-as-removal.json
  node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs --seeded cases/seeded-lastCalledAt-as-removal.json
  node tools/bazaar-tracker/fixtures/freshness-observedAt/run.mjs --readback

Default cold run: tracker --readback on committed observations, age vs
2026-09-17 from observedAt 2026-09-03T09:54:04.798Z (stale), plus a
lastCalledAt-only tracker --from replay that must not drop routes.

--case <file>       evaluate one case (seeded files exit 1)
--seeded <file>     require that case to be rejected (exit 0 if rejected)
--readback          print tracker --readback only (no network)
--clock <iso>       comparison clock (default 2026-09-17T11:45:00.000Z)
--max-age-ms <n>    stale when ageMs > n (default 86400000)
--data-dir <dir>    default data/bazaar-tracker
--pretty            indent JSON
--skip-volatile     skip the lastCalledAt-only tracker replay
--prove-volatile    force the lastCalledAt-only tracker replay

Refused: --live --cdp --poll --refresh
`);
  process.exit(0);
}

if (values.case && values.seeded) {
  process.stderr.write("Use exactly one of --case or --seeded.\n");
  process.exit(2);
}

const dataDir = values["data-dir"] || DEFAULT_DATA_DIR;
const clock = values.clock || DEFAULT_CLOCK;
const maxAgeMs = values["max-age-ms"] ? Number(values["max-age-ms"]) : DEFAULT_MAX_AGE_MS;
if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
  process.stderr.write("--max-age-ms must be a non-negative number.\n");
  process.exit(2);
}

const indent = values.pretty ? 2 : 0;

if (values.readback) {
  const readback = spawnReadback(dataDir);
  process.stdout.write(`${JSON.stringify(readback.report ?? { ok: false, error: readback.stderr }, null, indent)}\n`);
  process.exit(readback.status === 0 && readback.report?.ok ? 0 : 1);
}

if (values.case || values.seeded) {
  const path = values.case || values.seeded;
  const doc = loadJson(path);
  if (values.seeded) doc.seeded = true;
  const observation = resolveCaseObservation(doc, loadCommittedObservation(dataDir), path);
  const report = evaluateCase(doc, observation, { clock: doc.clock || clock, maxAgeMs: doc.maxAgeMs ?? maxAgeMs });
  report.path = path;
  report.seeded = isSeededCase(doc, path) || Boolean(values.seeded);

  if (values["prove-volatile"] && !values["skip-volatile"]) {
    report.volatileProof = proveLastCalledAtIsNotRemovalClock();
  }

  if (values.seeded) {
    const pack = evaluatePack({
      observation,
      cases: [{ path, doc }],
      clock: doc.clock || clock,
      maxAgeMs: doc.maxAgeMs ?? maxAgeMs,
    });
    const out = {
      schemaVersion: pack.schemaVersion,
      ok: pack.ok && pack.seededRejected === true,
      seededRejected: pack.seededRejected,
      live: false,
      reasons: pack.reports[0]?.reasons ?? [],
      report: pack.reports[0],
    };
    process.stdout.write(`${JSON.stringify(out, null, indent)}\n`);
    process.exit(out.ok ? 0 : 1);
  }

  process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
  process.exit(report.ok ? 0 : 1);
}

const proveVolatile = values["skip-volatile"] ? false : true;
const out = runFreshnessPack({
  dataDir,
  clock,
  maxAgeMs,
  proveVolatile,
});
process.stdout.write(`${JSON.stringify(out, null, indent)}\n`);
process.exit(out.ok ? 0 : 1);
