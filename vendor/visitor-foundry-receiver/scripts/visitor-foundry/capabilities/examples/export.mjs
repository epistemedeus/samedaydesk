import { mkdirSync, writeFileSync } from 'node:fs';
import { packageFixture, request, demo, NOW } from './fixtures.mjs';
import { verificationTarget, refOf, resolvePage } from '../src/index.mjs';
const destination = new URL('../evidence/wire/', import.meta.url);
mkdirSync(destination, { recursive: true });
const fixture = packageFixture();
const req = request({ outcome: 'node-engine-compatibility', input: { range: '>=22.2', nodeVersion: '22.3.0' }, capabilityId: fixture.capability.capabilityId });
const vectors = { snapshot: fixture.snapshot, request: req, policy: fixture.policy, gap: demo().gap,
  'verification-target': verificationTarget(fixture.snapshot, refOf(fixture.capability)),
  resolution: resolvePage(fixture.snapshot, req, { now: NOW, policy: fixture.policy, limit: 1 }) };
for (const [name, data] of Object.entries(vectors)) writeFileSync(new URL(`${name}.json`, destination), JSON.stringify(data, null, 2) + '\n');
process.stdout.write(JSON.stringify({ directory: 'scripts/visitor-foundry/capabilities/evidence/wire', files: Object.keys(vectors).map(k => `${k}.json`), classification: 'owner-controlled-synthetic' }) + '\n');
