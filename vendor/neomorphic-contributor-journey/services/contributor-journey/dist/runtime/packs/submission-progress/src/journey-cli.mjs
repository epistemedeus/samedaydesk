#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { contributorJourney } from './journey.mjs';

const usage = 'contributor-progress observe|resume --base-url URL --intent FILE [--token-file FILE] [--owner-read-token-file FILE]';
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help') { console.log(usage); process.exit(0); }
  const opts = {};
  for (let i=0; i<args.length; i+=2) {
    if (!['--base-url','--intent','--token-file','--owner-read-token-file'].includes(args[i]) || !args[i+1] || opts[args[i]]) throw new Error(usage);
    opts[args[i]] = args[i+1];
  }
  if (!['observe','resume'].includes(command) || !opts['--base-url'] || !opts['--intent']) throw new Error(usage);
  const token = async path => path ? (await readFile(path,'utf8')).trim() : undefined;
  const intent = JSON.parse(await readFile(opts['--intent'],'utf8'));
  const report = await contributorJourney({command, intent, baseUrl:opts['--base-url'], contributorToken:await token(opts['--token-file']), ownerToken:await token(opts['--owner-read-token-file'])});
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode=2;
} catch (error) {
  console.log(JSON.stringify({ok:false, code:error.code ?? 'invalid_input', status:error.status ?? 0, nextAction:'do_not_start_work', paid:false, settled:false, transfer:null}));
  process.exitCode=2;
}
