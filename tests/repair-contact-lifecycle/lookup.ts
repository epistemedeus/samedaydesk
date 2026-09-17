#!/usr/bin/env node
import { findRepairContactLifecycle } from "../../client/src/data/repairContactLifecycle.ts";

const id = process.argv[2] ?? null;
const record = findRepairContactLifecycle(id);
if (record == null) {
  process.stdout.write("null\n");
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(record)}\n`);
