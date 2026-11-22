import { createServer } from 'node:http';
import express from 'express';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { createSdsApp } = await import(pathToFileURL(resolve('server/app.js')).href);
const { createCareService } = await import(pathToFileURL(resolve('server/lib/care-service.js')).href);

if (process.env.SDS_PRIVATE_PREVIEW !== '1' || process.env.NODE_ENV !== 'production') throw Error('Private production preview only.');
for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SDS_CARE_DATABASE_URL', 'DATABASE_URL']) if (process.env[name]) throw Error('Host/provider secrets are not accepted by this preview.');
const app = express();
if (process.env.SDS_V2_PREVIEW_BANK_FIXTURE === '1') {
  const methods = createCareService({ store: { quotes: {} }, stripe: {}, secret: 'private-visual-fixture-only', origin: 'https://samedaydesk.com', live: false, noncard: true, stablecoin: false }).methods;
  app.post('/api/care/methods', express.json({ limit: '1kb' }), (req, res) => res.json({ methods: methods(req.body?.offer) }));
}
app.use(createSdsApp());
const server = createServer(app);
server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => console.log(JSON.stringify({ source: process.env.GITHUB_SHA, port: server.address().port, bankReadOnlyMethodsFixture: process.env.SDS_V2_PREVIEW_BANK_FIXTURE === '1' })));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
