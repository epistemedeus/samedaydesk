#!/usr/bin/env node
import { materializeCases } from "../lib/materialize.mjs";

const dirs = materializeCases();
process.stdout.write(`materialized ${dirs.length} cases\n`);
for (const dir of dirs) process.stdout.write(`${dir}\n`);
