#!/usr/bin/env node
/**
 * Seeded transport failure: JSON looks successful, process exits nonzero.
 * Must not become an actionable second-run.
 */
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    appId: "vendor-budget-impact",
    status: "partial",
    note: "seeded nonzero exit",
  })}\n`,
);
process.exit(1);
