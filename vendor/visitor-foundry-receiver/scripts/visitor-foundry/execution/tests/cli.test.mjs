import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('A packages exact source; cold B CLI processes use it on unseen inputs; fake evaluators separate',()=>{
  const r=spawnSync(process.execPath,[`${root}example/journey.mjs`],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr || r.stdout);
  const record=JSON.parse(readFileSync(`${root}evidence/journey.json`));
  assert.equal(record.cold.length,6);assert.ok(record.cold.every(c=>c.expectedMatch));
  assert.equal(new Set(record.cold.map(c=>c.cliPid)).size,6);
  assert.equal(new Set(record.cold.map(c=>c.observation.processIdentity.pid)).size,6);
  assert.deepEqual(record.evaluatorControls.map(x=>[x.goodAccepted,x.faultyAccepted]),[[6,0],[6,6],[0,0]]);
});
