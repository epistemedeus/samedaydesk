// Performance-only HTTP adapter. Reuse the production static mount, including
// anonymous prerenders, query-selected shells, compression and history status.
// Never import the API app or enrol database/provider configuration here.
import { createServer } from 'node:http';
import { isAbsolute } from 'node:path';
import express from 'express';
import { mountProductionClient } from '../../server/lib/spa-client.js';
export function serve(root) {
  if (!isAbsolute(root)) throw Error('absolute production build required');
  if (process.env.SDS_RECEIPTS_SNAPSHOT_PATH) throw Error('host snapshot binding forbidden in performance preview');
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res) => res.status(404).set('Cache-Control', 'no-store').end());
  mountProductionClient(app, root);
  return createServer(app);
}
