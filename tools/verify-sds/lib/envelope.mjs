import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENVELOPE_SCHEMA, REPO_NAME, WANTED_NODE } from "./pins.mjs";

export const SCHEMA_VERSION = 1;

export const EXIT = Object.freeze({
  OK: 0,
  FAIL: 1,
  USAGE: 2,
  RUNTIME: 64,
});

export function nodeInfo(version = process.version) {
  const actual = version.startsWith("v") ? version : `v${version}`;
  const major = Number(String(actual).replace(/^v/, "").split(".")[0]);
  return { wanted: WANTED_NODE, actual, major };
}

export function failError(code, message, detail) {
  const error = { code, message };
  if (detail !== undefined) error.detail = detail;
  return error;
}

export function envelope(partial = {}) {
  const ok = partial.ok === true;
  const status = partial.status ?? (ok ? "pass" : "fail");
  const body = {
    ok,
    schema: ENVELOPE_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    command: String(partial.command || "unknown"),
    repo: REPO_NAME,
    checkedAt: partial.checkedAt || new Date().toISOString(),
    node: partial.node || nodeInfo(),
    dryRun: Boolean(partial.dryRun),
    status,
    job: partial.job ?? null,
    jobs: Array.isArray(partial.jobs) ? partial.jobs : undefined,
    evidence: Array.isArray(partial.evidence) ? partial.evidence : [],
    error: partial.error ?? null,
    boundary: {
      paymentSent: false,
      toolsCalled: false,
    },
  };
  if (body.jobs === undefined) delete body.jobs;
  if (partial.result !== undefined) body.result = partial.result;
  if (partial.receipt !== undefined) body.receipt = partial.receipt;
  return body;
}

export function exitFor(env) {
  if (env.ok) return EXIT.OK;
  const code = env.error?.code;
  if (env.status === "usage" || code === "USAGE") return EXIT.USAGE;
  if (env.status === "error" || code === "RUNTIME") return EXIT.RUNTIME;
  return EXIT.FAIL;
}

export function emitEnvelope(env, { pretty = false, root = null } = {}) {
  const text = pretty ? `${JSON.stringify(env, null, 2)}\n` : `${JSON.stringify(env)}\n`;
  process.stdout.write(text);
  const label = env.ok ? "pass" : env.error?.code || env.status;
  const job = env.job ? ` ${env.job}` : "";
  process.stderr.write(`verify-sds ${env.command}${job}: ${label}\n`);
  if (!root) return;
  try {
    const dir = join(root, "tools/verify-sds/artifacts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "last.json"), `${JSON.stringify(env, null, 2)}\n`);
  } catch {
    // evidence write must not change the verify exit
  }
}

export { WANTED_NODE, REPO_NAME };
