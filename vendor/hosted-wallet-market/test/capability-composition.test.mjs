import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AssetRegistry} from '../runtime/agent-economy-foundation/dist/index.js';
import {BoundaryError} from '../runtime/agent-economy-foundation/dist/contracts.js';
import {RailStore} from '../runtime/agent-economy-rail/dist/store.js';
import {prepareIntent} from '../runtime/agent-economy-rail/dist/local-chain.js';
import {applyNativeBudgetCeiling, operationGrantAccepted} from '../src/machine-money.mjs';
import {admitQualifiedMember} from '../src/capability-composition.mjs';
import {createOperationAuthorityDouble} from '../src/operation-authority-double.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = 'aa861e980df0f75a782ff30996450cf15870f2e7';
const operator = '0x' + 'ab'.repeat(20);
const asset = {chain:'eip155:8453', token:'0x' + '11'.repeat(20), decimals:6, symbol:'USDC'};
const quote = {baseFee:1n, suggestedPriority:1n, operatorFeeAtGasLimit:0n, l1FeeUpperBound:0n, l1Fee:0n, source:'disposable', block:'1', upgrade:'unknown'};

function client() {
  return {
    chain:{id:8453}, transport:{url:'http://127.0.0.1:9'},
    async getChainId(){return 8453;},
    async request(){return 8453;},
    async getTransactionCount(){return 0;},
    async estimateGas(){return 21000n;},
  };
}
function identity(extra = {}) {
  const assets = new AssetRegistry('sandbox', [{asset, environment:'sandbox', canonical:{asset:'USDC', network:'eip155:8453'}}]);
  return {networkClass:'owned-fork', forkId:'h103010-disposable', configuredChain:'eip155:8453', asset, assets,
    feeLimits:{gasLimit:100000n, maxFeePerGas:10n, maxPriorityFeePerGas:2n}, feeQuote:quote, ...extra};
}
function grant(overrides = {}) {
  return {schema:'pilot.machine-rail-authority.v1', revoked:false, origin:'https://127.0.0.1', tenant:'root10940-owner-qa-fixture',
    profile:'machine-market', executionClass:'owned-fork', forkId:'h103010-disposable', sourceSha256:'a'.repeat(64), hostSha256:'b'.repeat(64),
    networkIdentityDigest:'c'.repeat(64), operator, feeRecipient:'0x' + '11'.repeat(20), epoch:1, expiresAt:'2099-01-01T00:00:00.000Z', ...overrides};
}
function expected(overrides = {}) {
  return {origin:'https://127.0.0.1', tenant:'root10940-owner-qa-fixture', executionClass:'owned-fork', forkId:'h103010-disposable',
    sourceSha256:'a'.repeat(64), hostSha256:'b'.repeat(64), networkIdentityDigest:'c'.repeat(64), operator,
    feeRecipient:'0x' + '11'.repeat(20), grantEpoch:1, authorityDigest:'d'.repeat(64), now:Date.parse('2026-11-01T00:00:00.000Z'), ...overrides};
}

test('operation grant checks do not inherit a profile or a stale scope', () => {
  assert.equal(operationGrantAccepted(grant(), expected()), true);
  assert.equal(operationGrantAccepted(grant({revoked:true}), expected()), false);
  assert.equal(operationGrantAccepted(grant({expiresAt:'2020-01-01T00:00:00.000Z'}), expected()), false);
  assert.equal(operationGrantAccepted(grant({sourceSha256:'e'.repeat(64)}), expected()), false);
  assert.equal(operationGrantAccepted(grant({hostSha256:'f'.repeat(64)}), expected()), false);
  assert.equal(operationGrantAccepted(grant({forkId:'other-fork'}), expected()), false);
  assert.equal(operationGrantAccepted(null, expected()), false);
  assert.equal(operationGrantAccepted(grant(), expected({witness:{grantEpoch:2, authorityDigest:'d'.repeat(64)}})), false);
});

