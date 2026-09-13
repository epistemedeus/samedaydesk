#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runPaidOffer } from '../../../server/paid-useful-jobs/lib/wrapper.mjs';
const request = JSON.parse(readFileSync(0, 'utf8'));
const origin = process.argv[2];
let result;
if (origin) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Only loopback execution servers are supported');
  const response = await fetch(new URL('/execute', url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(110_000) });
  result = await response.json();
} else result = await runPaidOffer(request);
process.stdout.write(JSON.stringify(result) + '\n');
