// TEST ONLY private HTTP embedding. Uses the real maintained asset and VF01.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { preflightHost, tasks } from '../../examples/hosts.mjs';
const asset = preflightHost();
const discovery = readFileSync(new URL('../../../../../dist/api/lab/capabilities.json', import.meta.url));
const server = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method === 'GET' && req.url === '/api/lab/capabilities.json') { res.end(discovery); return; }
  if (req.method !== 'POST' || req.url !== '/preflight') { res.writeHead(404); res.end('{}'); return; }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 4096) throw Error('bounded'); chunks.push(chunk); }
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const task = input.taskCase === 'later' ? tasks.preflight.later : tasks.preflight.original;
    const result = asset.invoke(task, input.negotiation ?? {});
    res.writeHead(result.response.status, result.response.headers);
    res.end(JSON.stringify(result.participation ? { original: result.response.body, participation: result.participation } : result.response.body));
  } catch { res.writeHead(400); res.end('{"error":"invalid_input"}'); }
});
server.listen(0, '127.0.0.1', () => process.send?.({ baseUrl: `http://127.0.0.1:${server.address().port}` }));
const timer = setTimeout(stop, 60000);
function stop() { clearTimeout(timer); server.closeAllConnections(); server.close(() => process.exit(0)); }
process.on('SIGTERM', stop); process.on('disconnect', stop);
