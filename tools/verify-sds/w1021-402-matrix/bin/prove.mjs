#!/usr/bin/env node
import { parseArgv, USAGE } from "../lib/argv.mjs";
import { emitEnvelope, envelope, EXIT, exitFor, failError } from "../lib/envelope.mjs";
import { prove } from "../lib/prove.mjs";

const parsed = parseArgv(process.argv.slice(2));

if (parsed.help) {
  process.stderr.write(USAGE);
  const env = envelope({
    ok: true,
    command: "help",
    result: { usage: true },
  });
  emitEnvelope(env, { pretty: parsed.pretty });
  process.exit(EXIT.OK);
}

let env;
try {
  env = await prove(parsed);
} catch (error) {
  env = envelope({
    ok: false,
    command: parsed.command || "prove",
    status: "error",
    error: failError("RUNTIME", error.message, { stack: error.stack }),
  });
}

emitEnvelope(env, { pretty: parsed.pretty });
process.exit(exitFor(env));
