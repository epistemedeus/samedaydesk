#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REFUSED_FLAGS, refusedFlag, runCold } from "./lib.mjs";

export async function run(argv = process.argv.slice(2)) {
  const refused = refusedFlag(argv);
  if (refused) {
    console.error(`${refused} is refused`);
    return 2;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: node tools/verify-sds/w921-402-matrix/cold-run.mjs");
    console.log("In-tree unpaid 402 amount matrix. No payment headers. No --live.");
    return 0;
  }
  for (const arg of argv) {
    if (String(arg).startsWith("--") && !["--help", "-h"].includes(arg)) {
      const name = String(arg).replace(/^--/, "");
      if (REFUSED_FLAGS.includes(name) || name === "origin") {
        console.error(`${arg} is refused`);
        return 2;
      }
    }
  }
  const report = runCold();
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = await run();
}
