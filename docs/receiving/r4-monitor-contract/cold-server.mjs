// Test-only cold receiver for a job-local candidate closure. No installed pin
// is edited. The parent supplies only its disposable PG environment.
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const { root, env } = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { createSdsApp } = await import(pathToFileURL(path.join(root, 'server/app.js')));
const app = createSdsApp({ machineServices: { env },
  hostedWalletMarket: { env: {} }, neomorphicContributorJourney: { env: {} }, neomorphicOpportunity: { env: {} },
  correspondence: { env: {} }, managedWatch: { env: {} }, hostedUsefulJourney: { env: {} } });
const server = http.createServer(app);
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
async function close() {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await app.get('machineServices').close();
  process.disconnect();
}
process.once('message', message => { if (message === 'close') close().catch(() => { process.exitCode = 1; process.disconnect(); }); });
