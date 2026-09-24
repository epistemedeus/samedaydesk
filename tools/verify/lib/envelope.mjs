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
  return {
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
    // Callers cannot claim a payment or a catalogued tool execution.
    boundary: {
      paymentSent: false,
      toolsCalled: false,
    },
    ...(partial.result !== undefined ? { result: partial.result } : {}),
  };
}

export function exitFor(env) {
  if (env.ok) return EXIT.OK;
  const code = env.error?.code;
  if (env.status === "usage" || code === "USAGE") return EXIT.USAGE;
  if (env.status === "error" || code === "RUNTIME") return EXIT.RUNTIME;
  return EXIT.FAIL;
}

export function emitEnvelope(env, { pretty = false } = {}) {
  const text = pretty ? `${JSON.stringify(env, null, 2)}\n` : `${JSON.stringify(env)}\n`;
  process.stdout.write(text);
  const label = env.ok ? "pass" : env.error?.code || env.status;
  process.stderr.write(`verify ${env.command}: ${label}\n`);
}

export { SCHEMA_VERSION, REPO, WANTED_NODE };
