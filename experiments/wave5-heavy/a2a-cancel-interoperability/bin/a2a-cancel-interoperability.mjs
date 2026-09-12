#!/usr/bin/env node
import { SCHEMA } from "../src/constants.mjs";

function help() {
  return {
    schema: SCHEMA,
    help: true,
    commands: [
      {
        id: "journey",
        argv: ["node", "experiments/wave5-heavy/a2a-cancel-interoperability/bin/a2a-cancel-interoperability.mjs"],
      },
    ],
    paymentAuthority: "none",
  };
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help") || argv[0] === "help") {
  process.stdout.write(`${JSON.stringify(help(), null, 2)}\n`);
  process.exit(0);
}

try {
  const { runJourney } = await import("../src/journey.mjs");
  const out = await runJourney();
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out.ok ? 0 : 1);
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null } }, null, 2)}\n`,
  );
  process.exit(1);
}
