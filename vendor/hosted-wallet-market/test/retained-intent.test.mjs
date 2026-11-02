// Direct rail recovery and send ownership. This does not use an HTTP idempotency cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeFunctionData, keccak256, parseTransaction } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { AssetRegistry, digest } from '../runtime/agent-economy-foundation/dist/index.js';
import { capturePlan } from '../runtime/agent-economy-rail/dist/fees.js';
import { RailStore } from '../runtime/agent-economy-rail/dist/store.js';
import { broadcast } from '../runtime/agent-economy-rail/dist/local-chain.js';
import { CommercePaymentsRail } from '../runtime/agent-economy-rail/dist/rail.js';
import { historicalAuthorityDigest } from '../src/machine-money.mjs';

const abi = JSON.parse(readFileSync(new URL('../runtime/agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json', import.meta.url), 'utf8'));
const code = '0x600160005260206000f3';
const codeHash = keccak256(code);
const token = '0x' + '11'.repeat(20);
const escrow = '0x' + '22'.repeat(20);
const collector = '0x' + '33'.repeat(20);
const refund = '0x' + '44'.repeat(20);
const receiver = '0x' + '55'.repeat(20);
const payer = '0x' + '66'.repeat(20);
const fee = '0x' + '77'.repeat(20);
const feeRecipient = '0x' + '11'.repeat(20);
const fees = { gasLimit: '100000', maxFeePerGas: '10', maxPriorityFeePerGas: '1' };
const forkId = 'h103010-disposable';

function chainClient(sends, extra = {}) {
  return {
    chain: { id: 8453 }, transport: { url: 'http://127.0.0.1:9' },
    async getChainId() { return 8453; },
    async request() { return '0x2105'; },
    async getTransactionCount() { return 0; },
    async estimateGas() { return 21000n; },
    async getBlock() { return { timestamp: BigInt(Math.floor(Date.now() / 1000)), number: 1n, hash: '0x' + 'ab'.repeat(32) }; },
    async getBlockNumber() { return 1n; },
    async getCode() { return code; },
    async readContract({ functionName }) { if (functionName === 'getHash') return '0x' + 'cd'.repeat(32); if (functionName === 'paymentState') return [false, 0n, 0n]; throw new Error('unread'); },
    async getTransactionReceipt() {
      if (extra.receipt) return extra.receipt;
      const missing = new Error('missing');
      missing.name = 'TransactionReceiptNotFoundError';
      throw missing;
    },
    async getTransaction() { return null; },
    async sendRawTransaction({ serializedTransaction }) { sends.n += 1; sends.raws.push(serializedTransaction); return keccak256(serializedTransaction); },
    async waitForTransactionReceipt() { return extra.wait ?? null; },
    async getContractEvents() { return []; },
    async getStorageAt() { return '0x' + '0'.repeat(64); },
  };
}

function obligations(store, proofId, budgetKey) {
  const id = `fund:${proofId}`;
  const tx = store.get('tx', id);
  const funding = store.get('funding', proofId);
  return {
    raw: tx?.raw ?? null, txId: tx?.txId ?? null, nonce: store.all('nonce'),
    hold: store.get('native-budget', budgetKey)?.holds?.[id] ?? null,
    budget: store.get('native-budget', budgetKey),
    allocation: store.get('funding-allocation', JSON.stringify([funding.quote.tenantId, funding.quote.canonicalTaskId])),
    payment: funding.payment, authorizationTx: funding.authorizationTx, operation: store.get('funding-op', proofId),
    debt: store.get('debt', proofId), retained: store.get('retained-intent', id),
  };
}

