import { requireThat } from '../../agent-economy-foundation/dist/index.js';

/** Private bearer API adapter. authenticate receives the request, never JSON. */
export function marketHttpHandler(market) {
  const actions = new Set(['post','list','interest','readback','quote','select','assent','fund','claim','deliver','review','approve','reconcile','payoutDisposition','read','grantConsumer','retained','downstreamUse','serviceCost','repeatPurchase','measurement']);
  return async (req,res) => {
    try {
      const match = /^\/v1\/market\/([A-Za-z]+)$/.exec(req.url);
      requireThat(req.method === 'POST' && match && actions.has(match[1]),'not_found');
      // Cookie sessions are not admitted here. A browser controller needs its own
      // existing session/CSRF adapter, independently of this machine interface.
      requireThat(!req.headers.cookie && /^Bearer [^\s]+$/.test(req.headers.authorization??''),'unauthorized');
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; requireThat(size <= 131072,'request_too_large'); chunks.push(chunk); }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const action = match[1], idempotency = req.headers['idempotency-key'];
      // select is the only action that sets the assent select flag. The header is the operation slot.
      const result = action === 'select' ? await market.select(req,body,idempotency)
        : action === 'assent' ? await market.assent(req,body,idempotency,false)
        : await market[action](req,body,idempotency);
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({ok:true,result}));
    } catch (error) {
      const code = error.code ?? (error instanceof SyntaxError ? 'invalid_json' : 'internal_error');
      const status = code === 'unauthorized' ? 401 : code === 'forbidden' ? 403 : ['not_found','operation_absent'].includes(code) ? 404 : code === 'internal_error' ? 500 : 409;
      res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify({ok:false,error:{code}}));
    }
  };
}
