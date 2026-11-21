// Root-owned postrelease readback. Never run by this source-only worker.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const [origin, output] = process.argv.slice(2);
assert.equal(origin, 'https://samedaydesk.com');
assert.ok(output, 'supply a new receiving directory');
mkdirSync(output, { recursive: false });
const expected = JSON.parse(readFileSync(new URL('./after/descriptor.body', import.meta.url)));
const routes = { descriptor: '/discovery/paid-gateway.json', llms: '/llms.txt', skill: '/skill.md', openapi: '/openapi.json', catalog: '/.well-known/api-catalog', card: '/.well-known/agent-card.json' };
const bodies = {};
for (const [name,path] of Object.entries(routes)) {
  const response = await fetch(origin + path, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(join(output, name + '.body'), bytes);
  writeFileSync(join(output, name + '.headers.json'), JSON.stringify({ path, status: response.status, contentType: response.headers.get('content-type'), date: response.headers.get('date') }, null, 2) + '\n');
  assert.equal(response.status, 200, path);
  assert.ok(!response.headers.get('content-type')?.includes('text/html'), path);
  bodies[name] = bytes;
}
assert.deepEqual(JSON.parse(bodies.descriptor), expected);
for (const name of ['openapi','card']) {
  const gateway = JSON.parse(bodies[name])['x-paid-gateway'];
  for (const [key,value] of Object.entries(expected)) assert.deepEqual(gateway[key], value, `${name}.${key}`);
}
for (const name of ['llms','skill']) {
  assert.ok(bodies[name].toString().includes(expected.summary), name);
  assert.ok(bodies[name].toString().includes(expected.nextAction), name);
}
assert.deepEqual(bodies.llms, readFileSync(new URL('./after/llms.body', import.meta.url)));
assert.ok(bodies.catalog.toString().includes('Paid gateway MCP (available)'));
console.log(JSON.stringify({ machineStateReceived: true, output: resolve(output), sourceOrBuildIdentityReceived: false, hostedHumanPreservationReceived: false, customerOrRevenueEvidence: false }));
