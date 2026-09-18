#!/usr/bin/env node
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  SEEDED_FAILURE,
  SEEDED_FAILURE_ALIASES,
  evaluateCold,
  evaluateFile,
  evaluateSeededFailure,
  refusedFlag,
  runSuite,
} from "./lib.mjs";

const HELP = `SameDayDesk bazaar-drift commerce receipt (offline, unpaid).

Usage:
  node tools/commerce-receipts/bazaar-drift/cli.mjs --cold --pretty
  node tools/commerce-receipts/bazaar-drift/cli.mjs --from-repo --pretty
  node tools/commerce-receipts/bazaar-drift/cli.mjs --seeded-failure rematerialized-read --pretty
  node tools/commerce-receipts/bazaar-drift/cli.mjs --suite
  node tools/commerce-receipts/bazaar-drift/cli.mjs --case tools/commerce-receipts/bazaar-drift/fixtures/reject/rewrite-origin.json --expect-reject edit_live_prices

--cold             compare committed origin 1.23.40 vs Bazaar SDS listings (8 routes)
--from-repo        same as --cold; pins are cross-checked against repo evidence
--seeded-failure   require rematerialized-read to be caught (exit 1)
--suite            every fixture matches its expected hold/reject code
--case <file>      evaluate one case JSON
--expect-reject    require the named error code on --case
--pretty           indent JSON

Does not pay, checkout, publish, rematerialize, or rewrite SKUs.
--live/--pay/--checkout/--publish/--rematerialize/--settle/--neo/--neo-kernel-vendor are refused (exit 2).
--seeded-failure exits 1 only when the designated seed is caught; a missed or accepted seed exits 2.
`;

export function runCli(argv = process.argv.slice(2), io = process) {
  const refused = refusedFlag(argv);
  if (refused) {
    io.stdout.write(
      `${JSON.stringify({
        ok: false,
        schema: "samedaydesk.commerce-receipt.bazaar-drift.result.v1",
        decision: "reject",
        code: "REFUSED",
        error: {
          code: "REFUSED",
          message: `${refused} is refused. This pack is unpaid offline bazaar-drift only.`,
        },
        paid: false,
        paymentSent: false,
        rematerialized: false,
        liveSdsPricesUnchanged: true,
        liveCdp: false,
      })}\n`,
    );
    return 2;
  }

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        cold: { type: "boolean", default: false },
        "from-repo": { type: "boolean", default: false },
        suite: { type: "boolean", default: false },
        "seeded-failure": { type: "string" },
        case: { type: "string" },
        "expect-reject": { type: "string" },
        pretty: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (cause) {
    io.stderr.write(`${cause.message}\n`);
    return 2;
  }

  const indent = values.pretty ? 2 : 0;
  const write = (value, code) => {
    io.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
    return code;
  };

  if (values.help) {
    io.stdout.write(HELP);
    return 0;
  }

  const modes = [
    values.cold || values["from-repo"],
    values.suite,
    Boolean(values["seeded-failure"]),
    Boolean(values.case) || positionals.length > 0,
  ].filter(Boolean).length;

  if (modes !== 1) {
    io.stderr.write("Use exactly one of --cold/--from-repo, --suite, --seeded-failure, or --case.\n");
    return 2;
  }

  if (values.suite) {
    const report = runSuite();
    return write(
      {
        ok: report.ok,
        command: "suite",
        passed: report.passed,
        failed: report.failed,
        total: report.total,
        results: report.results.map((item) => ({
          name: item.name,
          expect: item.expect,
          expectedCode: item.expectedCode,
          ok: item.ok,
          decision: item.decision,
          codes: item.codes,
        })),
      },
      report.ok ? 0 : 1,
    );
  }

  if (values["seeded-failure"]) {
    if (!SEEDED_FAILURE_ALIASES.includes(values["seeded-failure"])) {
      return write(
        {
          ok: false,
          command: "seeded-failure",
          error: { code: "USAGE", message: "--seeded-failure must be rematerialized-read" },
        },
        2,
      );
    }
    const seed = evaluateSeededFailure();
    return write(
      {
        ok: false,
        command: "seeded-failure",
        seed: SEEDED_FAILURE,
        error: seed.error,
        caught: seed.caught,
        result: {
          file: seed.filePath ?? null,
          caseId: seed.result?.caseId ?? null,
          naiveVerdict: seed.result?.naiveVerdict ?? null,
          honestVerdict: seed.result?.honestVerdict ?? null,
          decision: seed.result?.decision ?? null,
          codes: seed.result?.codes ?? [],
          priceConflicts: seed.result?.priceConflicts ?? [],
          rematerialized: seed.result?.rematerialized ?? null,
          liveSdsPricesUnchanged: seed.result?.liveSdsPricesUnchanged ?? null,
          paid: seed.result?.paid ?? null,
        },
      },
      seed.caught ? 1 : 2,
    );
  }

  if (values.cold || values["from-repo"]) {
    const result = evaluateCold();
    return write({ ...result, command: values["from-repo"] ? "from-repo" : "cold" }, result.ok ? 0 : 1);
  }

  const casePath = values.case || positionals[0];
  const result = evaluateFile(casePath);
  if (values["expect-reject"]) {
    const ok = !result.ok && result.codes.includes(values["expect-reject"]);
    return write(
      {
        ok,
        expectReject: values["expect-reject"],
        file: result.filePath,
        caseId: result.caseId,
        naiveVerdict: result.naiveVerdict,
        honestVerdict: result.honestVerdict,
        decision: result.decision,
        codes: result.codes,
        errors: result.errors,
        rematerialized: result.rematerialized,
        liveSdsPricesUnchanged: result.liveSdsPricesUnchanged,
        paid: result.paid,
      },
      ok ? 0 : 1,
    );
  }

  return write(result, result.ok ? 0 : 1);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  process.exit(runCli());
}
