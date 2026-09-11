#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import {
  defaultPaidRetryFixture,
  probeExtractFetch,
  refusePaidRetryFile,
  runHonestyReport,
} from "../lib/honesty.mjs";
import { USEFUL_JOBS_JOB } from "../lib/pins.mjs";

function usage() {
  return `extract-unpaid-honesty — join useful-jobs purchaseAuthority=false with buyer-runtimes unpaid stop.

Commands:
  journey                         listing-repair-packet --example under intercept
  report [--example|--input PATH] Spawn a catalog job under PATH/proxy intercept
  probe-extract                    Seeded stub fetch of /extract; must be caught
  refuse-paid-retry [--wrap FILE] Refuse wrapping useful-jobs with a paid retry
  help

Examples:
  node tools/extract-unpaid-honesty/bin/honesty.mjs journey
  node tools/extract-unpaid-honesty/bin/honesty.mjs report --example
  node tools/extract-unpaid-honesty/bin/honesty.mjs probe-extract
  node tools/extract-unpaid-honesty/bin/honesty.mjs refuse-paid-retry

Does not pay, settle, or live-GET merchant pages. Local HTTP intercept + spawned kit only.
`;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function emit(payload, code = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || args.help) {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "refuse-paid-retry") {
  const wrapPath = args.wrap || defaultPaidRetryFixture();
  const result = args.wrap || wrapPath ? refusePaidRetryFile(wrapPath) : refusePaidRetry({});
  emit(result, 2);
}

if (cmd === "probe-extract") {
  const result = await probeExtractFetch({
    url: args.url || process.env.HONESTY_PROBE_URL,
  });
  emit(result, result.caught ? 0 : 1);
}

if (cmd === "report" || cmd === "journey") {
  const example = cmd === "journey" || args.example === true || !args.input;
  const result = await runHonestyReport({
    jobId: args.job || USEFUL_JOBS_JOB,
    example,
    input: args.input || null,
    outDir: args["out-dir"] || null,
  });
  if (args.out) {
    writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  }
  emit(result, result.ok ? 0 : 1);
}

emit({ ok: false, refused: true, code: "unknown-command", error: `unknown command ${cmd}`, usage: usage() }, 2);
