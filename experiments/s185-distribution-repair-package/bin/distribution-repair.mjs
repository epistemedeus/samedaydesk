#!/usr/bin/env node
/**
 * S185 shared CLI — distribution-repair acquisition kit.
 * Reuses vendored Record04 / Record05 / DIST08 / NL06. No second parser.
 * Free offline diagnosis. Priced execution is not invoked.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INPUT_SCHEMA_DOC,
  PINS,
  PKG_ROOT,
  buildNextRunManifest,
  diagnoseDistributionRepair,
} from "../src/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function emit(obj, code = 0) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exit(code);
}

function help() {
  process.stdout.write(`distribution-repair — SameDayDesk S185 shared CLI

Commands:
  schema
  diagnose <input.json> [--clock ISO] [--write-next-run <out.json>]
  diagnose --from-next-run <manifest.json> [--record <pair.json>] [--clock ISO]
  sample --positive | --partial | --mismatch | --next-run | --caller-alpha | --caller-beta
  validate <result.json>

Caller supplies discovery/listing snapshots + baseline/current route pair.
Identity is provider / jobRef / sharedEvidenceId (never a filename).
Incomplete captures cannot prove global removal. Not lost-customer proof.
Free offline diagnosis; priced execution is not invoked. Not a production acquisition.
`);
}

function loadJson(file) {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    return { __parseError: true, message: err.message, path: file };
  }
}

function resolveMaybe(p) {
  if (p == null || p === true) return null;
  if (path.isAbsolute(p)) return p;
  const bases = [process.cwd(), PKG_ROOT, path.join(PKG_ROOT, "examples")];
  for (const base of bases) {
    const cand = path.resolve(base, p);
    if (fs.existsSync(cand)) return cand;
  }
  return path.resolve(process.cwd(), p);
}

function samplePath(name) {
  return path.join(PKG_ROOT, "examples", name);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (!cmd || cmd === "help" || args.help) {
  help();
  process.exit(0);
}

try {
  if (cmd === "schema") {
    emit({ pins: PINS, input: INPUT_SCHEMA_DOC });
  }

  const clock = args.clock
    ? () => Date.parse(String(args.clock))
    : undefined;

  async function runInput(input, inputPath = null) {
    if (input?.__parseError) {
      const result = await diagnoseDistributionRepair(
        { seoRank: 1 },
        { clock },
      );
      result.status = "malformed";
      result.error = { code: "invalid_json", message: input.message, path: input.path };
      return result;
    }
    const result = await diagnoseDistributionRepair(input, { clock });
    if (args["write-next-run"] && args["write-next-run"] !== true) {
      const outPath = path.resolve(String(args["write-next-run"]));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const man = buildNextRunManifest(result, inputPath);
      fs.writeFileSync(outPath, `${JSON.stringify(man, null, 2)}\n`);
      result.nextRun = { path: outPath, schema: man.schema };
    } else if (args["write-next-run"] === true) {
      result.nextRun = {
        refused: true,
        prep: { code: "invalid-next-run-path" },
      };
    }
    return result;
  }

  if (cmd === "diagnose") {
    if (args["from-next-run"]) {
      const manPath = resolveMaybe(args["from-next-run"]);
      if (!manPath || !fs.existsSync(manPath)) {
        emit(
          {
            ok: false,
            status: "malformed",
            error: { code: "missing-next-run-manifest", path: args["from-next-run"] },
            productionAcquisition: false,
          },
          0,
        );
      }
      let man;
      try {
        man = JSON.parse(fs.readFileSync(manPath, "utf8"));
      } catch {
        emit(
          {
            ok: false,
            status: "malformed",
            error: { code: "invalid-next-run-manifest", path: manPath },
            productionAcquisition: false,
          },
          0,
        );
      }
      const inputFile = args.input
        ? resolveMaybe(args.input)
        : man.inputs?.input
          ? path.resolve(path.dirname(manPath), man.inputs.input)
          : null;
      if (!inputFile || !fs.existsSync(inputFile)) {
        emit(
          {
            ok: false,
            status: "malformed",
            error: { code: "missing-next-run-input", path: inputFile },
            productionAcquisition: false,
          },
          0,
        );
      }
      const input = loadJson(inputFile);
      if (args.record && args.record !== true) {
        const recPath = resolveMaybe(args.record);
        const rec = loadJson(recPath);
        if (isPlain(input)) {
          input.record = rec.record || rec;
        }
      }
      const result = await runInput(input, inputFile);
      emit(result, 0);
    }

    const file = args._[1] ? resolveMaybe(args._[1]) : null;
    if (!file || !fs.existsSync(file)) {
      help();
      process.exit(2);
    }
    const input = loadJson(file);
    const result = await runInput(input, file);
    emit(result, 0);
  }

  if (cmd === "sample") {
    const map = {
      positive: "positive.json",
      partial: "partial.json",
      mismatch: "mismatch.json",
      "next-run": "next-run/input.json",
      "caller-alpha": "caller/alpha.json",
      "caller-beta": "caller/beta.json",
      "incomplete-catalog": "incomplete-catalog.json",
      "missing-record": "missing-record.json",
      malformed: "malformed.json",
    };
    let key = null;
    for (const k of Object.keys(map)) {
      if (args[k] === true || args.sample === k || args._[1] === k) key = k;
    }
    if (args.positive) key = "positive";
    if (args.partial) key = "partial";
    if (args.mismatch) key = "mismatch";
    if (args["next-run"]) key = "next-run";
    if (args["caller-alpha"]) key = "caller-alpha";
    if (args["caller-beta"]) key = "caller-beta";
    if (!key) {
      emit({ samples: Object.keys(map), pins: PINS, productionAcquisition: false });
    }
    const file = samplePath(map[key]);
    const input = loadJson(file);
    const result = await runInput(input, file);
    result.sample = key;
    emit(result, 0);
  }

  if (cmd === "validate") {
    const file = args._[1] ? resolveMaybe(args._[1]) : null;
    if (!file || !fs.existsSync(file)) {
      help();
      process.exit(2);
    }
    const doc = loadJson(file);
    if (doc.__parseError) {
      emit({ ok: false, status: "malformed", error: { code: "invalid_json" } });
    }
    emit({
      ok: doc.status !== "malformed",
      schema: doc.schema ?? null,
      status: doc.status ?? null,
      matching: doc.matching ?? null,
      diagnosisStatus: doc.diagnosis?.status ?? null,
      joinedCount: doc.matching?.joinedCount ?? doc.diagnosis?.joined?.length ?? 0,
      productionAcquisition: doc.productionAcquisition === true,
      claims: doc.claims ?? null,
    });
  }

  help();
  process.exit(2);
} catch (err) {
  emit(
    {
      ok: false,
      status: "malformed",
      error: { code: err.code || "error", message: err.message, details: err.details || null },
      productionAcquisition: false,
    },
    1,
  );
}

function isPlain(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
