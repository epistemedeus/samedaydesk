#!/usr/bin/env node
import { runCli } from "./lib.mjs";

const argv = process.argv.slice(2);
try {
  const code = await runCli(argv);
  process.exit(code);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}
