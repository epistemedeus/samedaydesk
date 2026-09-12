/**
 * Cold CLI adapter for useful-jobs 1.4.0 json-schema-webhook-drift.
 * Spawns the published kit only. Never networks on the job path.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureKitAt } from "../../lib/ensure-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_ROOT = HERE;
export const JOB_ID = "json-schema-webhook-drift";
export const KIT_ROOT = join(HERE, "vendor", "useful-jobs-1.4.0");
export const KIT_BIN = join(KIT_ROOT, "bin", "useful-jobs.mjs");
export const OUTPUT_JSON = "drift-brief.json";
export const OUTPUT_MD = "drift-brief.md";
export const NODE_HEAP = "--max-old-space-size=768";

export function parseStdoutJson(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\n+/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* continue */
      }
    }
    return null;
  }
}

function readOutputFiles(outDir) {
  const files = {};
  let brief = null;
  let markdown = null;
  if (!outDir) return { files, brief, markdown };
  const jsonPath = join(outDir, OUTPUT_JSON);
  const mdPath = join(outDir, OUTPUT_MD);
  if (existsSync(jsonPath)) {
    files[OUTPUT_JSON] = jsonPath;
    brief = JSON.parse(readFileSync(jsonPath, "utf8"));
  }
  if (existsSync(mdPath)) {
    files[OUTPUT_MD] = mdPath;
    markdown = readFileSync(mdPath, "utf8");
  }
  return { files, brief, markdown };
}

/**
 * @param {{before?: string, after?: string, used?: string, outDir?: string, extraArgs?: string[], timeoutMs?: number}} opts
 */
export function runJsonSchemaWebhookDrift(opts = {}) {
  const { before, after, used, outDir, extraArgs = [], timeoutMs = 120_000 } = opts;
  const kit = ensureKitAt(join(HERE, "vendor"));
  const args = [kit.cli, "run", JOB_ID];
  if (before) args.push("--before", before);
  if (after) args.push("--after", after);
  if (used) args.push("--used", used);
  if (outDir) args.push("--out-dir", outDir);
  args.push(...extraArgs);

  const env = { ...process.env, NODE_OPTIONS: NODE_HEAP };
  const spawned = spawnSync(process.execPath, args, {
    cwd: kit.root,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = spawned.stdout || "";
  const stderr = spawned.stderr || "";
  const stdoutJson = parseStdoutJson(stdout);
  const { files, brief, markdown } = readOutputFiles(outDir);
  const exitCode = spawned.status == null ? (spawned.error ? 1 : 1) : spawned.status;
  const refused = Boolean(stdoutJson?.refused) || exitCode !== 0;
  return {
    ok: stdoutJson?.ok === true && exitCode === 0,
    refused,
    code: stdoutJson?.code || null,
    status: stdoutJson?.status || brief?.status || null,
    kind: stdoutJson?.kind || brief?.kind || null,
    purchaseAuthority: stdoutJson?.purchaseAuthority ?? brief?.purchaseAuthority ?? false,
    sold: stdoutJson?.sold ?? brief?.sold ?? false,
    sample: stdoutJson?.sample ?? brief?.sample ?? false,
    exampleMode: stdoutJson?.exampleMode ?? brief?.exampleMode ?? false,
    exitCode,
    stdout,
    stderr,
    stdoutJson,
    brief,
    markdown,
    files,
    args,
    timedOut: Boolean(spawned.error && spawned.error.code === "ETIMEDOUT"),
    error: spawned.error ? String(spawned.error.message || spawned.error) : null,
  };
}

export default runJsonSchemaWebhookDrift;
