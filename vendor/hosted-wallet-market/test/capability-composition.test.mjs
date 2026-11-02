import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AssetRegistry, digest} from '../runtime/agent-economy-foundation/dist/index.js';
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

test('a fault after signature leaves an unknown reservation that is not signed again', async () => {
  const double = createOperationAuthorityDouble({operator, revoked:false});
  const dir = mkdtempSync(join(tmpdir(), 'h103010-unknown-'));
  const file = join(dir, 'rail.sqlite');
  const store = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
  const budgetKey = 'budget-fault';
  store.put('native-budget', budgetKey, {remaining:'5000000', spent:'0', holds:{}, unknown:[]});
  const signer = double.operator;
  const gate = {async authorizeIntent(_phase, id){ if (!await double.readAuthorization({operationId:id})) throw new BoundaryError('machine_signing_authority_refused'); }};
  let faults = 0;
  const scoped = identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:5000000n, withOperation:double.withOperation, authorizeIntent:gate.authorizeIntent,
    faultAfterSign(){ faults += 1; }});
  try {
    await assert.rejects(prepareIntent(store, 'fund:faulted', 'binding-fault', client(), signer, asset.token, '0x', scoped), error => error.code === 'signing_unknown');
    assert.equal(faults, 1);
    assert.equal(double.signatures, 1);
    const reserved = store.get('tx', 'fund:faulted');
    assert.equal(reserved.phase, 'unknown');
    assert.equal(reserved.raw, undefined);
    assert.equal(typeof store.get('native-budget', budgetKey).holds['fund:faulted'], 'string');
    const nonce = store.all('nonce');
    const budget = store.get('native-budget', budgetKey);
    store.close();
    const reopened = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
    const again = identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:5000000n, withOperation:double.withOperation, authorizeIntent:gate.authorizeIntent});
    await assert.rejects(prepareIntent(reopened, 'fund:faulted', 'binding-fault', client(), signer, asset.token, '0x', again), error => error.code === 'signing_unknown');
    assert.equal(double.signatures, 1);
    assert.equal(faults, 1);
    assert.deepEqual(reopened.all('nonce'), nonce);
    assert.deepEqual(reopened.get('native-budget', budgetKey), budget);
    assert.equal(reopened.get('tx', 'fund:faulted').raw, undefined);
    reopened.close();
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('an account signer that rejects after entry keeps the nonce and hold', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h103010-entered-'));
  const file = join(dir, 'rail.sqlite');
  const store = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
  const budgetKey = 'budget-entered';
  store.put('native-budget', budgetKey, {remaining:'5000000', spent:'0', holds:{}, unknown:[]});
  let attempts = 0;
  const signer = {address:operator, async signTransaction(){ attempts += 1; throw Object.assign(new Error('lost'), {code:'signer_lost'}); }};
  const scoped = identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:5000000n});
  try {
    await assert.rejects(prepareIntent(store, 'fund:lost', 'binding-lost', client(), signer, asset.token, '0x', scoped), error => error.code === 'signer_lost');
    assert.equal(attempts, 1);
    assert.equal(store.get('tx', 'fund:lost').phase, 'unknown');
    assert.equal(store.get('tx', 'fund:lost').raw, undefined);
    const hold = store.get('native-budget', budgetKey).holds['fund:lost'];
    const nonce = store.all('nonce');
    assert.equal(typeof hold, 'string');
    store.close();
    const reopened = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
    await assert.rejects(prepareIntent(reopened, 'fund:lost', 'binding-lost', client(), signer, asset.token, '0x', scoped), error => error.code === 'signing_unknown');
    assert.equal(attempts, 1);
    assert.equal(reopened.get('native-budget', budgetKey).holds['fund:lost'], hold);
    assert.deepEqual(reopened.all('nonce'), nonce);
    assert.equal(reopened.get('tx', 'fund:lost').raw, undefined);
    reopened.close();
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('a proved pre-entry refusal releases the reservation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h103010-preentry-'));
  const store = new RailStore(join(dir, 'rail.sqlite'), {kind:'fork', forkId:'h103010-disposable'});
  const budgetKey = 'budget-pre';
  store.put('native-budget', budgetKey, {remaining:'5000000', spent:'0', holds:{}, unknown:[]});
  const signer = {address:operator, async signTransaction(){ throw Object.assign(new Error('policy_refused'), {code:'policy_refused', signerEntered:false}); }};
  const scoped = identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:5000000n});
  try {
    await assert.rejects(prepareIntent(store, 'fund:policy', 'binding-policy', client(), signer, asset.token, '0x', scoped), error => error.code === 'policy_refused');
    assert.equal(store.get('tx', 'fund:policy'), null);
    assert.equal(store.get('native-budget', budgetKey).holds['fund:policy'], undefined);
    assert.deepEqual(store.all('nonce'), [{next:0}]);
  } finally { store.close(); rmSync(dir, {recursive:true, force:true}); }
});

