/**
 * Cold CLI adapter for useful-jobs 1.4.0 json-schema-webhook-drift.
 * Spawns the published kit. Does not reimplement compare. No network on the job path.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXCLUSIVE_DIR = HERE;
export const KIT_DIR = path.join(HERE, "vendor", "useful-jobs-1.4.0");
export const KIT_BIN = path.join(KIT_DIR, "bin", "useful-jobs.mjs");
export const KIT_ARCHIVE = "/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz";
export const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_BYTES = 2575215;
export const JOB_ID = "json-schema-webhook-drift";
export const OUTPUTS = Object.freeze(["drift-brief.json", "drift-brief.md"]);

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function ensureKit() {
  if (!fs.existsSync(KIT_BIN)) {
    const buf = fs.readFileSync(KIT_ARCHIVE);
    if (buf.length !== KIT_BYTES) {
      throw new Error(`kit archive bytes ${buf.length} != ${KIT_BYTES}`);
    }
    const digest = createHash("sha256").update(buf).digest("hex");
    if (digest !== KIT_SHA256) {
      throw new Error(`kit archive sha256 ${digest} != ${KIT_SHA256}`);
    }
    fs.mkdirSync(path.join(HERE, "vendor"), { recursive: true });
    const tar = spawnSync("tar", ["-xzf", KIT_ARCHIVE, "-C", path.join(HERE, "vendor")], {
      encoding: "utf8",
    });
    if (tar.status !== 0) {
      throw new Error(`tar extract failed: ${tar.stderr || tar.stdout}`);
    }
  }
  if (!fs.existsSync(KIT_BIN)) {
    throw new Error(`missing kit bin ${KIT_BIN}`);
  }
  return KIT_DIR;
}

export function parseStdoutJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* keep scanning */
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {{before?: string, after?: string, used?: string, outDir?: string, extraArgs?: string[], timeoutMs?: number}} opts
 */
export function runJob(opts = {}) {
  ensureKit();
  const extraArgs = Array.isArray(opts.extraArgs) ? opts.extraArgs : [];
  const args = [KIT_BIN, "run", JOB_ID, ...extraArgs];
  if (opts.before) args.push("--before", path.resolve(opts.before));
  if (opts.after) args.push("--after", path.resolve(opts.after));
  if (opts.used) args.push("--used", path.resolve(opts.used));
  const outDir = opts.outDir ? path.resolve(opts.outDir) : fs.mkdtempSync(path.join(os.tmpdir(), "s03-webhook-drift-"));
  args.push("--out-dir", outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const run = spawnSync(process.execPath, args, {
    cwd: KIT_DIR,
    encoding: "utf8",
    env,
    timeout: opts.timeoutMs || 120_000,
    killSignal: "SIGTERM",
    maxBuffer: 8 * 1024 * 1024,
  });

  const stdoutJson = parseStdoutJson(run.stdout);
  const outputs = {};
  for (const name of OUTPUTS) {
    const filePath = path.join(outDir, name);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      outputs[name] = filePath;
    }
  }
  let brief = null;
  if (outputs["drift-brief.json"]) {
    brief = JSON.parse(fs.readFileSync(outputs["drift-brief.json"], "utf8"));
  }
  let briefMd = null;
  if (outputs["drift-brief.md"]) {
    briefMd = fs.readFileSync(outputs["drift-brief.md"], "utf8");
  }

  return {
    ok: stdoutJson?.ok === true && run.status === 0,
    refused: stdoutJson?.refused === true,
    code: stdoutJson?.code || null,
    exitCode: run.status == null ? 1 : run.status,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    stdoutJson,
    brief,
    briefMd,
    outDir,
    outputs,
    timedOut: run.error?.code === "ETIMEDOUT",
    kitDir: KIT_DIR,
    kitSha256: KIT_SHA256,
    purchaseAuthority: false,
    sold: false,
    customerBrief: false,
    network: false,
  };
}

export function impactPointers(brief, className) {
  const rows = brief?.impact?.[className] || [];
  return rows.map((row) => row.pointer);
}

export { sha256File };
