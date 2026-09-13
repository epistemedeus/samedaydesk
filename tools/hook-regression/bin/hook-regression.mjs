#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runJourney } from "../lib/journey.mjs";
import { diagnosePaymentPayload } from "../lib/diagnose.mjs";
import { loadFixture } from "../lib/load-fixture.mjs";
import { rejectSeededAttempt } from "../lib/reject.mjs";
import { loadH4Fixtures } from "../lib/h4.mjs";
import { PR54_RULES } from "../lib/rules.mjs";

function parseArgs(argv) {
  const opts = {
    command: argv[0] || "help",
    fixture: null,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fixture" || arg === "--input") {
      opts.fixture = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return opts;
}

function print(value, code) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return code;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.command === "help" || opts.command === "--help" || opts.command === "-h") {
    return print(
      {
        usage: [
          "node bin/hook-regression.mjs journey --fixture fixtures/ok-payload.json",
          "node bin/hook-regression.mjs diagnose --fixture fixtures/ok-payload.json",
          "node bin/hook-regression.mjs reject --fixture fixtures/unsigned-hint-as-authority.json",
          "node bin/hook-regression.mjs rules",
        ],
        presenceOnly: true,
        installLiveHooks: false,
        saleState: "not_a_sale",
      },
      0,
    );
  }

  if (opts.command === "rules") {
    const h4 = loadH4Fixtures();
    return print({ rules: PR54_RULES, h4Imported: h4.present, h4Workspace: h4.workspace }, 0);
  }

  if (opts.command === "journey") {
    if (!opts.fixture) {
      return print({ ok: false, error: "journey requires --fixture <path>" }, 1);
    }
    const report = runJourney({ fixturePath: opts.fixture });
    return print(report, report.ok ? 0 : 1);
  }

  if (opts.command === "diagnose") {
    if (!opts.fixture) {
      return print({ ok: false, error: "diagnose requires --fixture <path>" }, 1);
    }
    const loaded = loadFixture(opts.fixture);
    const result = diagnosePaymentPayload(loaded.paymentPayload, {
      declared: loaded.declared,
      requirements: loaded.requirements,
      siblingPaymentRequirements: loaded.json.paymentRequirements,
    });
    return print(result, 0);
  }

  if (opts.command === "reject") {
    if (!opts.fixture) {
      return print({ ok: false, error: "reject requires --fixture <path>" }, 1);
    }
    const loaded = loadFixture(opts.fixture);
    const result = rejectSeededAttempt(loaded);
    return print(result, result.rejected ? 2 : 1);
  }

  return print({ ok: false, error: `unknown command ${opts.command}` }, 1);
}

const invokedAsCli =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
