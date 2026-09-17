import { SCHEMA } from "./paths.mjs";

export const EXIT = Object.freeze({
  OK: 0,
  FAIL: 1,
  USAGE: 2,
  RUNTIME: 64,
});

export function envelope(partial = {}) {
  const ok = partial.ok === true;
  const body = {
    ok,
    schema: SCHEMA,
    command: String(partial.command || "unknown"),
    pack: "useful-jobs",
    status: partial.status ?? (ok ? "pass" : "fail"),
    advertisedCommands: ["list", "help"],
    error: partial.error ?? null,
    code: partial.code ?? null,
    boundary: {
      paymentSent: false,
      published: false,
      purchaseAuthority: false,
    },
  };
  for (const key of [
    "skillPath",
    "archiveOverlay",
    "advertised",
    "engine",
    "results",
    "jobs",
    "childStatus",
    "childStderr",
    "childStdout",
    "detail",
  ]) {
    if (partial[key] !== undefined) body[key] = partial[key];
  }
  if (body.code === null) delete body.code;
  return body;
}

export function exitFor(env) {
  if (env.ok) return EXIT.OK;
  const code = env.code;
  if (env.status === "usage" || code === "usage") return EXIT.USAGE;
  if (
    code === "advertised-run" ||
    code === "not-list-help" ||
    code === "unknown-job" ||
    code === "unknown-help-job" ||
    code === "no-advertised-entry" ||
    code === "missing-frontmatter" ||
    code === "wrong-name"
  ) {
    return EXIT.USAGE;
  }
  if (env.status === "error" || code === "RUNTIME") return EXIT.RUNTIME;
  return EXIT.FAIL;
}
