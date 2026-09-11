import { assurePlanFile, refusePrepare, refuseSettle, resolvePlanPath, runJourneyFile } from "./assure.mjs";
import { honestyEnvelope } from "./honesty.mjs";
import { ERROR_CODES, SDS_PR51_COMMIT } from "./pins.mjs";
import { loadB04Money } from "./b04-import.mjs";

export function usage() {
  return `Pre-spend cost assurance (W3-10 / E06).
Lists required tools/accounts and a decimal-string USDC cap. purchaseAuthorized is always false.
Does not call settle or prepare. Does not change live extract $0.005 or seller-integrity-audit $0.01.

node bin/pre-spend.mjs assure --plan fixtures/ok-plan.json
node bin/pre-spend.mjs journey --fixture fixtures/ok.json
node bin/pre-spend.mjs settle    # refused
node bin/pre-spend.mjs prepare    # refused
`;
}

export function parseArgs(argv) {
  const out = { command: argv[0], flags: {} };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--plan") out.plan = argv[++i];
    else if (arg === "--fixture") out.fixture = argv[++i];
    else if (arg.startsWith("--")) {
      out.unknown = arg;
    } else if (!out.command) {
      out.command = arg;
    }
  }
  return out;
}

function printJson(payload, code) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return code;
}

export async function runCli(argv, { cwd = process.cwd() } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.command) {
    process.stdout.write(`${usage()}\n`);
    return args.help ? 0 : 2;
  }

  if (args.unknown) {
    return printJson(
      {
        ok: false,
        status: "reject",
        code: ERROR_CODES.MISSING_REQUIRED_INPUTS,
        message: `unknown option ${args.unknown}`,
        purchaseAuthorized: false,
      },
      2,
    );
  }

  if (args.command === "settle") {
    return printJson(refuseSettle(), 2);
  }
  if (args.command === "prepare") {
    return printJson(refusePrepare(), 2);
  }

  if (args.command === "status") {
    const b04 = await loadB04Money();
    return printJson(
      {
        ok: true,
        sdsCommit: SDS_PR51_COMMIT,
        purchaseAuthorized: false,
        b04: { kind: b04.kind, attached: b04.attached },
        honesty: honestyEnvelope({ b04Source: b04.kind }),
      },
      0,
    );
  }

  if (args.command === "assure") {
    if (!args.plan) {
      return printJson(
        {
          ok: false,
          status: "reject",
          code: ERROR_CODES.MISSING_REQUIRED_INPUTS,
          message: "assure requires --plan",
          purchaseAuthorized: false,
        },
        2,
      );
    }
    const planPath = resolvePlanPath(args.plan, cwd);
    const result = await assurePlanFile(planPath);
    return printJson(result, result.ok ? 0 : 2);
  }

  if (args.command === "journey") {
    if (!args.fixture) {
      return printJson(
        {
          ok: false,
          status: "reject",
          code: ERROR_CODES.MISSING_REQUIRED_INPUTS,
          message: "journey requires --fixture",
          purchaseAuthorized: false,
        },
        2,
      );
    }
    const fixturePath = resolvePlanPath(args.fixture, cwd);
    const result = await runJourneyFile(fixturePath);
    return printJson(result, result.ok ? 0 : 2);
  }

  return printJson(
    {
      ok: false,
      status: "reject",
      code: ERROR_CODES.MISSING_REQUIRED_INPUTS,
      message: "command must be assure, journey, settle, prepare, or status",
      purchaseAuthorized: false,
    },
    2,
  );
}
