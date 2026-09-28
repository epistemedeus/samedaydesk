#!/usr/bin/env node
process.stdout.write(
  `${JSON.stringify({
    ok: false,
    refused: true,
    code: "missing-required-inputs",
    error: "engine closed",
  })}\n`,
);
process.exit(2);
