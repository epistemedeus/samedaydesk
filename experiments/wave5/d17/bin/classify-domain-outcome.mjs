#!/usr/bin/env node
/**
 * Thin consumer: spawn the current SDS52 wrapper CLI, then classify the
 * domain outcome. Does not run engines itself.
 *
 * Exit 0 when classification succeeds (including valid no-change/refusal).
 * Exit 2 only when transport produced no wrapper JSON.
 */
import { classifyWrapperCliResult, SCHEMA } from "../src/classify.mjs";
import { runWrapperCli } from "../src/run-wrapper-cli.mjs";

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
  process.stdout.write(`classify-domain-outcome — ${SCHEMA}

Forwards arguments to server/paid-useful-jobs/bin/cli.mjs, then prints a
domain-outcome contract object. wrapper.ok is not the analysis layer.

Examples:
  node experiments/wave5/d17/bin/classify-domain-outcome.mjs run vendor-budget-impact \\
    --before .../before.json --after .../after.json --out-dir /tmp/d17-out
`);
  process.exit(args[0] === "--help" || args[0] === "-h" || args[0] === "help" ? 0 : 2);
}

function flagValue(name) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !String(args[i + 1]).startsWith("--")) return args[i + 1];
  return undefined;
}

const result = runWrapperCli(args);
const jobId = args[0] === "run" ? args[1] : args[0];
const classified = classifyWrapperCliResult(result, {
  jobId,
  outDir: flagValue("out-dir"),
});

process.stdout.write(
  `${JSON.stringify({ classified, wrapper: result.body, processStatus: result.status }, null, 2)}\n`,
);
process.exit(classified.outcome === "transport_failure" && !result.body ? 2 : 0);
