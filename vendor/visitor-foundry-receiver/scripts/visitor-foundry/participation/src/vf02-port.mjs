import { assertCorrespondenceOrigin } from '../../../correspondence/client.mjs';
import { readBoundedJson } from '../../../correspondence/response.mjs';
import { commandSchema } from '../../../../services/correspondence/dist/visitor-work-cells/index.js';
import { bounded, ParticipationError, requireValue } from './safe.mjs';
const codes = { unauthorized: 'stale-grant', forbidden: 'forbidden', not_found: 'not-found', revision_conflict: 'stale-revision', stale_fence: 'stale-fence', payload_too_large: 'payload-too-large', invalid_input: 'invalid-input', idempotency_conflict: 'conflict', lease_held: 'conflict', busy: 'temporary-outage', unavailable: 'temporary-outage' };
/** Uses actual VF02 commands. The host/VF04 owns gap mapping and artifact storage. */
export function vf02Port({ baseUrl, projectId, token, fetch: transport = globalThis.fetch, timeoutMs = 10000 }) {
  const base = assertCorrespondenceOrigin(baseUrl);
  requireValue(/^[A-Za-z0-9_-]{1,160}$/.test(projectId) && typeof token === 'string' && token.length > 0);
  requireValue(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000);
  const prefix = `/v1/projects/${projectId}/work-cells`;
  function cellPath(cellId) { requireValue(/^wcl_[a-f0-9]{64}$/.test(cellId)); return `${prefix}/${cellId}`; }
  function validate(operation, body) {
    requireValue(['create', 'claim', 'checkpoint', 'submit'].includes(operation) && body.action === operation && commandSchema.safeParse(body).success);
    requireValue(Buffer.byteLength(JSON.stringify(body)) <= 24576, 'payload-too-large');
  }
  async function request(path, command, requestId) {
    const controller = new AbortController(); let timer;
    const fail = () => new ParticipationError(command ? 'unknown-outcome' : 'temporary-outage');
    try {
      return await Promise.race([
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(fail()); }, timeoutMs); }),
        (async () => {
          let response, payload;
          try {
            response = await transport(base + path, { method: command ? 'POST' : 'GET', redirect: 'manual', signal: controller.signal,
              headers: { authorization: `Bearer ${token}`, ...(command ? { 'content-type': 'application/json', 'idempotency-key': requestId } : {}) },
              ...(command ? { body: JSON.stringify(command) } : {}) });
            requireValue(!response.redirected && (response.url === '' || response.url === base + path) && !(response.status >= 300 && response.status < 400));
            payload = bounded(await readBoundedJson(response, 128 * 1024, controller.signal), { maxBytes: 768 * 1024, maxNodes: 8192, maxDepth: 16 });
          } catch { throw fail(); }
          if (![200, 201].includes(response.status)) {
            const code = codes[payload?.error?.code];
            if (response.status === 429) throw new ParticipationError('quota-pressure');
            throw new ParticipationError(code ?? (response.status === 401 ? 'auth-failure' : response.status === 403 ? 'forbidden' : command ? 'unknown-outcome' : 'temporary-outage'));
          }
          const cell = command ? payload.receipt?.cell : payload.cell;
          requireValue(cell?.schema === 'neomorphic.foundry.work-cell.v1' && cell.projectId === projectId && /^wcl_[a-f0-9]{64}$/.test(cell.id)
            && Number.isInteger(cell.revision) && cell.revision > 0, command ? 'unknown-outcome' : 'temporary-outage');
          if (command) requireValue(payload.receipt?.schema === 'neomorphic.foundry.work-cell-receipt.v1' && payload.receipt.action === command.action
            && payload.receipt.revision === cell.revision && cell.revision === command.expectedRevision + 1
            && typeof payload.replayed === 'boolean', 'unknown-outcome');
          if (path !== prefix) requireValue(path.startsWith(`${cellPath(cell.id)}`), command ? 'unknown-outcome' : 'temporary-outage');
          // Prose/test proposals/URLs stay in host-private readback data, never diagnostics.
          return payload;
        })(),
      ]);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  const port = { validate, read: ({ cellId }) => request(cellPath(cellId)) };
  for (const op of ['create', 'claim', 'checkpoint', 'submit']) port[op] = ({ cellId, requestId, body }) => {
    validate(op, body); requireValue(/^vf05_[a-f0-9]{64}$/.test(requestId));
    return request(op === 'create' ? prefix : `${cellPath(cellId)}/commands`, body, requestId);
  };
  return Object.freeze(port);
}
