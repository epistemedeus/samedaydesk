import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {keccak256} from 'viem';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {AssetRegistry, digest} from '../runtime/agent-economy-foundation/dist/index.js';
import {BoundaryError} from '../runtime/agent-economy-foundation/dist/contracts.js';
import {RailStore} from '../runtime/agent-economy-rail/dist/store.js';
import {prepareIntent} from '../runtime/agent-economy-rail/dist/local-chain.js';
import {CommercePaymentsRail} from '../runtime/agent-economy-rail/dist/rail.js';
import {applyNativeBudgetCeiling, historicalAuthorityDigest, historicalLineageAccepts, operationGrantAccepted} from '../src/machine-money.mjs';
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
  assert.equal(operationGrantAccepted(grant(), expected({replay:true, witness:{grantEpoch:2, authorityDigest:'e'.repeat(64)}})), false);
  assert.equal(operationGrantAccepted(grant(), expected({replay:true, historicalAuthority:true, witness:{grantEpoch:2, authorityDigest:'e'.repeat(64)}})), true);
});

test('historical authority is recomputed from the retained closure', () => {
  const fees = {gasLimit:'100000', maxFeePerGas:'10', maxPriorityFeePerGas:'1'};
  const bound = {origin:'https://machine.example', tenant:'pilot', profile:'machine-market', source:'a'.repeat(64), host:'b'.repeat(64),
    network:'c'.repeat(64), executionClass:'owned-fork', forkId:'h113010-disposable', operator, feeRecipient:'0x' + '11'.repeat(20), epoch:1, feeLimits:fees};
  const withoutBudget = historicalAuthorityDigest(bound);
  const withBudget = historicalAuthorityDigest({...bound, nativeBudget:'1000'});
  assert.equal(typeof withoutBudget, 'string');
  assert.notEqual(withBudget, withoutBudget);
  const witness = {identityDigest:bound.network, attestationRef:'', grantEpoch:1, configuredChain:'eip155:8453', networkClass:'owned-fork', abiDigest:'d'.repeat(64), authorityDigest:withBudget};
  const entry = {schema:'pilot.historical-authority-lineage.v1', configuredChain:'eip155:8453', abiDigest:witness.abiDigest, bound:{...bound, nativeBudget:'1000'}};
  assert.equal(historicalLineageAccepts([entry], witness)?.bound.epoch, 1);
  assert.equal(historicalLineageAccepts([{...entry, bound}], witness), null);
  assert.equal(historicalLineageAccepts([entry], {...witness, authorityDigest:withoutBudget}), null);
  assert.equal(historicalLineageAccepts([entry], {...witness, grantEpoch:2}), null);
  assert.equal(historicalLineageAccepts([{...entry, bound:{...entry.bound, source:'e'.repeat(64)}}], witness), null);
  assert.equal(historicalLineageAccepts([{...entry, bound:{...entry.bound, host:'f'.repeat(64)}}], witness), null);
  assert.equal(historicalLineageAccepts([{...entry, bound:{...entry.bound, operator:'0x' + '22'.repeat(20)}}], witness), null);
  assert.equal(historicalLineageAccepts([], witness), null);
  assert.equal(historicalLineageAccepts([entry], {...witness, authorityDigest:undefined}), null);
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

test('a refusal before the signer is called releases the reservation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h103010-preentry-'));
  const store = new RailStore(join(dir, 'rail.sqlite'), {kind:'fork', forkId:'h103010-disposable'});
  const budgetKey = 'budget-pre';
  store.put('native-budget', budgetKey, {remaining:'5000000', spent:'0', holds:{}, unknown:[]});
  let attempts = 0;
  const signer = {address:operator, async signTransaction(){ attempts += 1; throw Object.assign(new Error('should-not-run'), {signerEntered:false}); }};
  const scoped = identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:5000000n, async authorizeIntent(){ throw Object.assign(new Error('policy_refused'), {code:'policy_refused', signerEntered:false}); }});
  try {
    await assert.rejects(prepareIntent(store, 'fund:policy', 'binding-policy', client(), signer, asset.token, '0x', scoped), error => error.code === 'policy_refused');
    assert.equal(attempts, 0);
    assert.equal(store.get('tx', 'fund:policy'), null);
    assert.equal(store.get('native-budget', budgetKey).holds['fund:policy'], undefined);
    assert.deepEqual(store.all('nonce'), [{next:0}]);
  } finally { store.close(); rmSync(dir, {recursive:true, force:true}); }
});