async function openRail(file, account, network, sends, signs) {
  const signer = { address: account.address, async signTransaction(tx) { signs.n += 1; if (signs.closed) throw new Error('recovery-must-not-sign'); return account.signTransaction(tx); } };
  const produced = { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' };
  const assets = new AssetRegistry('sandbox', [{ asset: produced, environment: 'sandbox', canonical: { asset: 'USDC', network: 'eip155:8453' } }]);
  const codeHashes = Object.fromEntries([escrow, collector, refund, token].map(address => [address, codeHash]));
  const rail = new CommercePaymentsRail(new RailStore(file, { kind: 'fork', forkId }), chainClient(sends), signer, 'machine-commerce-v1',
    { chain: 'eip155:8453', escrow, collector, refundCollector: refund, token, abi, codeHashes, network }, async () => {}, 1n, assets);
  return rail;
}

function networkFor(account, authorityDigest, epoch, lineage, manifest) {
  const operator = account.address.toLowerCase();
  return {
    networkClass: 'owned-fork', forkId, identityDigest: 'c'.repeat(64), abiDigest: 'd'.repeat(64), grantEpoch: epoch, authorityDigest, operator,
    ...(lineage ? { historicalLineage: lineage } : {}),
    ...(manifest ? { historicalRetainedIntents: manifest } : {}),
    feeLimits: { gasLimit: 100000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n },
    feeQuote: { baseFee: 1n, suggestedPriority: 1n, operatorFeeAtGasLimit: 0n, l1FeeUpperBound: 0n, l1Fee: 0n, source: 'disposable', block: '1', upgrade: 'unknown' },
    nativeBudgetKey: 'budget-retained', nativeBudgetRemaining: 1000000000000n,
    async authorizeIntent() {},
  };
}

async function produce() {
  const account = privateKeyToAccount(generatePrivateKey());
  const operator = account.address.toLowerCase();
  const bound = { origin: 'https://machine.example', tenant: 'pilot', profile: 'machine-market', source: 'a'.repeat(64), host: 'b'.repeat(64), network: 'c'.repeat(64), executionClass: 'owned-fork', forkId, operator, feeRecipient, epoch: 1, feeLimits: fees };
  const authorityDigest = historicalAuthorityDigest(bound);
  const lineage = [{ schema: 'pilot.historical-authority-lineage.v1', configuredChain: 'eip155:8453', abiDigest: 'd'.repeat(64), bound }];
  const dir = mkdtempSync(join(tmpdir(), 'h115010-retained-'));
  const file = join(dir, 'rail.sqlite');
  const store = new RailStore(file, { kind: 'fork', forkId });
  store.put('native-budget', 'budget-retained', { remaining: '1000000000000', spent: '0', holds: {}, unknown: [] });
  store.close();
  const sends = { n: 0, raws: [] };
  const signs = { n: 0, closed: false };
  const network = networkFor(account, authorityDigest, 1);
  const rail = await openRail(file, account, network, sends, signs);
  const now = Math.floor(Date.now() / 1000);
  const pay = { operator: account.address, payer, receiver, token, maxAmount: 1000000n, preApprovalExpiry: now + 86400, authorizationExpiry: now + 172800, refundExpiry: now + 259200, minFeeBps: 500, maxFeeBps: 500, feeReceiver: fee, salt: 100n };
  const plan = capturePlan(['1000000']);
  const quote = { schemaVersion: 'pilot.agent-economy.v2', quoteId: 'quote-retained', tenantId: 'tenant-retained', taskId: 'task-retained', canonicalTaskId: 'canon-retained',
    taskVersion: 1, termsVersion: 'terms1', requesterId: 'requester1', evaluatorId: 'evaluator1', contributorId: 'contributor1',
    payoutDestination: receiver, fundingAuthorityId: 'machine-commerce-v1', settlementAuthorityId: 'settlement-v1',
    asset: { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' }, gross: '1000000', contributorNet: plan.net, platformFee: plan.feeAmount, subsidy: '0',
    fee: { schemaVersion: 'pilot.agent-economy.v2', bps: 500, basis: 'new_job_gross', profile: { id: 'commerce-payments-v1.1.0-single-capture', rounding: 'per_capture_floor', mode: 'single_capture', escrow: rail.protocol } },
    rail: { mode: 'deduct_gross', costCap: '0' }, fundingTarget: escrow, expiresAt: new Date((pay.preApprovalExpiry - 60) * 1000).toISOString(),
    rules: { partial: 'accepted_gross_only', refund: 'unaccepted_gross_only', dispute: 'hold_until_authoritative_resolution', reversal: 'reconcile_without_repricing_earned_obligation', rightsTermsRef: 'terms1' },
    feeRecipient: fee };
  const proofId = await rail.bindQuote(quote, pay);
  rail.store.put('debt', proofId, { amount: '4', status: 'open' });
  const operationId = 'authorize-original';
  const signature = '0x' + '12'.repeat(65);
  await rail.authorize(proofId, signature, operationId);
  const kept = obligations(rail.store, proofId, 'budget-retained');
  assert.equal(signs.n, 1);
  assert.equal(sends.n, 1);
  assert.equal(kept.retained.schema, 'pilot.retained-intent.v1');
  assert.equal(kept.retained.payerSignature, signature);
  assert.equal(kept.retained.txId, kept.txId);
  assert.equal(kept.authorizationTx, kept.txId);
  rail.store.close();
  return { dir, file, account, proofId, operationId, signature, authorityDigest, lineage, bound, kept, sends, signs };
}

function reopen(made, network, sends = { n: 0, raws: [] }) {
  made.signs.closed = true;
  return openRail(made.file, made.account, network, sends, made.signs);
}

test('current generation recovers the original bytes without a new signature or a lineage entry', async () => {
  const made = await produce();
  try {
    const sends = { n: 0, raws: [] };
    const rail = await reopen(made, networkFor(made.account, made.authorityDigest, 1), sends);
    const before = obligations(rail.store, made.proofId, 'budget-retained');
    const again = await rail.authorize(made.proofId, '0x' + '00'.repeat(65), made.operationId);
    assert.equal(again.recovery, undefined);
    assert.equal(made.signs.n, 1);
    assert.equal(sends.n, 0);
    const after = obligations(rail.store, made.proofId, 'budget-retained');
    assert.equal(after.raw, before.raw);
    assert.equal(after.authorizationTx, before.txId);
    assert.equal(after.hold, before.hold);
    assert.deepEqual(after.debt, before.debt);
    assert.deepEqual(after.allocation, before.allocation);
    assert.deepEqual(after.payment, before.payment);
    rail.store.close();
    const closed = new RailStore(made.file, { kind: 'fork', forkId });
    const reopenedRail = await reopen(made, networkFor(made.account, made.authorityDigest, 1), sends);
    closed.close();
    const third = await reopenedRail.authorize(made.proofId, '0x' + '00'.repeat(65), made.operationId);
    assert.equal(third.recovery, undefined);
    assert.equal(sends.n, 0);
    assert.equal(made.signs.n, 1);
    assert.equal(reopenedRail.store.get('tx', `fund:${made.proofId}`).raw, before.raw);
    reopenedRail.store.close();
  } finally { rmSync(made.dir, { recursive: true, force: true }); }
});

test('a crash after the raw is durable recovers once and does not allocate again', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const operator = account.address.toLowerCase();
  const bound = { origin: 'https://machine.example', tenant: 'pilot', profile: 'machine-market', source: 'a'.repeat(64), host: 'b'.repeat(64), network: 'c'.repeat(64), executionClass: 'owned-fork', forkId, operator, feeRecipient, epoch: 1, feeLimits: fees };
  const authorityDigest = historicalAuthorityDigest(bound);
  const dir = mkdtempSync(join(tmpdir(), 'h115010-crash-'));
  try {
    const file = join(dir, 'rail.sqlite');
    const primed = new RailStore(file, { kind: 'fork', forkId });
    primed.put('native-budget', 'budget-retained', { remaining: '1000000000000', spent: '0', holds: {}, unknown: [] });
    primed.close();
    const sends = { n: 0, raws: [] };
    const signs = { n: 0, closed: false };
    const rail = await openRail(file, account, networkFor(account, authorityDigest, 1), sends, signs);
    const now = Math.floor(Date.now() / 1000);
    const pay = { operator: account.address, payer, receiver, token, maxAmount: 1000000n, preApprovalExpiry: now + 86400, authorizationExpiry: now + 172800, refundExpiry: now + 259200, minFeeBps: 500, maxFeeBps: 500, feeReceiver: fee, salt: 101n };
    const plan = capturePlan(['1000000']);
    const quote = { schemaVersion: 'pilot.agent-economy.v2', quoteId: 'quote-crash', tenantId: 'tenant-crash', taskId: 'task-crash', canonicalTaskId: 'canon-crash',
      taskVersion: 1, termsVersion: 'terms1', requesterId: 'requester1', evaluatorId: 'evaluator1', contributorId: 'contributor1',
      payoutDestination: receiver, fundingAuthorityId: 'machine-commerce-v1', settlementAuthorityId: 'settlement-v1',
      asset: { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' }, gross: '1000000', contributorNet: plan.net, platformFee: plan.feeAmount, subsidy: '0',
      fee: { schemaVersion: 'pilot.agent-economy.v2', bps: 500, basis: 'new_job_gross', profile: { id: 'commerce-payments-v1.1.0-single-capture', rounding: 'per_capture_floor', mode: 'single_capture', escrow: rail.protocol } },
      rail: { mode: 'deduct_gross', costCap: '0' }, fundingTarget: escrow, expiresAt: new Date((pay.preApprovalExpiry - 60) * 1000).toISOString(),
      rules: { partial: 'accepted_gross_only', refund: 'unaccepted_gross_only', dispute: 'hold_until_authoritative_resolution', reversal: 'reconcile_without_repricing_earned_obligation', rightsTermsRef: 'terms1' },
      feeRecipient: fee };
    const proofId = await rail.bindQuote(quote, pay);
    rail.store.put('debt', proofId, { amount: '9', status: 'open' });
    const put = rail.store.put.bind(rail.store);
    rail.store.put = (space, key, value) => { if (space === 'funding' && value?.authorizationTx) throw Object.assign(new Error('crash_before_funding_update'), { code: 'crash_before_funding_update' }); return put(space, key, value); };
    await assert.rejects(() => rail.authorize(proofId, '0x' + '12'.repeat(65), 'authorize-crash'), error => error.code === 'crash_before_funding_update');
    rail.store.put = put;
    assert.equal(signs.n, 1);
    assert.equal(sends.n, 0);
    assert.equal(rail.store.get('funding', proofId).authorizationTx, null);
    assert.equal(rail.store.get('retained-intent', `fund:${proofId}`).txId, rail.store.get('tx', `fund:${proofId}`).txId);
    const before = obligations(rail.store, proofId, 'budget-retained');
    signs.closed = true;
    const recovered = await rail.authorize(proofId, '0x' + '00'.repeat(65), 'authorize-crash');
    assert.equal(recovered.recovery, undefined);
    assert.equal(signs.n, 1);
    assert.equal(sends.n, 1);
    assert.equal(sends.raws[0], before.raw);
    const after = obligations(rail.store, proofId, 'budget-retained');
    assert.equal(after.authorizationTx, before.txId);
    assert.equal(after.hold, before.hold);
    assert.deepEqual(after.allocation, before.allocation);
    assert.deepEqual(after.debt, before.debt);
    assert.equal(rail.store.all('funding-allocation').length, 1);
    rail.store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('altered envelopes, swapped intent, and a changed epoch stay unknown', async () => {
  const made = await produce();
  try {
    async function refuse(label, edit, caller = made.operationId, network = networkFor(made.account, made.authorityDigest, 1, made.lineage)) {
      const sends = { n: 0, raws: [] };
      const rail = await reopen(made, network, sends);
      if (edit) await edit(rail.store, made.account);
      rail.store.remove('broadcast-attempt', rail.store.get('tx', `fund:${made.proofId}`).txId);
      const before = obligations(rail.store, made.proofId, 'budget-retained');
      const result = await rail.authorize(made.proofId, '0x' + '00'.repeat(65), caller);
      const after = obligations(rail.store, made.proofId, 'budget-retained');
      assert.equal(result.recovery, 'historical_unknown', label);
      assert.equal(result.broadcast, false, label);
      assert.equal(result.authorization, null, label);
      assert.equal(sends.n, 0, label);
      assert.equal(made.signs.n, 1, label);
      assert.equal(after.raw, before.raw, label);
      assert.deepEqual(after.nonce, before.nonce, label);
      assert.equal(after.hold, before.hold, label);
      assert.deepEqual(after.allocation, before.allocation, label);
      assert.deepEqual(after.payment, before.payment, label);
      assert.deepEqual(after.debt, before.debt, label);
      assert.deepEqual(after.operation, before.operation, label);
      assert.equal(after.authorizationTx, before.authorizationTx, label);
      rail.store.close();
    }
    async function rewrite(store, account, fields, data) {
      const id = `fund:${made.proofId}`;
      const tx = store.get('tx', id);
      const calldata = data ?? tx.data;
      const raw = await account.signTransaction({ chainId: fields.chainId ?? 8453, type: 'eip1559', nonce: fields.nonce ?? tx.nonce, gas: fields.gas ?? 100000n, maxFeePerGas: fields.maxFeePerGas ?? 10n, maxPriorityFeePerGas: fields.maxPriorityFeePerGas ?? 1n, to: escrow, data: calldata, value: fields.value ?? 0n });
      const funding = store.get('funding', made.proofId);
      store.put('tx', id, { ...tx, data: calldata, raw, txId: keccak256(raw), nonce: fields.nonce ?? tx.nonce });
      store.put('funding', made.proofId, { ...funding, authorizationTx: keccak256(raw) });
    }
    await refuse('altered-chain', (store, account) => rewrite(store, account, { chainId: 84532 }));
    await refuse('altered-nonce', (store, account) => rewrite(store, account, { nonce: 9 }));
    await refuse('altered-value', (store, account) => rewrite(store, account, { value: 1n }));
    await refuse('altered-gas', (store, account) => rewrite(store, account, { gas: 200000n }));
    await refuse('altered-max-fee', (store, account) => rewrite(store, account, { maxFeePerGas: 99n }));
    await refuse('altered-priority-fee', (store, account) => rewrite(store, account, { maxPriorityFeePerGas: 7n }));
    await refuse('current-raw-old-witness', async (store, account) => {
      const id = `fund:${made.proofId}`;
      const tx = store.get('tx', id);
      const raw = await account.signTransaction({ chainId: 8453, type: 'eip1559', nonce: tx.nonce, gas: 180000n, maxFeePerGas: 50n, maxPriorityFeePerGas: 4n, to: escrow, data: tx.data, value: 0n });
      store.put('tx', id, { ...tx, raw, txId: keccak256(raw), witness: { ...tx.witness, grantEpoch: 1, authorityDigest: made.authorityDigest } });
      const funding = store.get('funding', made.proofId);
      store.put('funding', made.proofId, { ...funding, authorizationTx: keccak256(raw) });
    }, made.operationId, networkFor(made.account, 'e'.repeat(64), 2, made.lineage));
    await refuse('changed-operation-and-caller', store => {
      store.put('funding-op', made.proofId, { operationId: 'authorize-attacker' });
    }, 'authorize-attacker');
    await refuse('payer-signature-substitution', async (store, account) => {
      const funding = store.get('funding', made.proofId);
      const payment = { ...funding.payment, maxAmount: BigInt(funding.payment.maxAmount), salt: BigInt(funding.payment.salt) };
      const data = encodeFunctionData({ abi, functionName: 'authorize', args: [payment, BigInt(funding.quote.gross), collector, '0x' + 'ab'.repeat(65)] });
      await rewrite(store, account, {}, data);
    });
    await refuse('changed-epoch-without-lineage', () => {}, made.operationId, networkFor(made.account, 'e'.repeat(64), 4));
    const parsed = parseTransaction(made.kept.raw);
    assert.equal(parsed.chainId, 8453);
    assert.equal(parsed.value ?? 0n, 0n);
  } finally { rmSync(made.dir, { recursive: true, force: true }); }
});

test('historical recovery uses the retained association and refuses a synthesized journal', async () => {
  const made = await produce();
  try {
    const historical = networkFor(made.account, 'e'.repeat(64), 2, made.lineage);
    const sends = { n: 0, raws: [] };
    const rail = await reopen(made, historical, sends);
    const id = `fund:${made.proofId}`;
    const funding = rail.store.get('funding', made.proofId);
    rail.store.put('funding', made.proofId, { ...funding, authorizationTx: null, stage: 'signature' });
    rail.store.remove('broadcast-attempt', made.kept.txId);
    const before = obligations(rail.store, made.proofId, 'budget-retained');
    const recovered = await rail.authorize(made.proofId, '0x' + '00'.repeat(65), made.operationId);
    assert.equal(recovered.recovery, undefined);
    assert.equal(sends.n, 1);
    assert.equal(sends.raws[0], before.raw);
    assert.equal(made.signs.n, 1);
    assert.equal(rail.store.get('funding', made.proofId).authorizationTx, before.txId);
    rail.store.close();
    const manifest = [made.kept.retained];
    const manifestSends = { n: 0, raws: [] };
    const manifestRail = await reopen(made, networkFor(made.account, 'e'.repeat(64), 2, made.lineage, manifest), manifestSends);
    manifestRail.store.remove('retained-intent', id);
    manifestRail.store.put('funding', made.proofId, { ...manifestRail.store.get('funding', made.proofId), authorizationTx: null, stage: 'signature' });
    manifestRail.store.remove('broadcast-attempt', made.kept.txId);
    const manifestResult = await manifestRail.authorize(made.proofId, '0x' + '00'.repeat(65), made.operationId);
    assert.equal(manifestResult.recovery, undefined);
    assert.equal(manifestSends.n, 1);
    assert.equal(manifestSends.raws[0], made.kept.raw);
    manifestRail.store.close();
    const plantedSends = { n: 0, raws: [] };
    const planted = await reopen(made, networkFor(made.account, 'e'.repeat(64), 2, made.lineage, manifest), plantedSends);
    const original = planted.store.get('retained-intent', id) ?? made.kept.retained;
    planted.store.put('retained-intent', id, { ...original, txId: '0x' + '12'.repeat(32) });
    planted.store.put('funding', made.proofId, { ...planted.store.get('funding', made.proofId), authorizationTx: null });
    planted.store.remove('broadcast-attempt', made.kept.txId);
    const disagreed = await planted.authorize(made.proofId, '0x' + '00'.repeat(65), made.operationId);
    assert.equal(disagreed.recovery, 'historical_unknown');
    assert.equal(plantedSends.n, 0);
    planted.store.close();
    const ignoredSends = { n: 0, raws: [] };
    const ignored = await reopen(made, networkFor(made.account, made.authorityDigest, 1, null, manifest), ignoredSends);
    ignored.store.remove('retained-intent', id);
    ignored.store.put('funding', made.proofId, { ...ignored.store.get('funding', made.proofId), authorizationTx: null });
    ignored.store.remove('broadcast-attempt', made.kept.txId);
    const currentWithoutJournal = await ignored.authorize(made.proofId, '0x' + '00'.repeat(65), made.operationId);
    assert.equal(currentWithoutJournal.recovery, 'historical_unknown');
    assert.equal(ignoredSends.n, 0);
    ignored.store.close();
  } finally { rmSync(made.dir, { recursive: true, force: true }); }
});

test('one claimant sends, and a late unknown cannot overwrite observed', async () => {
  const made = await produce();
  try {
    const store = new RailStore(made.file, { kind: 'fork', forkId });
    const other = new RailStore(made.file, { kind: 'fork', forkId });
    const tx = store.get('tx', `fund:${made.proofId}`);
    store.remove('broadcast-attempt', tx.txId);
    const intent = tx;
    const identity = { ...networkFor(made.account, made.authorityDigest, 1), configuredChain: 'eip155:8453', escrow, asset: { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' }, assets: new AssetRegistry('sandbox', [{ asset: { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' }, environment: 'sandbox', canonical: { asset: 'USDC', network: 'eip155:8453' } }]), codeHashes: Object.fromEntries([escrow, collector, refund, token].map(address => [address, codeHash])) };
    const sends = { n: 0, raws: [] };
    let second;
    const client = chainClient(sends, { wait: { transactionHash: tx.txId, status: 'success' } });
    client.sendRawTransaction = async () => {
      sends.n += 1;
      if (sends.n === 1) second = broadcast(client, intent, { ...identity, broadcastStore: other });
      if (sends.n === 1) await second;
      return tx.txId;
    };
    await Promise.all([
      broadcast(client, intent, { ...identity, broadcastStore: store }),
      broadcast(client, intent, { ...identity, broadcastStore: other }),
    ]);
    assert.equal(sends.n, 1);
    assert.equal(store.get('broadcast-attempt', tx.txId).state, 'observed');
    store.close();
    other.close();
    const same = new RailStore(made.file, { kind: 'fork', forkId });
    same.remove('broadcast-attempt', tx.txId);
    const sameSends = { n: 0, raws: [] };
    const sameClient = chainClient(sameSends, { wait: { transactionHash: tx.txId, status: 'success', logs: [] } });
    await Promise.all([
      broadcast(sameClient, intent, { ...identity, broadcastStore: same }),
      broadcast(sameClient, intent, { ...identity, broadcastStore: same }),
    ]);
    assert.equal(sameSends.n, 1);
    assert.equal(same.get('broadcast-attempt', tx.txId).state, 'observed');
    same.close();
  } finally { rmSync(made.dir, { recursive: true, force: true }); }
});

test('receipt discovery promotes unknown and wallet broadcast stays unjournaled', async () => {
  const made = await produce();
  try {
    const store = new RailStore(made.file, { kind: 'fork', forkId });
    const tx = store.get('tx', `fund:${made.proofId}`);
    store.put('broadcast-attempt', tx.txId, { state: 'unknown', txId: tx.txId });
    const sends = { n: 0, raws: [] };
    const assets = new AssetRegistry('sandbox', [{ asset: { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' }, environment: 'sandbox', canonical: { asset: 'USDC', network: 'eip155:8453' } }]);
    const identity = { ...networkFor(made.account, made.authorityDigest, 1), configuredChain: 'eip155:8453', escrow, broadcastStore: store, asset: { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' }, assets, codeHashes: Object.fromEntries([escrow, collector, refund, token].map(address => [address, codeHash])) };
    const found = await broadcast(chainClient(sends, { receipt: { transactionHash: tx.txId, status: 'success', logs: [] } }), tx, identity);
    assert.equal(found.status, 'success');
    assert.equal(sends.n, 0);
    assert.equal(store.get('broadcast-attempt', tx.txId).state, 'observed');
    const quiet = { n: 0, raws: [] };
    const blocked = await broadcast(chainClient(quiet), { ...tx, witness: undefined }, { ...identity, broadcastStore: store });
    assert.equal(blocked, null);
    assert.equal(quiet.n, 0);
    store.close();
    const walletSends = { n: 0, raws: [] };
    const walletAssets = new AssetRegistry('sandbox', [{ asset: { chain: 'eip155:31337', token, decimals: 6, symbol: 'USDC' }, environment: 'sandbox', canonical: { asset: 'USDC', network: 'eip155:31337' } }]);
    const walletClient = { chain: { id: 31337 }, transport: { url: 'http://127.0.0.1:9' }, async getChainId() { return 31337; }, async request() { return '0x7a69'; }, async getTransactionReceipt() { return null; }, async getTransaction() { return null; }, async sendRawTransaction() { walletSends.n += 1; return '0x' + '11'.repeat(32); }, async waitForTransactionReceipt() { return null; } };
    await broadcast(walletClient, { id: 'wallet:one', txId: '0x' + '22'.repeat(32), raw: '0x02' }, { configuredChain: 'eip155:31337', asset: { chain: 'eip155:31337', token, decimals: 6, symbol: 'USDC' }, assets: walletAssets });
    assert.equal(walletSends.n, 1);
  } finally { rmSync(made.dir, { recursive: true, force: true }); }
});

test('clean process import keeps the rail and money modules distinct from a second ledger', async () => {
  const money = await import('../src/machine-money.mjs');
  const rail = await import('../runtime/agent-economy-rail/dist/rail.js');
  const chain = await import('../runtime/agent-economy-rail/dist/local-chain.js');
  assert.equal(typeof money.retainedFundRecoveryAccepts, 'function');
  assert.equal(typeof rail.CommercePaymentsRail, 'function');
  assert.equal(typeof chain.broadcast, 'function');
  assert.equal(money.RETAINED_INTENT_SCHEMA, 'pilot.retained-intent.v1');
});
