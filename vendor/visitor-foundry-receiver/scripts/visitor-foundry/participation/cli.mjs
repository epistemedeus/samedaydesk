#!/usr/bin/env node
import { readSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertCorrespondenceOrigin } from '../../correspondence/client.mjs';
import { readBoundedJson } from '../../correspondence/response.mjs';
import { bounded, exact, id, ParticipationError, requireValue } from './src/safe.mjs';
import { buildReproducer, continuationHint, ParticipationSession } from './src/index.mjs';
import { tokenFingerprint } from '../../../packs/contributor-session-grant/src/hash.mjs';
import { readTokenFileOnce, writeJsonSecretFree } from '../../../packs/contributor-session-grant/src/fs-grant.mjs';

export function readJson(path, clone = true) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd); requireValue(st.isFile() && st.size <= 32768, 'payload_too_large');
    const bytes = Buffer.alloc(32769); let size = 0;
    while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    requireValue(size <= 32768, 'payload_too_large');
    const parsed = JSON.parse(bytes.subarray(0, size).toString('utf8'));
    return clone ? bounded(parsed, { maxBytes: 128 * 1024 }) : parsed;
  }
  finally { closeSync(fd); }
}
async function main(args) {
  const [op, ...rest] = args;
  if (op === 'help' || !op) return { usage: ['discovery [HOST_BASE_URL]', 'reproducer INPUT.json', 'prepare CONFIG.json COMMAND.json INTENT.json --consent', 'execute CONFIG.json INTENT.json', 'reconcile CONFIG.json INTENT.json', 'resume CONFIG.json CELL_ID'],
    notes: 'Preparation records explicit consent before dispatch. Config/credentials are host-owned; hints are not grants. No commands or artifact URLs are executed.' };
  if (op === 'discovery') {
    requireValue(rest.length <= 1);
    if (!rest.length) return { schema: 'neomorphic.foundry.participation-discovery.v1', discovery: '/api/lab/capabilities.json', contributionRequired: false, mode: 'ordinary-discovery-only' };
    const base = assertCorrespondenceOrigin(rest[0]);
    const signal = AbortSignal.timeout(10000);
    const response = await fetch(`${base}/api/lab/capabilities.json`, { signal, redirect: 'error' });
    requireValue(response.status === 200, 'discovery_unavailable');
    // Explicit caller-selected discovery only; never follow a supplied artifact URL.
    return bounded(await readBoundedJson(response, 128 * 1024, signal), { maxBytes: 768 * 1024, maxNodes: 8192, maxDepth: 16 });
  }
  if (op === 'reproducer') {
    requireValue(rest.length === 1); const config = readJson(rest[0]);
    requireValue(Object.keys(config).every(k => ['template', 'sharing', 'inputFile'].includes(k)));
    const sharing = config.sharing ?? { scope: 'metadata' };
    if (sharing.scope === 'metadata') return buildReproducer({ template: config.template, sharing });
    requireValue(sharing.scope === 'reproducer' && ['synthetic', 'authorized'].includes(sharing.provenance) && typeof sharing.authorizationRef === 'string', 'explicit_permission_required');
    exact(sharing, ['scope', 'provenance', 'authorizationRef']); id(sharing.authorizationRef);
    return buildReproducer({ template: config.template, sharing, input: readJson(config.inputFile, false) });
  }
  requireValue(['prepare', 'execute', 'reconcile', 'resume'].includes(op));
  requireValue(op === 'prepare' ? rest.length === 4 && rest[3] === '--consent' : rest.length === 2);
  const config = readJson(rest[0]);
  const token = readTokenFileOnce(config.tokenFile);
  const identityKey = readTokenFileOnce(config.identityKeyFile);
  const { vf02Port } = await import('./src/vf02-port.mjs');
  const port = vf02Port({ baseUrl: config.baseUrl, projectId: config.projectId, token });
  const session = new ParticipationSession({ identityKey, binding: { origin: config.baseUrl, tenantId: config.projectId, grantFingerprint: tokenFingerprint(token) }, port,
    currentTerms: async ({ cellId }) => cellId ? (await port.read({ cellId })).cell.gap.contentId : config.termsVersion });
  if (op === 'prepare') {
    const intent = session.prepare({ ...readJson(rest[1]), consent: true });
    writeJsonSecretFree(rest[2], intent, [token, identityKey], 0o600, 'wx');
    return { status: 'prepared', requestId: intent.requestId };
  }
  const result = op === 'resume' ? await session.resume(continuationHint(rest[1])) : await session[op](readJson(rest[1]));
  // CLI public output excludes private cell prose, refs and server diagnostics.
  const cell = result.receipt?.receipt?.cell ?? result.current?.cell;
  return { status: result.status, ...(result.requestId ? { requestId: result.requestId } : {}), ...(cell ? { cellId: cell.id, revision: cell.revision, cellStatus: cell.status, hint: continuationHint(cell.id) } : {}),
    ...(result.receipt ? { replayed: result.receipt.replayed } : {}) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(await main(process.argv.slice(2))) + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ error: error instanceof ParticipationError ? error.code : 'invalid_or_unavailable' }) + '\n'); process.exitCode = 2; }
}
