#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runRouteConsumer } from "../lib/run-consumer.mjs";
import { ConsumerError, toPublicError } from "../lib/errors.mjs";

let values;
try {
  ({ values } = parseArgs({
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: "boolean", default: false },
      before: { type: "string" },
      after: { type: "string" },
      "out-dir": { type: "string" },
    },
  }));
} catch (err) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      refused: true,
      code: "invalid_args",
      error: err instanceof Error ? err.message : String(err),
      analysis: "refused",
      paid: false,
      settled: false,
      nonsettling: true,
      purchaseAuthority: false,
    })}\n`,
  );
  process.exit(2);
}

if (values.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

try {
  const result = await runRouteConsumer({
    before: values.before,
    after: values.after,
    outDir: values["out-dir"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok === true ? 0 : 2);
} catch (err) {
  process.stdout.write(`${JSON.stringify(toPublicError(err))}\n`);
  process.exit(err instanceof ConsumerError ? err.exitCode : 2);
}

function usage() {
  return `Independent route consumer for claimed Co12 catalog formats.

  node experiments/wave5/m08/bin/route-consumer.mjs --before <file-or-loopback-url> --after <file-or-loopback-url> --out-dir <dir>

Passes SDS JSON route catalogs (routes wrapper, catalog wrapper, raw array)
to the pinned tools/route-table-diff CLI. Explicitly refuses OpenAPI, HTML,
YAML, CSV, Express/Next/FastAPI sources, HTTPS catalogs, and Next.js-shaped
JSON. Does not copy that kernel, edit spa-route-shells.js, or settle payment.

Node >= 22. No extra npm packages. paid=false, settled=false.`;
}
