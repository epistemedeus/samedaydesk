// H64334 installed-lineage receiving. No provider or production-store access.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from '../../server/foundry/private-pass-core.mjs';
import {acceptedCallerPin, remoteJourney, verifyCallerClosure} from '../../server/foundry/activation/remote-private-journey.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const base = 'c4ec17a891e19177d574ed79faaac25d295d2743';
const donor = '63e4076d1ffd98bc2f561fbb4c66d2fedb714830';
const oldBase = 'a5b40cb015d30de8bf8f3cbbeda1360151279fb0';
const pinPath = 'server/foundry/activation/private-control-pin.json';
const evidence = new URL('./evidence/', import.meta.url);
mkdirSync(evidence, {recursive: true});
const git = (...args) => execFileSync('git', args, {maxBuffer: 16 * 1024 * 1024});
const text = (...args) => git(...args).toString().trim();
const original = file => git('show', `${base}:${file}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const basePinBytes = original(pinPath);
const basePin = JSON.parse(basePinBytes);
const predecessor = {base: basePin.base, sourcePinSha256: basePin.files['vendor/visitor-foundry-receiver/SOURCE-PIN.json'], closureDigest: digest(basePin)};
const repaired = ['server/lib/managed-watch/service.mjs', 'server/lib/managed-watch/source.mjs'];
const donorFiles = {
  [repaired[0]]: '828fc8a4af7d0aa66270e855ebdcde891850a669',
  [repaired[1]]: 'd9f44b04a33eca8bf56ec913dfe8df9c1edddd84',
  'server/scripts/test-managed-watch.mjs': 'e501c99ad3dcb139af79ec89bfbb159bc5f97756',
  'server/scripts/fixtures/disposable-pg.mjs': 'ee0ee944218b6df891b462143d8bb3d4f53e8413',
  'server/scripts/test-postgres-bin.mjs': '15452e925d60c3c6bcf5e2edc6f555dc6159a92f',
  'experiments/oct29-receive-time-freshness/accept.mjs': '6514ac613ad487ff5f8c06336eed320258da5eef',
  'experiments/oct29-receive-time-freshness/recipient.mjs': '4be8e170eb08d0384f0fff517c36b000ddef3435',
  'experiments/oct29-receive-time-freshness/service-main.mjs': '76719e8f5ac2f77e58c47e73eb9f43e0b5f94b24',
  'experiments/oct29-receive-time-freshness/source-server.mjs': '73f931673cb3e0a752a91c6de0c81edb7ead397c',
};
const report = {schema: 'h64334.installed-clock-qualification.v1', stage: process.argv[2], at: new Date().toISOString(), base, donor, testedHead: text('rev-parse', 'HEAD')};
assert.equal(sha(basePinBytes), 'fb725ace03f9c8eac18382b3da3e762f63e84dd5802a8a8be039a858cabfd502');
assert.equal(predecessor.closureDigest, 'sha256:c0211aa4e1090458fec5908a89259ee0896a990dee71a5e0e927b21e85d6cc5c');
assert.equal(Object.keys(basePin.files).length, 1308);
assert.equal(basePin.receivedCallerClosures.length, 34);

if (report.stage === 'source') {
  assert.equal(text('rev-parse', '--is-shallow-repository'), 'false');
  git('merge-base', '--is-ancestor', base, 'HEAD');
  report.ancestry = {commits: Number(text('rev-list', '--count', base)), comparison: text('rev-list', '--left-right', '--count', `${base}...${oldBase}`), mergeBase: text('merge-base', base, oldBase)};
  assert.equal(report.ancestry.comparison, '200\t4');
  assert.equal(report.ancestry.mergeBase, 'd8cea059213e06d2f263be67f82e498f8052a50f');
  writeFileSync(new URL('c4-ancestry.txt', evidence), git('rev-list', '--parents', base));
  writeFileSync(new URL('c4-private-control-pin.json', evidence), basePinBytes);
  report.donorFiles = Object.entries(donorFiles).map(([file, blob]) => {
    assert.equal(text('rev-parse', `${donor}:${file}`), blob);
    assert.deepEqual(readFileSync(file), git('show', `${donor}:${file}`), file);
    return {file, blob, bytes: readFileSync(file).length, sha256: sha(readFileSync(file))};
  });
  for (const file of [...repaired, 'server/scripts/test-managed-watch.mjs', 'server/scripts/fixtures/disposable-pg.mjs']) assert.deepEqual(original(file), git('show', `${oldBase}:${file}`));
  const protectedFiles = ['package.json', 'package-lock.json', 'server/foundry/activation/remote-private-journey.mjs', 'server/scripts/test-proxy-addr-patch.js', 'server/scripts/publish-preserved-client.mjs', 'publication/PRESERVED-PUBLICATION.json', 'server/lib/managed-watch/pins/PINS.json', 'server/lib/managed-watch/pins/change-monitor-0.1.0.tgz'];
  report.protectedFiles = protectedFiles.map(file => {
    assert.deepEqual(readFileSync(file), original(file), file);
    return {file, blob: text('rev-parse', `${base}:${file}`), sha256: sha(readFileSync(file))};
  });
  for (const dir of ['client/src', 'client/public', 'client/dist', 'publication']) assert.equal(text('diff', base, '--', dir), '');
  const workflow = '.github/workflows/runtime-startup.yml';
  assert.equal(readFileSync(workflow, 'utf8'), original(workflow).toString().replace('      - run: npm run test:proxy-addr\n', '      - run: node --test server/scripts/test-postgres-bin.mjs\n      - run: npm run test:proxy-addr\n'));
  writeFileSync(new URL('source.diff', evidence), git('diff', '--binary', base, 'HEAD'));
} else if (report.stage === 'caller') {
  const pin = JSON.parse(readFileSync(pinPath));
  const expected = structuredClone(basePin);
  expected.files[repaired[0]] = '1bb01758c4405ac232425939a74d0c830bed5fca7fcfca3ade72c9cb4154a604';
  expected.files[repaired[1]] = '5f1a31356cd8e0a239c99d3a1c3382892d965fad15e509451b42d181eb70ec05';
  expected.receivedCallerClosures.push(predecessor);
  assert.deepEqual(pin, expected);
  const current = verifyCallerClosure();
  for (const descriptor of [...basePin.receivedCallerClosures, predecessor, current]) assert.equal(acceptedCallerPin(descriptor), true);
  assert.equal(acceptedCallerPin({...predecessor, sourcePinSha256: '0'.repeat(64)}), false);
  report.tamper = [];
  for (const file of repaired) {
    const bytes = readFileSync(file);
    try {
      writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n// H64334 tamper control\n')]));
      // Closure refusal must precede even reading this nonexistent config.
      await assert.rejects(remoteJourney('check', '/nonexistent-h64334-config'), {code: 'caller_source_changed'});
      report.tamper.push({file, code: 'caller_source_changed', beforeConfigRead: true});
    } finally { writeFileSync(file, bytes); }
    assert.deepEqual(verifyCallerClosure(), current);
  }
  report.predecessor = predecessor;
  report.current = current;
  report.members = Object.keys(pin.files).length;
  report.retainedDescriptors = pin.receivedCallerClosures;
} else if (report.stage === 'public') {
  const dist = 'client/dist';
  const baseNames = text('ls-tree', '-r', '--name-only', base, '--', dist).split('\n').map(file => file.slice(dist.length + 1));
  function walk(dir, prefix = '') {
    return readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
  }
  assert.deepEqual(walk(dist).sort(), baseNames.sort());
  report.members = baseNames.map(file => {
    const bytes = readFileSync(path.join(dist, file));
    const prior = original(`${dist}/${file}`);
    assert.deepEqual(bytes, prior, file);
    return {file, bytes: bytes.length, sha256: sha(bytes), c4Sha256: sha(prior), rawEqual: true};
  });
  report.files = report.members.length;
  report.bytes = report.members.reduce((sum, member) => sum + member.bytes, 0);
  report.inventorySha256 = sha(JSON.stringify(report.members.map(row => [row.file, row.sha256])));
  assert.equal(report.files, 352);
  assert.equal(report.bytes, 59951737);
  assert.equal(report.inventorySha256, '6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5');
  report.missing = []; report.extra = []; report.changed = [];
} else { throw new Error('expected source, caller or public'); }
report.ok = true;
writeFileSync(new URL(`${report.stage}.json`, evidence), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({...report, members: Array.isArray(report.members) ? report.members.length : report.members, retainedDescriptors: report.retainedDescriptors?.length}));
