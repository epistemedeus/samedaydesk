#!/usr/bin/env node
import { runCli } from "../lib/cli.mjs";

const result = runCli(process.argv.slice(2));
process.exit(result.exitCode);