test('withOperation isolates concurrent rail intents and does not sign a replay', async () => {
  const double = createOperationAuthorityDouble({operator, revoked:false});
  assert.equal(Object.hasOwn(double, 'lastGrant'), false);
  await assert.rejects(double.operator.signTransaction({}), error => error.codeName === 'operation_scope_required');
  assert.equal(double.signatures, 0);
  await Promise.all([
    double.withOperation({operationId:'operation-a'}, async () => {
      await new Promise(done => setTimeout(done, 20));
      assert.ok(await double.readAuthorization({operationId:'operation-a'}));
      assert.equal(await double.readAuthorization({operationId:'operation-b'}), null);
    }),
    double.withOperation({operationId:'operation-b'}, async () => {
      assert.ok(await double.readAuthorization({operationId:'operation-b'}));
      assert.equal(await double.readAuthorization({operationId:'operation-a'}), null);
    }),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'h103010-rail-'));
  const file = join(dir, 'rail.sqlite');
  const store = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
  const signer = double.operator;
  const gate = {async authorizeIntent(_phase, id){ if (!await double.readAuthorization({operationId:id})) throw new BoundaryError('machine_signing_authority_refused'); }};
  const scoped = identity({withOperation:double.withOperation, authorizeIntent:gate.authorizeIntent});
  try {
    const first = await prepareIntent(store, 'fund:one', 'binding-one', client(), signer, asset.token, '0x', scoped);
    const replay = await prepareIntent(store, 'fund:one', 'binding-one', client(), signer, asset.token, '0x', scoped);
    assert.equal(replay.raw, first.raw);
    assert.equal(double.signatures, 1);
    store.close();
    const reopened = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
    const recovered = await prepareIntent(reopened, 'fund:one', 'binding-one', client(), signer, asset.token, '0x', scoped);
    assert.equal(recovered.raw, first.raw);
    assert.equal(double.signatures, 1);
    const [left, right] = await Promise.all([
      prepareIntent(reopened, 'fund:left', 'binding-left', client(), signer, asset.token, '0x', scoped),
      prepareIntent(reopened, 'fund:right', 'binding-right', client(), signer, asset.token, '0x', scoped),
    ]);
    assert.notEqual(left.raw, right.raw);
    assert.equal(double.signatures, 3);
    const mismatched = identity({
      authorizeIntent:gate.authorizeIntent,
      async withOperation(_request, callback){ return double.withOperation({operationId:'operation-other'}, callback); },
    });
    await assert.rejects(prepareIntent(reopened, 'fund:mismatch', 'binding-mismatch', client(), signer, asset.token, '0x', mismatched),
      error => error.code === 'machine_signing_authority_refused');
    assert.equal(double.signatures, 3);
    assert.equal(reopened.get('tx', 'fund:mismatch'), null);
    reopened.close();
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('a legacy signer without withOperation still signs once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h103010-legacy-'));
  let signs = 0;
  const store = new RailStore(join(dir, 'rail.sqlite'));
  const signer = {address:operator, async signTransaction(){ signs += 1; return '0x' + '22'.repeat(32); }};
  const assets = new AssetRegistry('sandbox', [{asset:{...asset, chain:'eip155:31337'}, environment:'sandbox', canonical:{asset:'USDC', network:'eip155:31337'}}]);
  const legacy = {networkClass:'sandbox', configuredChain:'eip155:31337', asset:{...asset, chain:'eip155:31337'}, assets,
    async authorizeIntent(){}};
  const rpc = {chain:{id:31337}, transport:{url:'http://127.0.0.1:9'}, async getChainId(){return 31337;}, async request(){return 31337;},
    async getTransactionCount(){return 0;}, async estimateGas(){return 21000n;}, async getGasPrice(){return 1n;}};
  try {
    const intent = await prepareIntent(store, 'sandbox:one', 'binding', rpc, signer, asset.token, '0x', legacy);
    const again = await prepareIntent(store, 'sandbox:one', 'binding', rpc, signer, asset.token, '0x', legacy);
    assert.equal(again.raw, intent.raw);
    assert.equal(signs, 1);
  } finally { store.close(); rmSync(dir, {recursive:true, force:true}); }
});

test('a lower native budget cannot keep or raise the stored remaining', () => {
  assert.equal(applyNativeBudgetCeiling(null, '100').remaining, '100');
  assert.equal(applyNativeBudgetCeiling({remaining:'1000', spent:'0', holds:{}, unknown:[]}, '100').remaining, '100');
  assert.equal(applyNativeBudgetCeiling({remaining:'50', spent:'0', holds:{}, unknown:[]}, '100').remaining, '50');
  const held = applyNativeBudgetCeiling({remaining:'900', spent:'0', holds:{'fund:one':'100'}, unknown:['fund:one']}, '50');
  assert.equal(held.remaining, '0');
  assert.equal(held.holds['fund:one'], '100');
  assert.deepEqual(held.unknown, ['fund:one']);
  const fitted = applyNativeBudgetCeiling({remaining:'900', spent:'0', holds:{'fund:one':'100'}, unknown:[]}, '200');
  assert.equal(fitted.remaining, '100');
  assert.equal(fitted.holds['fund:one'], '100');
});

test('qualified membership does not loosen the unfunded document', () => {
  const refused = admitQualifiedMember('not-a-document', {sdsRoot:'/tmp', origin:'https://127.0.0.1', tenant:'root10940-owner-qa-fixture', paired:{money:'unfunded'}});
  assert.equal(refused.document, null);
  assert.equal(refused.fault, 'machine_profile_refused');
  assert.throws(() => admitQualifiedMember('not-a-document', {paired:{money:'qualified'}}), error => error.codeName === 'capability_composition_refused');
  const fixture = JSON.parse(readFileSync(new URL('../contracts/h104-operation-authority.fixture.json', import.meta.url), 'utf8'));
  assert.equal(fixture.mutableLastGrant, false);
  assert.equal(fixture.method, 'withOperation');
  const changed = execFileSync('git', ['diff', '--name-only', base, '--', 'vendor/hosted-wallet-market/client', 'vendor/neomorphic-contributor-desk'], {cwd:root, encoding:'utf8'});
  assert.equal(changed, '');
});
