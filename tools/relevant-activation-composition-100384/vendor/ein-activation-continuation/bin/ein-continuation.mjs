#!/usr/bin/env node
/** SPDX-License-Identifier: MIT */
import { main } from "../src/cli.mjs";

const code = await main(process.argv.slice(2), {
  env: process.env,
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  fetch: globalThis.fetch,
});
process.exitCode = code;
