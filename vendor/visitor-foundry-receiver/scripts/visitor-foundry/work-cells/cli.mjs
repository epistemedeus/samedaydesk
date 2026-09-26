#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { WorkCellClient } from './client.mjs';

const [operation, configFile, argument, attemptFile] = process.argv.slice(2);
try {
  if (!['get', 'replay', 'begin', 'reconcile'].includes(operation) || !configFile) {
    throw new Error('usage: cli.mjs get|replay CONFIG CELL_ID; begin CONFIG COMMAND_FILE ATTEMPT_FILE; reconcile CONFIG ATTEMPT_FILE');
  }
  // Config contains baseUrl, projectId, tokenFile, optional cellId; no raw token.
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  const client = WorkCellClient.fromTokenFile(config);
  const result = operation === 'get' ? await client.get(argument)
    : operation === 'replay' ? await client.replay(argument)
    : operation === 'reconcile' ? await client.reconcile(argument)
    : await client.begin({ cellId: config.cellId ?? '', command: JSON.parse(readFileSync(argument, 'utf8')), attemptFile });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: { code: error.code ?? 'invalid_input', nextStep: error.nextStep ?? 'check CLI arguments and private config/token paths' } }));
  process.exitCode = 1;
}
