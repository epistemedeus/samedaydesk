#!/usr/bin/env node
import { runCli } from "../src/cli.mjs";

const code = await runCli(process.argv.slice(2), { env: process.env });
process.exit(code);
