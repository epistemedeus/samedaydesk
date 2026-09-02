import assert from 'node:assert/strict';
import test from 'node:test';

import { SITE, buildPayload, parseChanges, submitChanges } from './indexnow-submit.mjs';

test('submits only explicitly classified changed URLs', () => {
  const changes = parseChanges([
    '--added', 'https://samedaydesk.com/new',
    '--updated', 'https://samedaydesk.com/x402',
    '--deleted', 'https://samedaydesk.com/retired',
  ]);
  assert.deepEqual(changes.urls, [
    'https://samedaydesk.com/new',
    'https://samedaydesk.com/x402',
    'https://samedaydesk.com/retired',
  ]);
  assert.deepEqual(buildPayload(changes.urls).urlList, changes.urls);
});

test('refuses empty, duplicate, insecure, foreign, and fragment URLs', () => {
  assert.throws(() => parseChanges([]), /at least one/);
  assert.throws(() => parseChanges(['--updated', 'https://samedaydesk.com/a', '--updated', 'https://samedaydesk.com/a']), /same URL/);
  assert.throws(() => parseChanges(['--added', 'http://samedaydesk.com/a']), /HTTPS/);
  assert.throws(() => parseChanges(['--added', 'https://example.com/a']), /samedaydesk.com/);
  assert.throws(() => parseChanges(['--deleted', 'https://samedaydesk.com/a#old']), /fragment/);
});

test('verifies the key file before posting the exact event payload', async () => {
  const calls = [];
  const changes = parseChanges(['--updated', 'https://samedaydesk.com/x402']);
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) return new Response(`${SITE.key}\n`, { status: 200 });
    return new Response('', { status: 202 });
  };

  const result = await submitChanges(changes, fetchImpl);
  assert.equal(result.status, 202);
  assert.equal(calls[0].url, `${SITE.origin}/${SITE.key}.txt`);
  assert.deepEqual(JSON.parse(calls[1].options.body), buildPayload(changes.urls));
});

test('does not post when key verification fails', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('wrong-key', { status: 200 });
  };
  await assert.rejects(
    submitChanges(parseChanges(['--added', 'https://samedaydesk.com/new']), fetchImpl),
    /not live and exact/,
  );
  assert.equal(calls, 1);
});
