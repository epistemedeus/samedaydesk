#!/usr/bin/env node
import { readJson } from '../src/inputs.mjs';
import { executeSaved, readback } from '../src/client.mjs';
const [command, file] = process.argv.slice(2);
try {
  const config = readJson(file);
  const output = command === 'readback' ? await readback(config) : command === 'execute' ? await executeSaved(config) : null;
  if (!output) throw new Error('use_execute_or_readback');
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