test('a historical fund signature is returned unchanged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h103010-historical-'));
  const store = new RailStore(join(dir, 'rail.sqlite'), {kind:'fork', forkId:'h103010-disposable'});
  const proofId = `local-escrow:${'ab'.repeat(32)}`;
  const id = `fund:${proofId}`;
  const data = '0xabcdef';
  const oldBinding = digest({proofId, data});
  const commitment = {operationId:'authorize-historical', quoteDigest:'11'.repeat(32), approvalDigest:'22'.repeat(32)};
  const extended = digest({proofId, data, ...commitment});
  const raw = `0x${'cd'.repeat(32)}`;
  const txId = `0x${'ef'.repeat(32)}`;
  store.put('tx', id, {id, binding:oldBinding, phase:'signed', to:asset.token, data, nonce:3, raw, txId});
  let attempts = 0;
  const signer = {address:operator, async signTransaction(){ attempts += 1; return '0x11'; }};
  const scoped = identity({fundCommitment:commitment});
  try {
    const recovered = await prepareIntent(store, id, extended, client(), signer, asset.token, data, scoped);
    assert.equal(recovered.raw, raw);
    assert.equal(recovered.txId, txId);
    assert.equal(store.get('tx', id).binding, oldBinding);
    assert.equal(attempts, 0);
    await assert.rejects(prepareIntent(store, id, `${'zz'.repeat(20)}`, client(), signer, asset.token, data, scoped), error => error.code === 'operation_conflict');
    assert.equal(store.get('tx', id).binding, oldBinding);
    assert.equal(attempts, 0);
    const unknownId = 'fund:historical-unknown';
    store.put('tx', unknownId, {id:unknownId, binding:digest({proofId:'historical-unknown', data:'0x01'}), phase:'unknown', to:asset.token, data:'0x01', nonce:4});
    await assert.rejects(prepareIntent(store, unknownId, digest({proofId:'historical-unknown', data:'0x01', operationId:'authorize-other', quoteDigest:'aa', approvalDigest:'bb'}), client(), signer, asset.token, '0x01', identity()), error => error.code === 'operation_conflict');
    assert.equal(attempts, 0);
    assert.equal(store.get('tx', unknownId).phase, 'unknown');
  } finally { store.close(); rmSync(dir, {recursive:true, force:true}); }
});

test('a reserved row left before signer entry is not signed again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h103010-crash-'));
  const file = join(dir, 'rail.sqlite');
  const store = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
  const budgetKey = 'budget-crash';
  const id = 'fund:crashed';
  store.put('tx', id, {id, binding:'binding-crash', phase:'reserved', to:asset.token, data:'0x', nonce:5});
  store.put('native-budget', budgetKey, {remaining:'10', spent:'0', holds:{[id]:'5'}, unknown:[]});
  let attempts = 0;
  const signer = {address:operator, async signTransaction(){ attempts += 1; return '0x11'; }};
  try {
    await assert.rejects(prepareIntent(store, id, 'binding-crash', client(), signer, asset.token, '0x', identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:10n})), error => error.code === 'signing_unknown');
    assert.equal(attempts, 0);
    assert.equal(store.get('native-budget', budgetKey).holds[id], '5');
    assert.equal(store.get('tx', id).phase, 'reserved');
    store.close();
    const reopened = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
    await assert.rejects(prepareIntent(reopened, id, 'binding-crash', client(), signer, asset.token, '0x', identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:10n})), error => error.code === 'signing_unknown');
    assert.equal(attempts, 0);
    assert.equal(reopened.get('tx', id).raw, undefined);
    reopened.close();
  } finally { rmSync(dir, {recursive:true, force:true}); }
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
