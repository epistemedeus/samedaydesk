#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

export const SITE = Object.freeze({
  origin: 'https://samedaydesk.com',
  host: 'samedaydesk.com',
  key: '603435dfca216cef3eb7a0f5548d3475',
  endpoint: 'https://api.indexnow.org/indexnow',
});

const EVENT_FLAGS = new Map([
  ['--added', 'added'],
  ['--updated', 'updated'],
  ['--deleted', 'deleted'],
]);

export function parseChanges(argv) {
  const events = { added: [], updated: [], deleted: [] };
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    const event = EVENT_FLAGS.get(token);
    if (!event) throw new Error(`unknown argument: ${token}`);

    const rawUrl = argv[index + 1];
    if (!rawUrl || rawUrl.startsWith('--')) {
      throw new Error(`${token} requires one URL`);
    }
    index += 1;

    const url = new URL(rawUrl);
    if (url.origin !== SITE.origin || url.username || url.password || url.hash) {
      throw new Error(`URL must use the exact ${SITE.origin} origin without credentials or a fragment: ${rawUrl}`);
    }
    events[event].push(url.href);
  }

  const urls = Object.values(events).flat();
  if (urls.length === 0) throw new Error('at least one --added, --updated, or --deleted URL is required');
  if (urls.length > 10_000) throw new Error('IndexNow accepts at most 10,000 URLs per request');
  if (new Set(urls).size !== urls.length) throw new Error('the same URL cannot be submitted more than once per event');

  return { dryRun, events, urls };
}

export function buildPayload(urls) {
  return {
    host: SITE.host,
    key: SITE.key,
    keyLocation: `${SITE.origin}/${SITE.key}.txt`,
    urlList: urls,
  };
}

export async function submitChanges(changes, fetchImpl = fetch) {
  const payload = buildPayload(changes.urls);
  if (changes.dryRun) return { status: 'dry-run', payload };

  const keyResponse = await fetchImpl(payload.keyLocation, { redirect: 'error' });
  const keyBody = (await keyResponse.text()).trim();
  if (!keyResponse.ok || keyBody !== SITE.key) {
    throw new Error(`IndexNow key file is not live and exact (HTTP ${keyResponse.status})`);
  }

  const response = await fetchImpl(SITE.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow rejected the event (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  return { status: response.status, payload };
}

async function main() {
  const changes = parseChanges(process.argv.slice(2));
  const result = await submitChanges(changes);
  console.log(JSON.stringify({
    status: result.status,
    counts: Object.fromEntries(Object.entries(changes.events).map(([event, urls]) => [event, urls.length])),
    urlList: result.payload.urlList,
  }, null, 2));
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
