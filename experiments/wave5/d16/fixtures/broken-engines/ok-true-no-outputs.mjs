#!/usr/bin/env node
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    appId: "vendor-budget-impact",
    status: "actionable",
    digest: "0000000000000000",
  })}\n`,
);
