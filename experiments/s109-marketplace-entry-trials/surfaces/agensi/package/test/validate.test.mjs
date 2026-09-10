import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJsonSchema } from '../lib/json-schema.mjs';
import { PIN, validateAgensiPackage } from '../lib/validate-package.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(__dirname, '..');
const validateBin = path.join(pkg, 'bin', 'validate-descriptor.mjs');
const checklistBin = path.join(pkg, 'bin', 'checklist.mjs');
const descriptorPath = path.join(pkg, 'offer-descriptor.json');
const schemaPath = path.join(pkg, 'offer-descriptor.schema.json');

function run(bin, args = []) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

function load() {
  return {
    schema: JSON.parse(fs.readFileSync(schemaPath, 'utf8')),
    descriptor: JSON.parse(fs.readFileSync(descriptorPath, 'utf8')),
    checklist: JSON.parse(fs.readFileSync(path.join(pkg, 'listing-checklist.json'), 'utf8')),
    handoff: JSON.parse(fs.readFileSync(path.join(pkg, 'access-handoff.json'), 'utf8')),
  };
}

test('json-schema engine: const / required / additionalProperties', () => {
  const schema = {
    type: 'object',
    required: ['n'],
    additionalProperties: false,
    properties: { n: { const: 0 } },
  };
  assert.equal(validateJsonSchema({ n: 0 }, schema).ok, true);
  assert.equal(validateJsonSchema({ n: 1 }, schema).ok, false);
  assert.equal(validateJsonSchema({}, schema).ok, false);
  assert.equal(validateJsonSchema({ n: 0, extra: true }, schema).ok, false);
});

test('json-schema engine: local $ref only; network $ref refused', () => {
  const schema = {
    $defs: { pin: { const: 'abc' } },
    type: 'object',
    properties: { p: { $ref: '#/$defs/pin' } },
  };
  assert.equal(validateJsonSchema({ p: 'abc' }, schema).ok, true);
  const net = validateJsonSchema({ p: 'x' }, {
    type: 'object',
    properties: { p: { $ref: 'https://example.com/schema.json' } },
  });
  assert.equal(net.ok, false);
  assert.match(net.errors[0].message, /network \$ref/);
});

test('offer descriptor validates against schema offline', () => {
  const { schema, descriptor } = load();
  const r = validateJsonSchema(descriptor, schema, { root: schema });
  assert.equal(r.ok, true, JSON.stringify(r.errors, null, 2));
});

test('listing checklist and access handoff validate against $defs', () => {
  const { schema, checklist, handoff } = load();
  const a = validateJsonSchema(checklist, schema.$defs.listingChecklist, { root: schema });
  const b = validateJsonSchema(handoff, schema.$defs.accessHandoff, { root: schema });
  assert.equal(a.ok, true, JSON.stringify(a.errors, null, 2));
  assert.equal(b.ok, true, JSON.stringify(b.errors, null, 2));
});

test('package validator: pin, no proprietary claim, $0', () => {
  const report = validateAgensiPackage(pkg);
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.cashBoundaryUsd, 0);
  assert.equal(report.networkCalls, 0);
  assert.equal(report.publicListingSupported, false);
  assert.equal(report.claimsProprietaryOwnershipOfFreeRecipes, false);
  assert.equal(report.skillRecipePin, PIN);
  assert.equal(report.authenticatedStepNeeded, true);
  assert.ok(report.listingChecklistItems >= 8);
  assert.ok(report.accessHandoffSteps >= 6);
  assert.equal(report.referencedPublicRecipes, 16);
});

test('validate-descriptor.mjs exits 0 on the committed descriptor', () => {
  const r = run(validateBin, [descriptorPath]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.cashBoundaryUsd, 0);
  assert.equal(j.publicListingSupported, false);
  assert.equal(j.offline, true);
});

test('checklist.mjs prints listing items and stays $0', () => {
  const r = run(checklistBin);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.cashBoundaryUsd, 0);
  assert.equal(j.publicListingSupported, false);
  assert.ok(j.listingChecklist.some((i) => i.id === 'attribution-no-proprietary'));
  assert.ok(j.listingChecklist.some((i) => i.id === 'cf-access-dev'));
});

test('npm run validate uses the package.json script', () => {
  const r = spawnSync('npm', ['run', 'validate', '--silent'], {
    cwd: pkg,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
});

test('tampered pin fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's109-agensi-'));
  copyPackage(dir);
  const dPath = path.join(dir, 'offer-descriptor.json');
  const d = JSON.parse(fs.readFileSync(dPath, 'utf8'));
  d.skillRecipePin = 'wrong-pin';
  fs.writeFileSync(dPath, JSON.stringify(d, null, 2));
  const r = run(validateBin, [dPath]);
  assert.notEqual(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
});

test('proprietary-ownership claim fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's109-agensi-'));
  copyPackage(dir);
  const dPath = path.join(dir, 'offer-descriptor.json');
  const d = JSON.parse(fs.readFileSync(dPath, 'utf8'));
  d.ownershipClaim.claimsProprietaryOwnershipOfFreeRecipes = true;
  d.ownershipClaim.statement = 'We own these recipes exclusively.';
  fs.writeFileSync(dPath, JSON.stringify(d, null, 2));
  const r = run(validateBin, [dPath]);
  assert.notEqual(r.status, 0);
});

test('refuses listing flags without contacting Agensi', () => {
  const r = run(validateBin, ['--list']);
  assert.equal(r.status, 2);
  const j = JSON.parse(r.stderr);
  assert.equal(j.ok, false);
  assert.match(j.error, /Refusing --list/);
});

function copyPackage(dir) {
  for (const name of [
    'offer-descriptor.json',
    'offer-descriptor.schema.json',
    'listing-checklist.json',
    'access-handoff.json',
  ]) {
    fs.copyFileSync(path.join(pkg, name), path.join(dir, name));
  }
}
