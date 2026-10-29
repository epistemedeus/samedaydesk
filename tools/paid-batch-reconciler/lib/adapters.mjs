import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { F08_PIN_SHA } from "./pins.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveF08Root(explicit) {
  if (explicit) return explicit;
  if (process.env.F08_PIN_ROOT) return process.env.F08_PIN_ROOT;
  return null;
}

export function f08IndexPath(root) {
  return join(root, "server/paid-useful-jobs/index.mjs");
}

export function f08CliPath(root) {
  return join(root, "server/paid-useful-jobs/bin/cli.mjs");
}

export async function loadF08Module(root = resolveF08Root()) {
  if (!root) return null;
  const index = f08IndexPath(root);
  if (!existsSync(index)) return null;
  return import(pathToFileURL(index).href);
}

/**
 * Optional F08 CLI spawn. F08 is not on main; missing sibling does not block
 * the default useful-jobs runner. Later Root binding: F08_PIN_ROOT.
 */
export function spawnF08Cli(root, { engineId, files, paymentPath, funding, example, outDir, settle }) {
  const cli = f08CliPath(root);
  if (!existsSync(cli)) {
    const err = new Error(`F08 CLI missing at ${cli}`);
    err.code = "f08-absent";
    throw err;
  }
  const args = ["run", engineId];
  if (example) args.push("--example");
  else {
    for (const [key, filePath] of Object.entries(files || {})) {
      if (filePath) args.push(`--${key}`, filePath);
    }
  }
  if (funding) args.push("--funding", funding);
  if (paymentPath) args.push("--payment", paymentPath);
  if (outDir) args.push("--out-dir", outDir);
  if (settle) args.push("--settle");
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    cwd: root,
  });
  let json = null;
  try {
    json = JSON.parse(String(result.stdout || "").trim());
  } catch {
    json = null;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json, pin: F08_PIN_SHA };
}

export function mapF08ResultToItem(engineId, result) {
  if (!isPlainObject(result)) {
    return {
      engineId,
      outcome: "rejected",
      fundingState: "rejected",
      sold: false,
      code: "f08-unreadable",
      runner: "f08-pin",
    };
  }
  return {
    engineId,
    outcome: result.ok === true ? "completed" : "rejected",
    fundingState: result.fundingState || "rejected",
    sold: false,
    code: result.code || null,
    error: result.error || null,
    sample: Boolean(result.sample),
    sampleReasons: result.sampleReasons || [],
    outputs: result.outputs || [],
    runner: "f08-pin",
    f08Ok: result.ok === true,
  };
}

export const LATER_BINDINGS = Object.freeze({
  f08: {
    status: "optional-absent-on-main",
    pin: F08_PIN_SHA,
    env: "F08_PIN_ROOT",
    consume: "server/paid-useful-jobs runPaidOffer / bin/cli.mjs; not a directory to edit",
  },
  i01: {
    status: "hasher-pinned",
    pr: "neomorphic-io#54",
    consume: "hashTermsVersion; integer termsVersion rejected",
  },
});
