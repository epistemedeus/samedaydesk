import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const PINS = JSON.parse(
  fs.readFileSync(path.join(ROOT, "vendor-pins/PIN.json"), "utf8"),
);

let extractRoot;
let cleanupRegistered = false;

export function cleanupVendors() {
  const owned = extractRoot;
  extractRoot = undefined;
  if (owned) fs.rmSync(owned, { recursive: true, force: true });
}

function registerVendorCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.once("exit", cleanupVendors);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      cleanupVendors();
      // The once handler is already detached, so preserve normal signal exit.
      process.kill(process.pid, signal);
    });
  }
}

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function pinEntries() {
  const entries = [];
  for (const meta of Object.values(PINS.archives || {})) {
    entries.push(meta);
  }
  for (const meta of Object.values(PINS.kits || {})) {
    entries.push(meta);
  }
  return entries;
}

export function assertArchivePins() {
  for (const meta of pinEntries()) {
    const p = path.join(ROOT, "vendor-pins", meta.file);
    if (!fs.existsSync(p)) throw new Error(`missing archive ${meta.file}`);
    const size = fs.statSync(p).size;
    if (size !== meta.bytes) throw new Error(`${meta.file} size ${size} != ${meta.bytes}`);
    const digest = sha256File(p);
    if (digest !== meta.sha256) throw new Error(`${meta.file} sha mismatch`);
  }
}

function kitFileNames() {
  if (PINS.kits) {
    return Object.values(PINS.kits).map((m) => m.file);
  }
  const x = PINS.x402_url_extractor || {};
  return [x.evidence_kit, x.repeat_kit].filter(Boolean);
}

export function ensureVendorsExtracted() {
  if (extractRoot && fs.existsSync(extractRoot)) return extractRoot;
  extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), "s242-vendors-"));
  registerVendorCleanup();
  const files = [
    PINS.archives["record-repeat-job"].file,
    PINS.archives["distribution-repair"].file,
    ...kitFileNames(),
  ];
  try {
    for (const file of files) {
      const src = path.join(ROOT, "vendor-pins", file);
      const r = spawnSync("tar", ["-xzf", src, "-C", extractRoot], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`extract failed ${file}: ${r.stderr}`);
    }
  } catch (error) {
    cleanupVendors();
    throw error;
  }
  return extractRoot;
}

export function recordRepeatBin() {
  return path.join(ensureVendorsExtracted(), "record-repeat-job/bin/record-repeat.mjs");
}

export function distributionRepairBin() {
  return path.join(ensureVendorsExtracted(), "distribution-repair/bin/distribution-repair.mjs");
}

export function evidenceKitRoot() {
  return path.join(ensureVendorsExtracted(), "s137-consumer-evidence-kit");
}

export function runNodeJson(script, args, timeoutMs = 60_000) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = r.stdout || "";
  let json = null;
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          json = JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          json = null;
        }
      }
    }
  }
  return {
    status: r.status,
    stdout,
    stderr: r.stderr || "",
    combined: `${stdout}${r.stderr || ""}`,
    json,
  };
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text.endsWith("\n") ? text : `${text}\n`);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

export function fixture(...parts) {
  return path.join(ROOT, "samples", ...parts);
}

export function samples(...parts) {
  return fixture(...parts);
}

export function labelSample(caller = {}) {
  return {
    ...caller,
    sampleLabel: caller.sampleLabel || (caller.exampleMode ? "explicit-example" : "caller-input"),
    notMarketFact: true,
    notCustomerDemand: true,
    exampleMode: Boolean(caller.exampleMode),
  };
}
