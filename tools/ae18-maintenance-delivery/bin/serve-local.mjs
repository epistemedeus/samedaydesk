#!/usr/bin/env node
import { readJson } from '../src/inputs.mjs';
import { prepareRuntime } from '../src/runtime.mjs';
const runtime = await prepareRuntime(readJson(process.argv[2]));
const { createServer } = await import('node:http');
// Disposable acceptance listener only. Production uses mountMaintenance in the
// existing SameDayDesk Node process and the existing ingress/supervisor.
const server = createServer((req, res) => {
  if (!req.url.startsWith('/api/machine-gateway/')) { res.writeHead(404); res.end(); return; }
  req.url = req.url.slice('/api/machine-gateway'.length);
  runtime.handler(req, res);
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => { runtime.close(); process.exit(0); }));
