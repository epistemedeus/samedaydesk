import { createServer } from 'node:http';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACK_SCHEMA } from './pins.mjs';
import { atomicWriteJson } from './atomic-write.mjs';
import { callbackDestination } from './loopback.mjs';
import { assertCallbackIdentity } from './callback-identity.mjs';
import { hashBody, stableStringify } from './hash-terms.mjs';
import { outputRefs } from './receipt-shape.mjs';
import { importJobArtifacts } from '../../job-artifact-export/lib/import.mjs';
import { assertUnlinkedPath } from '../../job-artifact-export/lib/publication.mjs';

function namedOutputsEqual(receipt, payloadOutputs) {
  const fromReceipt = outputRefs(receipt || { outputs: [] });
  const fromPayload = outputRefs({ outputs: Array.isArray(payloadOutputs) ? payloadOutputs : [] });
  if (fromReceipt.length !== fromPayload.length) return false;
  const byName = new Map(fromPayload.map((row) => [row.name, row]));
  for (const row of fromReceipt) {
    const other = byName.get(row.name);
    if (!other) return false;
    if (other.kind !== row.kind || other.bytes !== row.bytes || other.sha256 !== row.sha256) return false;
    const leftPath = row.kind === 'directory' ? row.path : undefined;
    const rightPath = other.kind === 'directory' ? other.path : undefined;
    if (leftPath !== rightPath) return false;
  }
  return stableStringify(fromReceipt) === stableStringify(fromPayload);
}

export function startLoopbackReceiver({ host = '127.0.0.1', port = 0, mode = 'ack', delayMs = 0,
  storeDir = null, path = '/callback', bundleDir = null } = {}) {
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('Receiver must bind a literal loopback address');
  if (storeDir) { assertUnlinkedPath(storeDir); mkdirSync(storeDir, { recursive: true }); }
  const pathname = path.startsWith('/') ? path : `/${path}`;
  let destination;
  const timers = new Set();
  const server = createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (req.method !== 'POST') { reply(405, { ok: false }); req.resume(); return; }
    if (req.url !== pathname) { reply(404, { ok: false, code: 'destination-path-mismatch' }); req.resume(); return; }
    const chunks = []; let length = 0;
    req.on('data', chunk => { length += chunk.length; if (length > 1024 * 1024) req.destroy(); else chunks.push(chunk); });
    req.on('error', () => {});
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks));
        assertCallbackIdentity(payload, destination);
        if (!storeDir) throw new Error('Durable --store-dir is required before acknowledgment');
        if (req.headers['x-outbox-event-id'] !== payload.eventId) throw new Error('Event header mismatch');
        const key = hashBody(payload.eventId);
        const recordPath = join(storeDir, `${key}.json`);
        assertUnlinkedPath(recordPath);
        const bodyHash = hashBody(payload);
        let record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
        if (record && record.bodyHash !== bodyHash) { reply(409, { ok: false, code: 'event-id-body-conflict' }); return; }
        let artifactOut = null;
        if (payload.artifact) {
          if (!bundleDir) throw new Error('Receiver requires its own --bundle-dir for artifact verification');
          const zip = join(bundleDir, 'job-artifacts.zip');
          const bundle = importJobArtifacts({ zip, zipSha256: payload.artifact.zipSha256, inspectOnly: true });
          if (!bundle.binding || bundle.manifest.termsVersion !== payload.artifact.termsVersion ||
              bundle.binding.execution.receiptSha256 !== payload.artifact.receiptSha256 ||
              bundle.binding.receipt.outputsDigest !== payload.outputsDigest ||
              !namedOutputsEqual(bundle.binding.receipt, payload.outputs) ||
              bundle.binding.receipt.jobId !== payload.jobId ||
              bundle.binding.receipt.sample !== payload.sample ||
              `${bundle.binding.receipt.engine.archiveSha256}:${bundle.binding.receipt.engine.archiveBytes}` !== payload.engineArchiveIdentity) {
            throw new Error('Receiver bundle does not match callback identity');
          }
          artifactOut = join(storeDir, `artifacts-${key}`);
          if (!record) {
            if (existsSync(artifactOut)) {
              // A process may have published the complete generation before losing its acknowledgment record.
              for (const entry of bundle.entries) {
                const target = join(artifactOut, entry.name);
                assertUnlinkedPath(target);
                if (!readFileSync(target).equals(entry.data)) throw new Error('Existing receiver generation conflicts');
              }
            } else importJobArtifacts({ zip, zipSha256: payload.artifact.zipSha256, out: artifactOut });
          }
        }
        if (!record) {
          record = { receivedAt: new Date().toISOString(), eventId: payload.eventId, bodyHash,
            callbackPath: req.url, payload, artifactOut, committed: true };
          atomicWriteJson(recordPath, record);
        }
        if (mode === 'close-after-store') { req.socket.destroy(); return; }
        const send = () => {
          if (mode === 'empty-body') { reply(200, ''); return; }
          const ack = { schema: ACK_SCHEMA, ack: true, eventId: payload.eventId,
            callbackPath: mode === 'ack-wrong-path' ? '/not-the-callback' : req.url,
            outputsDigest: mode === 'ack-wrong-digest' ? 'f'.repeat(64) : payload.outputsDigest,
            termsHash: mode === 'ack-wrong-terms' ? '0'.repeat(64) : payload.termsHash,
            zipSha256: payload.artifact?.zipSha256 || null,
            exportTermsVersion: payload.artifact?.termsVersion || null,
            buyerAccepted: false, sale: false, receivedAt: record.receivedAt };
          if (mode === 'ack-event-only') { delete ack.callbackPath; delete ack.outputsDigest; }
          reply(200, ack);
        };
        if (delayMs > 0) {
          const timer = setTimeout(() => { timers.delete(timer); send(); }, delayMs); timers.add(timer);
        } else send();
      } catch (error) { reply(422, { ok: false, code: error.code || 'receiver-refused', error: error.message }); }
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const url = `http://${host.includes(':') ? `[${host}]` : host}:${address.port}${pathname}`;
      destination = callbackDestination(url);
      resolve({ url, port: address.port, path: pathname, server,
        async close() {
          for (const timer of timers) clearTimeout(timer);
          server.closeAllConnections();
          await new Promise(done => server.close(done));
        } });
    });
  });
}