test('an entered signer cannot release the reservation with signerEntered false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h103010-false-flag-'));
  const file = join(dir, 'rail.sqlite');
  const store = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
  const budgetKey = 'budget-false';
  store.put('native-budget', budgetKey, {remaining:'5000000', spent:'0', holds:{}, unknown:[]});
  let attempts = 0;
  const signer = {address:operator, async signTransaction(){ attempts += 1; throw Object.assign(new Error('opaque'), {code:'opaque_reject', signerEntered:false}); }};
  const scoped = identity({nativeBudgetKey:budgetKey, nativeBudgetRemaining:5000000n});
  try {
    await assert.rejects(prepareIntent(store, 'fund:opaque', 'binding-opaque', client(), signer, asset.token, '0x', scoped), error => error.code === 'opaque_reject' && error.signerEntered === false);
    assert.equal(attempts, 1);
    assert.equal(store.get('tx', 'fund:opaque').phase, 'unknown');
    assert.equal(store.get('tx', 'fund:opaque').raw, undefined);
    const hold = store.get('native-budget', budgetKey).holds['fund:opaque'];
    const nonce = store.all('nonce');
    assert.equal(typeof hold, 'string');
    store.close();
    const reopened = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
    await assert.rejects(prepareIntent(reopened, 'fund:opaque', 'binding-opaque', client(), signer, asset.token, '0x', scoped), error => error.code === 'signing_unknown');
    assert.equal(attempts, 1);
    assert.equal(reopened.get('native-budget', budgetKey).holds['fund:opaque'], hold);
    assert.deepEqual(reopened.all('nonce'), nonce);
    assert.equal(reopened.get('tx', 'fund:opaque').raw, undefined);
    reopened.close();
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

const predecessorCode = '0x600160005260206000f3';
const predecessorCodeHash = keccak256(predecessorCode);
const predecessorToken = '0x' + '11'.repeat(20);
const predecessorEscrow = '0x' + '22'.repeat(20);
const predecessorCollector = '0x' + '33'.repeat(20);
const predecessorRefund = '0x' + '44'.repeat(20);
const predecessorReceiver = '0x' + '55'.repeat(20);
const predecessorPayer = '0x' + '66'.repeat(20);
const predecessorFee = '0x' + '77'.repeat(20);

function predecessorClient(sends) {
  return {
    chain:{id:8453}, transport:{url:'http://127.0.0.1:9'},
    async getChainId(){return 8453;},
    async request(){return '0x2105';},
    async getTransactionCount(){return 0;},
    async estimateGas(){return 21000n;},
    async getBlock(){return {timestamp:BigInt(Math.floor(Date.now()/1000)), number:1n, hash:'0x' + 'ab'.repeat(32)};},
    async getBlockNumber(){return 1n;},
    async getCode(){return predecessorCode;},
    async readContract({functionName}){ if (functionName === 'getHash') return '0x' + 'cd'.repeat(32); throw new Error('unread'); },
    async getTransactionReceipt(){return null;},
    async getTransaction(){return null;},
    async sendRawTransaction(){ sends.n += 1; return '0x' + '11'.repeat(32); },
    async waitForTransactionReceipt(){return null;},
    async getContractEvents(){return [];},
  };
}
function materializePredecessor(commit) {
  const dir = join(tmpdir(), 'h103010-src-' + commit.slice(0, 12));
  const railFile = join(dir, 'vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/rail.js');
  if (!existsSync(railFile)) {
    mkdirSync(dir, {recursive:true});
    const archive = execFileSync('git', ['-C', root, 'archive', commit, 'vendor/hosted-wallet-market/runtime'], {maxBuffer:64 * 1024 * 1024});
    execFileSync('tar', ['-x', '-C', dir], {input:archive});
    const modules = existsSync(join(root, 'node_modules/viem')) ? join(root, 'node_modules') : join(root, 'vendor/hosted-wallet-market/node_modules');
    symlinkSync(modules, join(dir, 'node_modules'));
  }
  return dir;
}
function crashOnSubmittedFunding(store) {
  const put = store.put.bind(store);
  store.put = (space, key, value) => {
    if (space === 'funding' && value?.authorizationTx)
      throw Object.assign(new Error('crash_before_funding_update'), {code:'crash_before_funding_update'});
    return put(space, key, value);
  };
  return () => { store.put = put; };
}
async function producePredecessor(commit, crash) {
  const dir = materializePredecessor(commit);
  const railUrl = pathToFileURL(join(dir, 'vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/rail.js')).href;
  const feesUrl = pathToFileURL(join(dir, 'vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/fees.js')).href;
  const {CommercePaymentsRail: Predecessor} = await import(railUrl);
  const {capturePlan} = await import(feesUrl);
  const abi = JSON.parse(readFileSync(join(dir, 'vendor/hosted-wallet-market/runtime/agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json'), 'utf8'));
  const work = mkdtempSync(join(tmpdir(), 'h103010-produced-'));
  const file = join(work, 'rail.sqlite');
  const store = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
  const budgetKey = 'budget-pred';
  store.put('native-budget', budgetKey, {remaining:'1000000000000', spent:'0', holds:{}, unknown:[]});
  const account = privateKeyToAccount(generatePrivateKey());
  let signs = 0;
  const signer = {address:account.address, async signTransaction(tx){ signs += 1; return account.signTransaction(tx); }};
  const sends = {n:0};
  const producedAsset = {chain:'eip155:8453', token:predecessorToken, decimals:6, symbol:'USDC'};
  const assets = new AssetRegistry('sandbox', [{asset:producedAsset, environment:'sandbox', canonical:{asset:'USDC', network:'eip155:8453'}}]);
  const codeHashes = Object.fromEntries([predecessorEscrow, predecessorCollector, predecessorRefund, predecessorToken].map(address => [address, predecessorCodeHash]));
  const network = {networkClass:'owned-fork', forkId:'h103010-disposable',
    feeLimits:{gasLimit:100000n, maxFeePerGas:10n, maxPriorityFeePerGas:1n},
    feeQuote:{baseFee:1n, suggestedPriority:1n, operatorFeeAtGasLimit:0n, l1FeeUpperBound:0n, l1Fee:0n, source:'disposable', block:'1', upgrade:'unknown'},
    nativeBudgetKey:budgetKey, nativeBudgetRemaining:1000000000000n};
  const rail = new Predecessor(store, predecessorClient(sends), signer, 'machine-commerce-v1',
    {chain:'eip155:8453', escrow:predecessorEscrow, collector:predecessorCollector, refundCollector:predecessorRefund, token:predecessorToken, abi, codeHashes, network},
    async () => {}, 1n, assets);
  const now = Math.floor(Date.now() / 1000);
  const pay = {operator:account.address, payer:predecessorPayer, receiver:predecessorReceiver, token:predecessorToken, maxAmount:1000000n,
    preApprovalExpiry:now + 86400, authorizationExpiry:now + 172800, refundExpiry:now + 259200, minFeeBps:500, maxFeeBps:500, feeReceiver:predecessorFee, salt:100n + BigInt(crash ? 1 : 0)};
  const plan = capturePlan(['1000000']);
  const name = commit.slice(0, 8) + (crash ? 'crash' : 'done');
  const quote = {schemaVersion:'pilot.agent-economy.v2', quoteId:`quote${name}`, tenantId:`tenant${name}`, taskId:`task${name}`, canonicalTaskId:`canon${name}`,
    taskVersion:1, termsVersion:'terms1', requesterId:'requester1', evaluatorId:'evaluator1', contributorId:'contributor1',
    payoutDestination:predecessorReceiver, fundingAuthorityId:'machine-commerce-v1', settlementAuthorityId:'settlement-v1',
    asset:producedAsset, gross:'1000000', contributorNet:plan.net, platformFee:plan.feeAmount, subsidy:'0',
    fee:{schemaVersion:'pilot.agent-economy.v2', bps:500, basis:'new_job_gross', profile:{id:'commerce-payments-v1.1.0-single-capture', rounding:'per_capture_floor', mode:'single_capture', escrow:rail.protocol}},
    rail:{mode:'deduct_gross', costCap:'0'}, fundingTarget:predecessorEscrow, expiresAt:new Date((pay.preApprovalExpiry - 60) * 1000).toISOString(),
    rules:{partial:'accepted_gross_only', refund:'unaccepted_gross_only', dispute:'hold_until_authoritative_resolution', reversal:'reconcile_without_repricing_earned_obligation', rightsTermsRef:'terms1'},
    feeRecipient:predecessorFee};
  const proofId = await rail.bindQuote(quote, pay);
  const operationId = `authorize-${name}`;
  const signature = '0x' + '12'.repeat(65);
  if (crash) {
    const restore = crashOnSubmittedFunding(store);
    await assert.rejects(() => rail.authorize(proofId, signature, operationId), error => error.code === 'crash_before_funding_update');
    restore();
  } else await rail.authorize(proofId, signature, operationId);
  const id = `fund:${proofId}`;
  const tx = store.get('tx', id);
  const funding = store.get('funding', proofId);
  const allocation = store.get('funding-allocation', JSON.stringify([funding.quote.tenantId, funding.quote.canonicalTaskId]));
  assert.equal(signs, 1);
  assert.equal(typeof tx.raw, 'string');
  assert.equal(allocation.proofId, proofId);
  assert.equal(allocation.quoteDigest, digest(funding.quote));
  assert.equal(typeof store.get('native-budget', budgetKey).holds[id], 'string');
  if (crash) assert.equal(funding.authorizationTx, null);
  else assert.equal(funding.authorizationTx, tx.txId);
  store.close();
  return {work, file, proofId, operationId, signature, budgetKey};
}
function openCurrent(file) {
  const store = new RailStore(file, {kind:'fork', forkId:'h103010-disposable'});
  const attempts = {n:0};
  const sends = {n:0};
  const signer = {address:operator, async signTransaction(){ attempts.n += 1; throw new Error('recovery-must-not-sign'); }};
  const abi = JSON.parse(readFileSync(new URL('../runtime/agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json', import.meta.url), 'utf8'));
  const producedAsset = {chain:'eip155:8453', token:predecessorToken, decimals:6, symbol:'USDC'};
  const assets = new AssetRegistry('sandbox', [{asset:producedAsset, environment:'sandbox', canonical:{asset:'USDC', network:'eip155:8453'}}]);
  const codeHashes = Object.fromEntries([predecessorEscrow, predecessorCollector, predecessorRefund, predecessorToken].map(address => [address, predecessorCodeHash]));
  const network = {networkClass:'owned-fork', forkId:'h103010-disposable'};
  const rail = new CommercePaymentsRail(store, predecessorClient(sends), signer, 'machine-commerce-v1',
    {chain:'eip155:8453', escrow:predecessorEscrow, collector:predecessorCollector, refundCollector:predecessorRefund, token:predecessorToken, abi, codeHashes, network},
    async () => {}, 1n, assets);
  return {store, rail, attempts, sends};
}
function retained(store, proofId, budgetKey) {
  const id = `fund:${proofId}`;
  const tx = store.get('tx', id);
  const funding = store.get('funding', proofId);
  return {raw:tx.raw, binding:tx.binding, txId:tx.txId, nonce:store.all('nonce'), hold:store.get('native-budget', budgetKey).holds[id],
    authorizationTx:funding.authorizationTx, payment:funding.payment, allocation:store.get('funding-allocation', JSON.stringify([funding.quote.tenantId, funding.quote.canonicalTaskId]))};
}

test('predecessor recovery proves the stored quote identity', async () => {
  const planted = mkdtempSync(join(tmpdir(), 'h103010-planted-'));
  const plantedStore = new RailStore(join(planted, 'rail.sqlite'), {kind:'fork', forkId:'h103010-disposable'});
  const plantedProof = 'planted';
  const plantedData = '0xabcd';
  const plantedId = `fund:${plantedProof}`;
  const plantedBinding = digest({proofId:plantedProof, data:plantedData});
  plantedStore.put('tx', plantedId, {id:plantedId, binding:plantedBinding, phase:'signed', to:predecessorToken, data:plantedData, nonce:1, raw:'0x' + 'ee'.repeat(32), txId:'0x' + 'ff'.repeat(32)});
  const plantedSigner = {address:operator, async signTransaction(){ throw new Error('planted-sign'); }};
  const plantedCommitment = {operationId:'authorize-planted', quoteDigest:'11'.repeat(32), approvalDigest:'22'.repeat(32)};
  await assert.rejects(prepareIntent(plantedStore, plantedId, digest({proofId:plantedProof, data:plantedData, ...plantedCommitment}), client(), plantedSigner, predecessorToken, plantedData, identity({fundCommitment:plantedCommitment})), error => error.code === 'operation_conflict');
  assert.equal(plantedStore.get('tx', plantedId).binding, plantedBinding);
  plantedStore.close();
  rmSync(planted, {recursive:true, force:true});
  const cases = [
    ['aa861e980df0f75a782ff30996450cf15870f2e7', false],
    ['290414e614f781357d41565258f4666208f5d70b', true],
  ];
  const dirs = [];
  try {
    for (const [commit, crash] of cases) {
      const made = await producePredecessor(commit, crash);
      dirs.push(made.work);
      const clean = openCurrent(made.file);
      const beforeClean = retained(clean.store, made.proofId, made.budgetKey);
      const recovered = await clean.rail.authorize(made.proofId, '0x' + '00'.repeat(65), made.operationId);
      assert.equal(recovered.recovery, 'historical_unknown');
      assert.equal(recovered.broadcast, false);
      assert.equal(recovered.authorization, null);
      assert.equal(clean.attempts.n, 0);
      assert.equal(clean.sends.n, 0);
      assert.deepEqual(retained(clean.store, made.proofId, made.budgetKey), beforeClean);
      clean.store.close();
      const again = await producePredecessor(commit, crash);
      dirs.push(again.work);
      const bad = openCurrent(again.file);
      const funding = bad.store.get('funding', again.proofId);
      const allocationKey = JSON.stringify([funding.quote.tenantId, funding.quote.canonicalTaskId]);
      const originalAllocation = bad.store.get('funding-allocation', allocationKey);
      const originalOp = bad.store.get('funding-op', again.proofId);
      bad.store.put('funding', again.proofId, {...funding, quote:{...funding.quote, requesterId:'requester-hidden'}});
      const before = retained(bad.store, again.proofId, again.budgetKey);
      const refused = await bad.rail.authorize(again.proofId, '0x' + '00'.repeat(65), again.operationId);
      assert.equal(refused.recovery, 'historical_unknown');
      assert.equal(refused.broadcast, false);
      assert.equal(refused.authorization, null);
      assert.equal(bad.attempts.n, 0);
      assert.equal(bad.sends.n, 0);
      assert.deepEqual(retained(bad.store, again.proofId, again.budgetKey), before);
      bad.store.remove('funding-allocation', allocationKey);
      const missing = await bad.rail.authorize(again.proofId, '0x' + 'ab', again.operationId);
      assert.equal(missing.recovery, 'historical_unknown');
      assert.equal(bad.attempts.n, 0);
      assert.equal(bad.sends.n, 0);
      bad.store.put('funding-allocation', allocationKey, {proofId:again.proofId, quoteDigest:'ab'.repeat(32)});
      const mutatedAllocation = await bad.rail.authorize(again.proofId, '0x' + 'ab', again.operationId);
      assert.equal(mutatedAllocation.recovery, 'historical_unknown');
      bad.store.put('funding-allocation', allocationKey, originalAllocation);
      bad.store.put('funding', again.proofId, funding);
      bad.store.put('funding-op', again.proofId, {operationId:'authorize-changed-op'});
      const changedOp = await bad.rail.authorize(again.proofId, '0x' + 'ab', again.operationId);
      assert.equal(changedOp.recovery, 'historical_unknown');
      bad.store.put('funding-op', again.proofId, originalOp);
      const currentFunding = bad.store.get('funding', again.proofId);
      bad.store.put('funding', again.proofId, {...currentFunding, payment:{...currentFunding.payment, salt:(BigInt(currentFunding.payment.salt) + 1n).toString()}});
      const changedPayment = await bad.rail.authorize(again.proofId, '0x' + 'ab', again.operationId);
      assert.equal(changedPayment.recovery, 'historical_unknown');
      assert.equal(bad.attempts.n, 0);
      assert.equal(bad.sends.n, 0);
      assert.equal(retained(bad.store, again.proofId, again.budgetKey).raw, before.raw);
      assert.equal(retained(bad.store, again.proofId, again.budgetKey).binding, before.binding);
      bad.store.close();
      const reopened = openCurrent(again.file);
      const reopenedResult = await reopened.rail.authorize(again.proofId, '0x' + 'ab', again.operationId);
      assert.equal(reopenedResult.recovery, 'historical_unknown');
      assert.equal(reopened.attempts.n, 0);
      assert.equal(reopened.sends.n, 0);
      assert.equal(reopened.store.get('tx', `fund:${again.proofId}`).raw, before.raw);
      assert.equal(reopened.store.get('tx', `fund:${again.proofId}`).binding, before.binding);
      reopened.store.close();
    }
  } finally { for (const dir of dirs) rmSync(dir, {recursive:true, force:true}); }
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
  assert.equal(changed, 'vendor/hosted-wallet-market/client/accepted-work-source.mjs\n');
});
