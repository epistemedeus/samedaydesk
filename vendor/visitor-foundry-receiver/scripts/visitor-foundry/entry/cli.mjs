import { readFileSync } from 'node:fs';
import { entryRequest, prepare, continueEntry, writeCheckpoint, resume } from './src/client.mjs';
const [command, ...args] = process.argv.slice(2);
try {
  let output;
  if (command === 'describe') output = await entryRequest(args[0], '');
  else if (command === 'prepare' && args.length === 4) output = prepare(args[1], args[0], args[2], args[3]);
  else if (['register', 'reconcile', 'renew'].includes(command) && args.length === 1) output = await continueEntry(args[0], command);
  else if (command === 'checkpoint' && args.length === 2) output = await writeCheckpoint(args[0], readFileSync(args[1], 'utf8').trim());
  else if (command === 'resume' && args.length === 1) output = await resume(args[0]);
  else throw new Error('usage');
  console.log(JSON.stringify(output));
} catch (e) {
  const code = /^[a-z_]{1,80}$/.test(e.code) ? e.code : 'local_or_unknown_failure';
  console.error(JSON.stringify({ error: { code, nextAction: 'restore_local_state_then_reconcile_same_attempt' } }));
  process.exitCode = 1;
}
