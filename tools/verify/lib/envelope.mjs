import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_VERSION = 1;
const REPO = "samedaydesk";
const WANTED_NODE = "22.x";

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
    schemaVersion: SCHEMA_VERSION,
    command: String(partial.command || "unknown"),
    repo: REPO,
    checkedAt: partial.checkedAt || new Date().toISOString(),
    node: partial.node || nodeInfo(),
    dryRun: Boolean(partial.dryRun),
    status,
    feature: partial.feature ?? null,
    evidence: Array.isArray(partial.evidence) ? partial.evidence : [],
    error: partial.error ?? null,
    boundary: {
      paymentSent: false,
      toolsCalled: false,
      ...(partial.boundary || {}),
    },
  };
  if (partial.result !== undefined) body.result = partial.result;
  return body;
}

export function exitFor(env) {
  if (env.ok) return EXIT.OK;
  const code = env.error?.code;
  if (env.status === "usage" || code === "USAGE") return EXIT.USAGE;
  if (env.status === "error" || code === "RUNTIME") return EXIT.RUNTIME;
  return EXIT.FAIL;
}

export function writeEvidence(root, env, name = "last.json") {
  if (!root) return null;
  const dir = join(root, "tools/verify/artifacts");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(env, null, 2)}\n`);
  return path;
}

export function emitEnvelope(env, { pretty = false, human = true, root = null } = {}) {
  const text = pretty ? `${JSON.stringify(env, null, 2)}\n` : `${JSON.stringify(env)}\n`;
  process.stdout.write(text);
  if (human) {
    const label = env.ok ? "pass" : env.error?.code || env.status;
    process.stderr.write(`verify ${env.command}: ${label}\n`);
  }
  if (root) {
    try {
      writeEvidence(root, env);
    } catch {
      // evidence write must not change the verify exit
    }
  }
}

export { SCHEMA_VERSION, REPO, WANTED_NODE };
