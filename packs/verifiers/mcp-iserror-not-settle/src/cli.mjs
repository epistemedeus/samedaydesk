import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { evaluateFile, resolveCasePath } from "./case.mjs";
import { verifyCommitted } from "./committed.mjs";
import { fail } from "./failures.mjs";
import { findRepoRoot } from "./paths.mjs";
import { CODES, FORBIDDEN_FLAGS, PACK_ID } from "./rules.mjs";
import { runSeededFailure, runSuite } from "./suite.mjs";

export const USAGE = `SameDayDesk MCP isError≠settle verifier.

Offline only. Never treats MCP isError true, JSON-RPC error, or HTTP 200 as settlement.
Does not call live SDS, Stripe, or a facilitator. No npm install.

Usage:
  node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs
  node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --committed
  node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --suite
  node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --case <file.json>
  node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --seeded-failure
  node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --expect-reject <file.json>

Exit codes:
  0  committed pin held, suite matched, or a single case passed the invariant
  1  settle claim on isError/error, malformed case, or suite mismatch
  2  usage / forbidden flag

Forbidden: ${FORBIDDEN_FLAGS.join(" ")}
`;

function writeJson(stdout, value, pretty = true) {
  stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function refuseForbidden(argv) {
  const hit = argv.find((arg) => FORBIDDEN_FLAGS.includes(arg));
  if (!hit) return null;
  return fail(CODES.FORBIDDEN_FLAG, `refused ${hit}; this verifier is offline and does not pay, publish, or hit live rails`, {
    error: `refused ${hit}; this verifier is offline and does not pay, publish, or hit live rails`,
  });
}

export function parseCliArgs(argv) {
  const forbidden = refuseForbidden(argv);
  if (forbidden) return { forbidden };

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        committed: { type: "boolean", default: false },
        suite: { type: "boolean", default: false },
        case: { type: "string" },
        "seeded-failure": { type: "boolean", default: false },
        "expect-reject": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
        compact: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    return { error: fail(CODES.USAGE, error.message) };
  }

  const flags = {};
  for (const arg of argv) {
    if (arg === "--publish" || arg === "--deploy" || arg === "--write-sds") flags.publish = true;
    if (arg === "--checkout" || arg === "--pay" || arg === "--payment" || arg === "--live") {
      flags.checkout = true;
    }
  }

  return { values, positionals, flags };
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const parsed = parseCliArgs(argv);
  if (parsed.forbidden) {
    writeJson(stdout, parsed.forbidden);
    return 2;
  }
  if (parsed.error) {
    writeJson(stdout, parsed.error);
    stderr.write(`${parsed.error.error || parsed.error.failure?.message}\n`);
    return 2;
  }

  const { values, positionals, flags } = parsed;
  const pretty = !values.compact;

  if (values.help) {
    stderr.write(USAGE);
    return 0;
  }

  const modes = [
    values.committed,
    values.suite,
    Boolean(values.case),
    values["seeded-failure"],
    values["expect-reject"],
  ].filter(Boolean);
  if (modes.length > 1) {
    const err = fail(CODES.USAGE, "Choose one of --committed, --suite, --case, --seeded-failure, --expect-reject.");
    writeJson(stdout, err, pretty);
    return 2;
  }

  const defaultCommitted = modes.length === 0 && positionals.length === 0;
  if (values.committed || defaultCommitted) {
    const report = await verifyCommitted({ repoRoot: findRepoRoot(), flags });
    writeJson(stdout, report, pretty);
    if (report.code === CODES.FORBIDDEN_FLAG || report.code === CODES.PUBLISH_ATTEMPTED || report.code === CODES.CHECKOUT_TOUCHED) {
      return 2;
    }
    return report.ok === true ? 0 : 1;
  }

  if (values.suite) {
    const report = runSuite();
    writeJson(stdout, report, pretty);
    return report.ok ? 0 : 1;
  }

  if (values["seeded-failure"]) {
    const report = runSeededFailure();
    writeJson(stdout, report, pretty);
    return report.ok ? 0 : 1;
  }

  const fileArg = values.case || positionals[0];
  if (!fileArg) {
    const err = fail(CODES.USAGE, "Pass --committed, --suite, --seeded-failure, --case <file>, or --help.");
    writeJson(stdout, err, pretty);
    return 2;
  }

  const filePath = resolveCasePath(fileArg);
  const report = evaluateFile(filePath);

  if (values["expect-reject"]) {
    const ok = report.verdict === "reject" && report.ok === false;
    writeJson(stdout, { ...report, expectReject: true, ok }, pretty);
    return ok ? 0 : 1;
  }

  writeJson(stdout, report, pretty);
  return report.verdict === "reject" || report.ok === false ? 1 : 0;
}

export { resolve };
