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

/** Explicit CLI paths resolve against CWD only — never PKG examples. */
function resolveCliPath(p) {
  if (p == null || p === true) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

/** Manifest-sourced relative paths resolve against the manifest directory only. */
function resolveManifestPath(p, manDir) {
  if (p == null || p === true) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(manDir, p);
}

function samplePath(name) {
  return path.join(PKG_ROOT, "examples", name);
}

function refuse(code, message, evidence = {}) {
  return {
    ok: false,
    refused: true,
    code,
    message,
    evidence,
    paidValueClaim: false,
  };
}

function fileIdentity(p) {
  try {
    const resolved = path.resolve(p);
    const lst = fs.lstatSync(resolved);
    const st = lst.isSymbolicLink() ? fs.statSync(resolved) : lst;
    return {
      exists: true,
      resolved,
      real: lst.isSymbolicLink() ? fs.realpathSync(resolved) : resolved,
      dev: st.dev,
      ino: st.ino,
    };
  } catch {
    return { exists: false, resolved: path.resolve(p), real: path.resolve(p), dev: null, ino: null };
  }
}

function aliases(a, b) {
  if (!a || !b) return false;
  const A = fileIdentity(a);
  const B = fileIdentity(b);
  if (A.real === B.real) return true;
  if (A.exists && B.exists && A.dev != null && A.dev === B.dev && A.ino === B.ino) return true;
  return false;
}

function writeNext(file, manifest, protectedPaths = []) {
  if (typeof file !== "string" || !file.trim()) {
    return refuse("invalid-next-run-path", "--write-next-run requires a file path");
  }
  const out = resolveCliPath(file);
  try {
    if (fs.existsSync(out) && fs.statSync(out).isDirectory()) {
      return refuse("next-run-path-is-directory", "--write-next-run must be a file, not a directory", {
        path: out,
      });
    }
  } catch {
    /* continue */
  }
  for (const p of protectedPaths.filter(Boolean)) {
    if (aliases(out, p)) {
      return refuse(
        "next-run-would-overwrite-input",
        "--write-next-run must not alias the diagnosed input, --record override, or imported manifest",
        { path: out, protected: path.resolve(p) },
      );
    }
  }
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const fd = fs.openSync(out, "wx");
    try {
      fs.writeFileSync(fd, `${JSON.stringify(manifest, null, 2)}\n`);
    } finally {
      fs.closeSync(fd);
    }
    return { ok: true, path: out };
  } catch (e) {
    if (e && e.code === "EEXIST") {
      return refuse(
        "next-run-path-exists",
        "--write-next-run refuses to replace an existing file (exclusive create)",
        { path: out },
      );
    }
    return refuse("next-run-write-failed", String(e.message || e), { path: out });
  }
}

function missingEmit(code, pathValue) {
  emit(
    {
      ok: false,
      refused: true,
      status: "malformed",
      error: { code, path: pathValue },
      productionAcquisition: false,
    },
    0,
  );
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

  async function runInput(input, inputPath = null, extraProtected = []) {
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
      const written = writeNext(String(args["write-next-run"]), buildNextRunManifest(result, inputPath), [
        inputPath,
        ...extraProtected,
      ]);
      if (!written.ok) {
        result.nextRun = { refused: true, prep: written };
      } else {
        result.nextRun = { path: written.path, schema: buildNextRunManifest(result, inputPath).schema };
      }
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
      const manPath = resolveCliPath(args["from-next-run"]);
      if (!manPath || !fs.existsSync(manPath) || !fs.statSync(manPath).isFile()) {
        missingEmit("missing-next-run-manifest", args["from-next-run"]);
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
      const manDir = path.dirname(manPath);
      const inputFile = args.input
        ? resolveCliPath(args.input)
        : man.inputs?.input
          ? resolveManifestPath(man.inputs.input, manDir)
          : null;
      if (!inputFile || !fs.existsSync(inputFile) || !fs.statSync(inputFile).isFile()) {
        missingEmit("missing-next-run-input", inputFile);
      }
      const input = loadJson(inputFile);
      const extraProtected = [manPath];
      if (args.record && args.record !== true) {
        const recPath = resolveCliPath(args.record);
        if (!recPath || !fs.existsSync(recPath) || !fs.statSync(recPath).isFile()) {
          missingEmit("missing-record", recPath || args.record);
        }
        const rec = loadJson(recPath);
        extraProtected.push(recPath);
        if (isPlain(input)) {
          input.record = rec.record || rec;
        }
      }
      const result = await runInput(input, inputFile, extraProtected);
      emit(result, 0);
    }

    const file = args._[1] ? resolveCliPath(args._[1]) : null;
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missingEmit("missing-input", file || args._[1] || null);
    }
    const input = loadJson(file);
    const result = await runInput(input, file, []);
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
    const result = await runInput(input, file, []);
    result.sample = key;
    emit(result, 0);
  }

  if (cmd === "validate") {
    const file = args._[1] ? resolveCliPath(args._[1]) : null;
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missingEmit("missing-input", file || args._[1] || null);
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
