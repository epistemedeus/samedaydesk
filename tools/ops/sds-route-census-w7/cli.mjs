#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEEDED_FAILURES,
  buildCensus,
  evaluateFile,
  runSuite,
  seededFailurePath,
  validateClaim,
} from "./lib.mjs";

function usage() {
  return `SameDayDesk SDS route census (read-only, W7).

Walks local SDS source and Express 5 leaves from createSdsApp(). Does not
HTTP-probe, pay, publish, or load neomorphic-io.

Usage:
  node tools/ops/sds-route-census-w7/cli.mjs
  node tools/ops/sds-route-census-w7/cli.mjs --suite
  node tools/ops/sds-route-census-w7/cli.mjs --seeded-failure payment-as-readonly
  node tools/ops/sds-route-census-w7/cli.mjs --expect-reject payment_as_readonly <file>
  node tools/ops/sds-route-census-w7/cli.mjs --input <claim.json>

--live / --pay / --neo / --publish are refused.
`;
}

const REFUSED_FLAGS = new Map([
  ["--live", "--live is refused. This pack is a read-only local SDS route census."],
  ["--pay", "--pay is refused. This pack is a read-only local SDS route census."],
  ["--neo", "--neo is refused. This pack does not load neomorphic-io."],
  ["--publish", "--publish is refused. This pack is a read-only local SDS route census."],
  ["--checkout", "--checkout is refused. This pack is a read-only local SDS route census."],
  ["--settle", "--settle is refused. This pack is a read-only local SDS route census."],
]);

function writeJson(value, pretty) {
  return `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
}

function publicCensus(census) {
  const { routes, ...rest } = census;
  return {
    ...rest,
    routes: routes.map((row) => ({
      method: row.method,
      path: row.path,
      class: row.class,
      readOnly: row.readOnly,
      moneyMovement: row.moneyMovement,
      moneyAdjacent: row.moneyAdjacent,
      probed: row.probed,
      file: row.file,
      source: row.source,
    })),
  };
}

export function refusedFromArgv(argv) {
  return argv.find((arg) => REFUSED_FLAGS.has(arg)) ?? null;
}

function takeFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return { rest: argv, value: null };
  const value = argv[index + 1] ?? null;
  const rest = [...argv.slice(0, index), ...argv.slice(index + 2)];
  return { rest, value };
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

export async function runCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const pretty = hasFlag(argv, "--pretty");
  const filtered = argv.filter((arg) => arg !== "--pretty");

  if (hasFlag(filtered, "--help") || hasFlag(filtered, "-h")) {
    stdout.write(usage());
    return 0;
  }

  const refused = refusedFromArgv(filtered);
  if (refused) {
    stdout.write(
      writeJson(
        {
          ok: false,
          error: { code: "REFUSED", message: REFUSED_FLAGS.get(refused) },
        },
        pretty,
      ),
    );
    return 2;
  }

  if (hasFlag(filtered, "--suite")) {
    const suite = await runSuite();
    stdout.write(
      writeJson(
        {
          ok: suite.ok,
          command: "suite",
          passed: suite.passed,
          failed: suite.failed,
          total: suite.total,
          censusOk: suite.censusOk,
        },
        pretty,
      ),
    );
    return suite.ok ? 0 : 1;
  }

  if (hasFlag(filtered, "--seeded-failure")) {
    const { value: seed } = takeFlag(filtered, "--seeded-failure");
    const spec = seed ? SEEDED_FAILURES[seed] : null;
    if (!spec) {
      stdout.write(
        writeJson(
          {
            ok: false,
            command: "seeded-failure",
            seed: seed || null,
            error: { code: "UNKNOWN_SEED", message: `unknown seeded failure: ${seed || "(missing)"}` },
          },
          pretty,
        ),
      );
      return 2;
    }
    const filePath = seededFailurePath(seed);
    const census = await buildCensus();
    const result = await evaluateFile(filePath, census);
    const caught = result.honestVerdict === "reject" && result.codes.includes(spec.code);
    stdout.write(
      writeJson(
        {
          ok: false,
          command: "seeded-failure",
          seed,
          designated: spec.designated === true,
          error: {
            code: "SEED_REJECT",
            message: spec.message,
          },
          result: {
            claimId: result.claimId || seed,
            naiveVerdict: result.naiveVerdict,
            honestVerdict: result.honestVerdict,
            codes: result.codes,
            caught,
          },
        },
        pretty,
      ),
    );
    return caught ? 1 : 1;
  }

  if (hasFlag(filtered, "--expect-reject")) {
    const idx = filtered.indexOf("--expect-reject");
    const code = filtered[idx + 1];
    const file = filtered[idx + 2];
    if (!code || !file) {
      stdout.write(
        writeJson(
          {
            ok: false,
            command: "expect-reject",
            error: { code: "INVALID_ARGS", message: "--expect-reject requires <code> <file>" },
          },
          pretty,
        ),
      );
      return 2;
    }
    const census = await buildCensus();
    const result = await evaluateFile(resolve(file), census);
    const matched = result.honestVerdict === "reject" && result.codes.includes(code);
    stdout.write(
      writeJson(
        {
          ok: matched,
          command: "expect-reject",
          expectReject: code,
          file,
          naiveVerdict: result.naiveVerdict,
          honestVerdict: result.honestVerdict,
          codes: result.codes,
        },
        pretty,
      ),
    );
    return matched ? 0 : 1;
  }

  if (hasFlag(filtered, "--input")) {
    const { value: file } = takeFlag(filtered, "--input");
    if (!file) {
      stdout.write(
        writeJson(
          {
            ok: false,
            error: { code: "INVALID_ARGS", message: "--input requires a claim JSON path" },
          },
          pretty,
        ),
      );
      return 2;
    }
    const census = await buildCensus();
    const result = await evaluateFile(resolve(file), census);
    stdout.write(writeJson({ ok: result.ok, command: "input", ...result }, pretty));
    return result.ok ? 0 : 1;
  }

  const unknown = filtered.find((arg) => arg.startsWith("-"));
  if (unknown) {
    stdout.write(
      writeJson(
        {
          ok: false,
          error: { code: "INVALID_ARGS", message: `unknown flag ${unknown}` },
        },
        pretty,
      ),
    );
    return 2;
  }

  const census = await buildCensus();
  stdout.write(writeJson(publicCensus(census), pretty));
  return census.ok ? 0 : 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}
