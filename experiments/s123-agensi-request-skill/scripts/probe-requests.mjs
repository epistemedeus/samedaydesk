#!/usr/bin/env node
/**
 * S123 one-command public probe: Agensi skill requests via mcp.agensi.io.
 * No auth. Cash 0. Does not submit, list, comment, or purchase.
 *
 * Usage (from this package root or any cwd):
 *   node experiments/s123-agensi-request-skill/scripts/probe-requests.mjs
 * Or:
 *   node ./scripts/probe-requests.mjs
 */
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP = 'https://mcp.agensi.io/mcp';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'evidence', 'probe-live');

async function mcpCall(name, args = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  let payload = text;
  if (text.startsWith('data:')) {
    payload = text.split('\n').find((l) => l.startsWith('data:')).slice(5).trim();
  }
  const doc = JSON.parse(payload);
  if (doc.error) throw new Error(JSON.stringify(doc.error));
  const content = doc?.result?.content?.[0]?.text ?? 'null';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = content;
  }
  return { httpStatus: res.status, parsed, rawText: content };
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

const open = await mcpCall('get_skill_requests', { status: 'open', limit: 50 });
const all = await mcpCall('get_skill_requests', { status: 'all', limit: 50 });
const fulfilled = await mcpCall('get_skill_requests', { status: 'fulfilled', limit: 50 });
const creator = await mcpCall('get_creator', { slug: 'sameday' });

mkdirSync(OUT, { recursive: true });
const receipt = {
  probed_at: new Date().toISOString(),
  endpoint: MCP,
  open_count: Array.isArray(open.parsed) ? open.parsed.length : null,
  all_count: Array.isArray(all.parsed) ? all.parsed.length : null,
  fulfilled_count: Array.isArray(fulfilled.parsed) ? fulfilled.parsed.length : null,
  open: open.parsed,
  all: all.parsed,
  fulfilled: fulfilled.parsed,
  creator_sameday: creator.parsed,
  digests: {
    open: sha256(open.rawText),
    all: sha256(all.rawText),
    fulfilled: sha256(fulfilled.rawText),
  },
};

writeFileSync(join(OUT, 'probe-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');

const openOk = Array.isArray(open.parsed) && open.parsed.length === 0;
const allIsFulfilledOnly =
  Array.isArray(all.parsed) &&
  all.parsed.every((r) => r && r.status === 'fulfilled');

console.log(JSON.stringify({
  ok: openOk,
  open_count: receipt.open_count,
  all_count: receipt.all_count,
  fulfilled_count: receipt.fulfilled_count,
  all_statuses: Array.isArray(all.parsed) ? [...new Set(all.parsed.map((r) => r.status))] : null,
  creator_skill_count: creator.parsed?.skill_count ?? null,
  receipt: join(OUT, 'probe-receipt.json'),
}, null, 2));

if (!openOk) {
  console.error('UNEXPECTED: open skill requests are non-empty; re-qualify before building.');
  process.exit(2);
}
if (!allIsFulfilledOnly && receipt.all_count > 0) {
  console.error('UNEXPECTED: non-fulfilled rows in status=all; inspect receipt.');
  process.exit(3);
}
process.exit(0);
