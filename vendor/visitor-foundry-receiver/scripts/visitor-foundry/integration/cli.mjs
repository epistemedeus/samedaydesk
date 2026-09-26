#!/usr/bin/env node
// Cold beneficiary: only ordinary endpoint/access and its own held-out request.
import { readFile, stat } from 'node:fs/promises';
import { jsonBounded } from '../validation/src/index.mjs';
const [configPath, requestPath] = process.argv.slice(2);
try {
  const read = async p => { const s = await stat(p); if (!s.isFile() || s.size > 16384) throw new Error('bounded regular file required'); return JSON.parse(await readFile(p, 'utf8')); };
  const config = await read(configPath), request = await read(requestPath);
  const url = new URL(config.baseUrl);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) throw new Error('HTTPS or loopback required');
  const secretStat = await stat(config.tokenFile);
  if (!secretStat.isFile() || secretStat.size > 4096 || (secretStat.mode & 0o077)) throw new Error('private token file required');
  const token = (await readFile(config.tokenFile, 'utf8')).trim();
  const call = async (path, body) => {
    const r = await fetch(`${config.baseUrl}/v1/projects/${encodeURIComponent(config.projectId)}/foundry/${path}`, { method: 'POST', redirect: 'error',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const reader = r.body.getReader(); const parts = []; let size = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 262144) { await reader.cancel(); throw new Error('response bound'); } parts.push(Buffer.from(chunk.value)); }
    const result = JSON.parse(Buffer.concat(parts).toString()); if (!r.ok) throw new Error(result.error?.code ?? `HTTP ${r.status}`); return result;
  };
  jsonBounded(request, 16384);
  const discovery = await call('resolve', request);
  const invocation = discovery.manifest ? await call('invoke', { manifestId: discovery.manifest.id, request }) : null;
  console.log(JSON.stringify({ purpose: 'owner_qa', cold: true, discovery, invocation }, null, 2));
} catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
