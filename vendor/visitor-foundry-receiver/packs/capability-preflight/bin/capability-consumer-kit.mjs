#!/usr/bin/env node
/**
 * S180 portable capability-consumer kit CLI.
 *
 *   status | cold-start [--probe] [--out-dir dir] | journey [--input file] [--probe] |
 *   pack [--out archive] | help
 *
 * No silent model/paid/network calls. Local probes only with --probe.
 * Per-command flags are rejected when unsupported (no silent ignore).
 * Flag values are required; missing operands do not fall through to demo input.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EXAMPLES_TIP,
  FIRST_RUN_TIP,
  HEAVY_PIN,
  HONESTY_NOTES,
  IMPORT_PATHS,
  JOURNEY_TIP,
  KIT_BRANCH,
  MUTATION_BOUNDARY,
  SCHEMA,
} from "../src/constants.mjs";
import { runCapabilityConsumerJourney, runColdStart, KIT_ROOT } from "../src/journey.mjs";
import { findAbsolutePaths } from "../src/portable.mjs";

const COMMAND_ALLOWED = Object.freeze({
  status: [],
  help: [],
  "cold-start": ["probe", "outDir"],
  journey: ["probe", "input", "out"],
  pack: ["out"],
});

const FLAG_TO_CLI = Object.freeze({
  probe: "--probe",
  outDir: "--out-dir",
  out: "--out",
  input: "--input",
});

function usage(code = 2) {
  console.error(`Usage:
  node bin/capability-consumer-kit.mjs status
  node bin/capability-consumer-kit.mjs cold-start [--probe] [--out-dir <dir>]
  node bin/capability-consumer-kit.mjs journey [--input <file.json>] [--probe] [--out <file.json>]
  node bin/capability-consumer-kit.mjs pack [--out <archive.tgz>]
  node bin/capability-consumer-kit.mjs help`);
  process.exit(code);
}

function takeValue(argv, i, flag) {
  const v = argv[i + 1];
  if (v == null || v.startsWith("-")) {
    return { missing: true, flag, nextIndex: i };
  }
  return { value: v, nextIndex: i + 1 };
}

function parseArgs(argv) {
  const args = { _: [], present: [], missingValues: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--probe") {
      args.probe = true;
      args.present.push("probe");
    } else if (a === "--out-dir" || a === "--out" || a === "--input") {
      const key = a === "--out-dir" ? "outDir" : a === "--out" ? "out" : "input";
      const got = takeValue(argv, i, a);
      args.present.push(key);
      if (got.missing) {
        args.missingValues.push(a);
      } else {
        args[key] = got.value;
        i = got.nextIndex;
      }
    } else if (a.startsWith("-")) {
      console.error(JSON.stringify({ error: "unknown_flag", flag: a }));
      usage();
    } else args._.push(a);
  }
  return args;
}

function normalizeRelDir(d) {
  return String(d || "portable-out").replace(/^\.\//, "").replace(/\/$/, "") || "portable-out";
}

function isUnder(file, dir) {
  const rel = relative(dir, file);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}

function displayRel(p, fallback) {
  const abs = resolve(p);
  const fromCwd = relative(process.cwd(), abs);
  if (fromCwd && !fromCwd.startsWith("..") && !isAbsolute(fromCwd)) return fromCwd;
  const fromKit = relative(KIT_ROOT, abs);
  if (fromKit && !fromKit.startsWith("..") && !isAbsolute(fromKit)) return fromKit;
  if (fallback) return fallback;
  return abs.split("/").filter(Boolean).slice(-2).join("/");
}

function copyExternalInput(srcAbs) {
  const bytes = readFileSync(srcAbs);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const destDir = join(KIT_ROOT, "portable-out", "replay");
  mkdirSync(destDir, { recursive: true });
  const name = `${digest.slice(0, 16)}.json`;
  const dest = join(destDir, name);
  writeFileSync(dest, bytes);
  return {
    rel: `portable-out/replay/${name}`,
    sha256: digest,
    bytes: bytes.length,
  };
}

function replayLocator(originalArg) {
  const abs = resolve(originalArg);
  if (!isAbsolute(originalArg)) {
    return originalArg;
  }
  if (isUnder(abs, KIT_ROOT) || isUnder(abs, process.cwd())) {
    const fromCwd = relative(process.cwd(), abs);
    if (fromCwd && !fromCwd.startsWith("..") && !isAbsolute(fromCwd)) return fromCwd;
    return relative(KIT_ROOT, abs);
  }
  return copyExternalInput(abs).rel;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "-h" || cmd === "--help") {
  usage(0);
}

const allowed = COMMAND_ALLOWED[cmd];
if (!allowed) {
  console.error(JSON.stringify({ error: "unknown_command", command: cmd }));
  usage();
}
if (args.missingValues.length) {
  console.error(
    JSON.stringify({
      error: "missing_flag_value",
      command: cmd,
      flag: args.missingValues[0],
    }),
  );
  process.exit(2);
}
for (const flag of args.present) {
  if (!allowed.includes(flag)) {
    console.error(
      JSON.stringify({
        error: "unsupported_flag",
        command: cmd,
        flag: FLAG_TO_CLI[flag] || flag,
        allowed: allowed.map((k) => FLAG_TO_CLI[k] || k),
      }),
    );
    process.exit(2);
  }
}

if (cmd === "status") {
  const status = {
    schema: SCHEMA,
    kitBranch: KIT_BRANCH,
    heavyPin: HEAVY_PIN,
    tips: {
      firstRun: FIRST_RUN_TIP,
      examples: EXAMPLES_TIP,
      journey: JOURNEY_TIP,
    },
    importPaths: { ...IMPORT_PATHS },
    node: process.versions.node,
    mutationBoundary: MUTATION_BOUNDARY,
    honestyNotes: [...HONESTY_NOTES],
    readyForRelease: false,
    paidCalls: false,
    liveNetwork: false,
  };
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
}

if (cmd === "cold-start") {
  const outDir = resolve(args.outDir || join(KIT_ROOT, "portable-out"));
  const outputRelDir = args.outDir
    ? isAbsolute(args.outDir)
      ? displayRel(outDir, normalizeRelDir(args.outDir))
      : normalizeRelDir(args.outDir)
    : "portable-out";
  mkdirSync(outDir, { recursive: true });
  const result = runColdStart({
    probe: args.probe === true,
    outputRelDir,
    demo: true,
    mode: "demo",
  });
  const artifactPath = join(outDir, "cold-start-artifact.json");
  const nextPath = join(outDir, "next-run-input.json");
  const nextStepPath = join(outDir, "next-step-manifest.json");
  writeFileSync(artifactPath, `${JSON.stringify(result.artifact, null, 2)}\n`);
  writeFileSync(nextPath, `${JSON.stringify(result.nextRunInput, null, 2)}\n`);
  writeFileSync(nextStepPath, `${JSON.stringify(result.nextStep, null, 2)}\n`);
  const abs = [
    ...findAbsolutePaths(result.artifact),
    ...findAbsolutePaths(result.nextRunInput),
    ...findAbsolutePaths(result.nextStep),
  ];
  const receipt = {
    schema: "pilot.r2.capabilities.cold_start_receipt.v1",
    firstUseStatus: result.artifact.firstUseStatus,
    artifact: `${outputRelDir}/cold-start-artifact.json`,
    nextRunInput: `${outputRelDir}/next-run-input.json`,
    nextStep: `${outputRelDir}/next-step-manifest.json`,
    probeInvoked: result.artifact.probeInvoked === true,
    mode: "demo",
    absolutePathLeaks: abs.length,
    readyForRelease: false,
  };
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(abs.length ? 1 : 0);
}

if (cmd === "journey") {
  let input = {};
  let demo = false;
  let inputRel = null;
  if (args.present.includes("input")) {
    if (!args.input) {
      console.error(JSON.stringify({ error: "missing_flag_value", command: "journey", flag: "--input" }));
      process.exit(2);
    }
    const p = resolve(args.input);
    if (!existsSync(p)) {
      console.error(JSON.stringify({ error: "input_not_found", path: args.input }));
      process.exit(1);
    }
    input = JSON.parse(readFileSync(p, "utf8"));
    inputRel = replayLocator(args.input);
  } else {
    const demoPath = join(KIT_ROOT, "fixtures/journey-input.json");
    if (!existsSync(demoPath)) {
      console.error(JSON.stringify({ error: "missing_demo_input", path: "fixtures/journey-input.json" }));
      process.exit(1);
    }
    input = JSON.parse(readFileSync(demoPath, "utf8"));
    input.demo = true;
    demo = true;
    inputRel = "fixtures/journey-input.json";
    if (args.probe === true) input.probe = true;
  }

  const outPath = resolve(args.out || join(KIT_ROOT, "portable-out/last-journey.json"));
  const report = await runCapabilityConsumerJourney(input, {
    probe: args.probe === true,
    demo,
    artifactRelPath: displayRel(outPath, "portable-out/last-journey.json"),
    nextRunInputRelPath: inputRel,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  const leaks = findAbsolutePaths(report);
  console.log(
    JSON.stringify(
      {
        status: report.status,
        out: displayRel(outPath, "portable-out/last-journey.json"),
        input: inputRel,
        gaps: report.gaps?.length ?? 0,
        fallback: report.stages?.fallback?.status ?? null,
        absolutePathLeaks: leaks.length,
        readyForRelease: false,
      },
      null,
      2,
    ),
  );
  process.exit(leaks.length ? 1 : 0);
}

if (cmd === "pack") {
  const packUrl = pathToFileURL(join(KIT_ROOT, "scripts/pack-portable.mjs")).href;
  const { packPortableArchive } = await import(packUrl);
  const result = await packPortableArchive({
    out: args.out || join(KIT_ROOT, "portable-out/s180-capability-consumer-kit.tgz"),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok && result.parity?.ok !== false ? 0 : 1);
}

usage();
