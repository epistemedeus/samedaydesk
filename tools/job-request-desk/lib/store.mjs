import { mkdirSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { REQUEST_ID_RE } from './pins.mjs';
import { readDocument, createDocument, putImmutable, digest, fault } from './durable.mjs';
export function assertInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel.startsWith('..') || isAbsolute(rel)) throw fault('store-path-escape');
  return resolve(candidate);
}
export function assertRequestId(id) {
  if (typeof id !== 'string' || !REQUEST_ID_RE.test(id)) throw fault('store-path-escape');
  return id;
}
export function createJsonStore(storeDir) {
  if (!storeDir) throw fault('missing-store');
  const root = resolve(storeDir);
  for (const sub of ['tickets', 'attempts', 'results', 'final', 'orders']) mkdirSync(join(root, sub), { recursive: true });
  const path = (sub, id) => join(root, sub, `${assertRequestId(id)}.json`);
  const unknownView = (admitted, attempt) => ({
    ...admitted, ...attempt, status: 'unknown', ok: false, code: 'execution-unknown', executionOk: false, retryAllowed: false,
    settlement: { ...(admitted?.settlement || {}), state: 'unknown', amountUsdc: null },
  });
  const store = {
    kind: 'immutable-file', root,
    ticketPath: id => path('tickets', id),
    resultDir: id => join(root, 'results', assertRequestId(id)),
    resultUri: id => `file://${store.resultDir(id)}`,
    admit(ticket) {
      const orderPath = join(root, 'orders', digest(ticket.orderId) + '.json');
      putImmutable(orderPath, { orderId: ticket.orderId, requestId: ticket.requestId });
      createDocument(path('tickets', ticket.requestId), ticket);
      const existing = readDocument(path('tickets', ticket.requestId));
      if (existing.requestId !== ticket.requestId || existing.bindingDigest !== ticket.bindingDigest) throw fault('corrupt-record');
      return existing;
    },
    claim(ticket) {
      const attempt = { requestId: ticket.requestId, executionId: `cw62-${ticket.requestId}`, holderPid: process.pid, startedAt: new Date().toISOString() };
      const created = createDocument(path('attempts', ticket.requestId), attempt);
      return { created, attempt: readDocument(path('attempts', ticket.requestId)) };
    },
    finish(ticket) { return putImmutable(path('final', ticket.requestId), ticket); },
    read(id) {
      const admitted = readDocument(path('tickets', id));
      const attempt = readDocument(path('attempts', id));
      const final = readDocument(path('final', id));
      if (!admitted) {
        if (attempt || final) throw fault('missing-admission');
        return null;
      }
      if (admitted.requestId !== id || !admitted.bindingDigest) throw fault('unbound-legacy-ticket');
      if (final) {
        if (final.requestId !== id || final.bindingDigest !== admitted.bindingDigest) throw fault('corrupt-record');
        if (final.executionId && attempt?.executionId && final.executionId !== attempt.executionId) throw fault('corrupt-record');
        return final;
      }
      if (!attempt) return admitted;
      // An attempt without a final result is unknown spend. No lease expiry retries it.
      return unknownView(admitted, attempt);
    },
    findByOrderId(orderId) {
      const ref = readDocument(join(root, 'orders', digest(orderId) + '.json'));
      if (!ref) return null;
      try {
        return store.read(ref.requestId) || { ...ref, status: 'queued' };
      } catch (err) {
        if (err.code === 'missing-admission' || err.code === 'corrupt-record') {
          return { requestId: ref.requestId, orderId: ref.orderId, code: err.code, status: 'unknown' };
        }
        throw err;
      }
    },
    list() { return readdirSync(join(root, 'tickets')).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(n => store.read(n.slice(0, -5))); },
  };
  return store;
}
