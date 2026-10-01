#!/usr/bin/env node
import { appendFileSync } from "node:fs";

const phase = process.argv[2];
const trace = process.env.FOUNDRY_WORKER_TRACE;
if (trace) appendFileSync(trace, `${phase}\n`);

if (process.env.FOUNDRY_WORKER_HOLD === phase) {
  process.stdout.write(`${phase}-started\n`);
  setTimeout(() => {
    process.stdout.write(`${phase}-done\n`, () => process.exit(0));
  }, 10_000);
} else {
  process.stdout.write(`${phase}-done\n`);
  process.exit(0);
}
