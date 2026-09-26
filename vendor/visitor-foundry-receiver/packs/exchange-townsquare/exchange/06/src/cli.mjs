#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reduceLifecycle } from "./reducer.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (n) => JSON.parse(readFileSync(join(root, "fixtures", n), "utf8"));

if (process.argv[2] !== "demo") {
  console.error("Usage: node src/cli.mjs demo");
  process.exit(2);
}

const cases = ["happy.json", "cancel-then-late.json", "withdraw-then-late.json"];
const out = {};
for (const name of cases) {
  const state = reduceLifecycle(load(name));
  out[name] = {
    status: state.status,
    cancelledAt: state.cancelledAt,
    proposals: Object.fromEntries(
      Object.entries(state.proposals).map(([id, p]) => [id, p.status]),
    ),
    results: state.results.map((r) => ({ id: r.resultId, disposition: r.disposition, applied: r.applied })),
    paymentActions: state.paymentActions,
  };
}
console.log(JSON.stringify(out, null, 2));
