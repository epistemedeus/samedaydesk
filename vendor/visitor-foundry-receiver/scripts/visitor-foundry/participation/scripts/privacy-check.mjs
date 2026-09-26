// Reproducible sentinel check. Generated sentinel values are deliberately never printed.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildReproducer, semanticIdentity, jsonBoundary, ENVELOPE, ParticipationSession } from '../src/index.mjs';
import { preflightTemplate, disclosure } from '../examples/hosts.mjs';
import { vf02Port } from '../src/vf02-port.mjs';
const moduleRoot = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(join(moduleRoot, '.local'), { recursive: true });
const dir = mkdtempSync(join(moduleRoot, '.local/privacy-'));
const sentinel = `private-${randomBytes(24).toString('hex')}`;
const outputs = [], logs = [], urls = [];
let getters = 0;
try {
  const privateInput = { range: '~22.1', nodeVersion: '22.22.2', password: sentinel, error: { nested: { token: sentinel } } };
  Object.defineProperty(privateInput, 'unlisted', { get() { getters++; throw Error(sentinel); } });
  outputs.push(buildReproducer({ template: preflightTemplate, input: privateInput }));
  outputs.push(buildReproducer({ template: preflightTemplate, input: privateInput, sharing: { scope: 'reproducer', provenance: 'synthetic', authorizationRef: 'test:privacy' } }));
  outputs.push(semanticIdentity({ tenantId: 'tenant:privacy', identityKey: 'test-identity-key-'.repeat(4), proposal: outputs[0] }));
  const original = new Error(sentinel, { cause: { history: { secret: sentinel } } });
  const sidecar = jsonBoundary(original, { accepts: [ENVELOPE] }, { disclosure, condition: 'temporary-outage' });
  assert.equal(sidecar.original, original); outputs.push(sidecar.participation);
  const inputPath = join(dir, 'input.json'), configPath = join(dir, 'config.json');
  writeFileSync(inputPath, JSON.stringify(privateInput), { mode: 0o600 });
  for (const scope of ['metadata', 'reproducer']) {
    const config = { template: preflightTemplate, sharing: scope === 'metadata' ? { scope } : { scope, provenance: 'synthetic', authorizationRef: 'test:privacy' }, inputFile: scope === 'metadata' ? join(dir, sentinel) : inputPath };
    writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
    const result = spawnSync(process.execPath, [join(moduleRoot, 'cli.mjs'), 'reproducer', configPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, 'cold reproducer should succeed'); logs.push(result.stdout, result.stderr);
  }
  const terms = `sha256:${'a'.repeat(64)}`, ref = { uri: 'https://fixtures.invalid/pinned', digest: terms };
  const body = { schema: 'neomorphic.foundry.work-cell-command.v1', action: 'create', expectedRevision: 0, gap: { schema: 'neomorphic.foundry.gap.v1', id: 'gap:privacy', revision: terms, resolverSnapshot: ref, reproducer: ref, permission: 'synthetic', fundingKind: 'voluntary' }, workScope: 'scope:privacy' };
  const port = vf02Port({ baseUrl: 'http://127.0.0.1:9876', projectId: 'privacy', token: sentinel, fetch: async (url, opts) => {
    urls.push(url); assert.equal(opts.headers.authorization, `Bearer ${sentinel}`);
    throw new Error(sentinel, { cause: { request: { url: `https://invalid/?token=${sentinel}` } } });
  } });
  const session = new ParticipationSession({ identityKey: 'test-identity-key-'.repeat(4), binding: { origin: 'http://127.0.0.1:9876', tenantId: 'privacy', grantFingerprint: terms }, port, currentTerms: async () => terms });
  const intent = session.prepare({ mode: 'report-gap', operation: 'create', body, consent: true, termsVersion: terms });
  outputs.push(intent, await session.execute(intent));
  assert.equal(getters, 0);
  assert.ok(!JSON.stringify({ outputs, logs, urls }).includes(sentinel), 'private sentinel leaked');
  console.log(JSON.stringify({ schema: 'neomorphic.foundry.participation-privacy-check.v1', passed: true, scenarios: ['metadata-before-input', 'allowlisted-reproducer', 'nested-original-error-kept-local', 'cold-cli-metadata-no-file-read', 'cold-cli-authorized-projection', 'transport-error', 'request-url', 'opaque-idempotency'], inspectedOutputRecords: outputs.length, inspectedCliStreams: logs.length, requestUrls: urls.length, unlistedGettersInvoked: getters }));
} finally { rmSync(dir, { recursive: true, force: true }); }
