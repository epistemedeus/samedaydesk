import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { demonstrations, PIN } from '../examples/hosts.mjs';
const paths = ['packs/capability-preflight/src/probes.mjs', 'packs/contributor-desk/src/public-view.mjs'];
const sha = x => `sha256:${createHash('sha256').update(x).digest('hex')}`;
const assets = paths.map(path => {
  execFileSync('git', ['diff', '--exit-code', PIN, '--', path], { stdio: 'pipe' });
  return { path, sourceRevision: PIN, bytes: statSync(path).size, contentDigest: sha(readFileSync(path)), reuse: 'imported and invoked by example host' };
});
const examples = demonstrations();
console.log(JSON.stringify({ schema: 'neomorphic.foundry.participation-reuse-receipt.v1', tasksDigest: sha(readFileSync(new URL('../examples/frozen-tasks.json', import.meta.url))), freezeCommit: 'cbb3d9e',
  originalTaskSuccess: { preflight: 'unresolved-unsupported-range', desk: 'claimability-disclosed-funding-freshness-unresolved' },
  laterChecks: { preflight: examples.later.preflight.status === 'incompatible', desk: examples.later.desk === true },
  assets, sharing: examples.sharing, sharingMeasurement: 'scripted explicit choices and serialized projection bytes; excludes service result, transport, consent UI time and artifact storage',
  humanEffortMs: null, validationCost: null, maintenanceCost: null, relationship: 'owner-controlled', independentVisitors: 0, publication: 'not-performed' }, null, 2));
