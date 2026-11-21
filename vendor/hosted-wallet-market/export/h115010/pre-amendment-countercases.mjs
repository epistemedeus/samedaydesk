// Causal pre-amendment countercases against the received SDS tip.
// This file imports the unmodified money/rail modules and records what they do.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { AssetRegistry, digest } from '../../runtime/agent-economy-foundation/dist/index.js';
import { capturePlan } from '../../runtime/agent-economy-rail/dist/fees.js';
import { RailStore } from '../../runtime/agent-economy-rail/dist/store.js';
import { broadcast } from '../../runtime/agent-economy-rail/dist/local-chain.js';
import { CommercePaymentsRail } from '../../runtime/agent-economy-rail/dist/rail.js';
import { historicalAuthorityDigest } from '../../src/machine-money.mjs';

const abi = JSON.parse(readFileSync(new URL('../../runtime/agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json', import.meta.url), 'utf8'));
const code = '0x600160005260206000f3';
const codeHash = keccak256(code);
const token = '0x' + '11'.repeat(20);
const escrow = '0x' + '22'.repeat(20);
const collector = '0x' + '33'.repeat(20);
const refund = '0x' + '44'.repeat(20);
const receiver = '0x' + '55'.repeat(20);
const payer = '0x' + '66'.repeat(20);
const fee = '0x' + '77'.repeat(20);
const fees = { gasLimit: '100000', maxFeePerGas: '10', maxPriorityFeePerGas: '1' };
const out = [];
function record(name, body) {
  out.push({ name, ...body });
  process.stdout.write(JSON.stringify({ name, ...body }) + '\n');
}

function client(sends, opts = {}) {
  return {
    chain: { id: opts.chainId ?? 8453 }, transport: { url: 'http://127.0.0.1:9' },
    async getChainId() { return opts.chainId ?? 8453; },
    async request() { return opts.chainHex ?? '0x2105'; },
    async getTransactionCount() { return 0; },
    async estimateGas() { return 21000n; },
    async getBlock() { return { timestamp: BigInt(Math.floor(Date.now() / 1000)), number: 1n, hash: '0x' + 'ab'.repeat(32) }; },
    async getBlockNumber() { return 1n; },
    async getCode() { return code; },
    async readContract({ functionName }) { if (functionName === 'getHash') return '0x' + 'cd'.repeat(32); throw new Error('unread'); },
    async getTransactionReceipt() { return opts.receipt ?? null; },
    async getTransaction() { return opts.transaction === undefined ? null : opts.transaction; },
    async sendRawTransaction({ serializedTransaction }) { sends.n += 1; sends.raws.push(serializedTransaction); return keccak256(serializedTransaction); },
    async waitForTransactionReceipt() { return opts.waitReceipt ?? null; },
    async getContractEvents() { return []; },
    async getStorageAt() { return '0x' + '0'.repeat(64); },
  };
}

function quoteFor(rail, account, salt) {
  const now = Math.floor(Date.now() / 1000);
  const pay = { operator: account.address, payer, receiver, token, maxAmount: 1000000n, preApprovalExpiry: now + 86400, authorizationExpiry: now + 172800, refundExpiry: now + 259200, minFeeBps: 500, maxFeeBps: 500, feeReceiver: fee, salt };
  const plan = capturePlan(['1000000']);
  const name = salt.toString();
  const produced = { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' };
  const quote = { schemaVersion: 'pilot.agent-economy.v2', quoteId: `quote${name}`, tenantId: `tenant${name}`, taskId: `task${name}`, canonicalTaskId: `canon${name}`,
    taskVersion: 1, termsVersion: 'terms1', requesterId: 'requester1', evaluatorId: 'evaluator1', contributorId: 'contributor1',
    payoutDestination: receiver, fundingAuthorityId: 'machine-commerce-v1', settlementAuthorityId: 'settlement-v1',
    asset: produced, gross: '1000000', contributorNet: plan.net, platformFee: plan.feeAmount, subsidy: '0',
    fee: { schemaVersion: 'pilot.agent-economy.v2', bps: 500, basis: 'new_job_gross', profile: { id: 'commerce-payments-v1.1.0-single-capture', rounding: 'per_capture_floor', mode: 'single_capture', escrow: rail.protocol } },
    rail: { mode: 'deduct_gross', costCap: '0' }, fundingTarget: escrow, expiresAt: new Date((pay.preApprovalExpiry - 60) * 1000).toISOString(),
    rules: { partial: 'accepted_gross_only', refund: 'unaccepted_gross_only', dispute: 'hold_until_authoritative_resolution', reversal: 'reconcile_without_repricing_earned_obligation', rightsTermsRef: 'terms1' },
    feeRecipient: fee };
  return { quote, pay };
}

async function sign(account, fields) {
  return account.signTransaction({ chainId: fields.chainId ?? 8453, type: 'eip1559', nonce: fields.nonce ?? 0, gas: fields.gas ?? 100000n, maxFeePerGas: fields.maxFeePerGas ?? 10n, maxPriorityFeePerGas: fields.maxPriorityFeePerGas ?? 1n, to: fields.to ?? escrow, data: fields.data, value: fields.value ?? 0n });
}

function snap(store, proofId, budgetKey) {
  const id = `fund:${proofId}`;
  const tx = store.get('tx', id);
  const funding = store.get('funding', proofId);
  return {
    raw: tx?.raw ?? null, txId: tx?.txId ?? null, binding: tx?.binding ?? null, nonce: store.all('nonce'),
    hold: store.get('native-budget', budgetKey)?.holds?.[id] ?? null,
    budget: store.get('native-budget', budgetKey),
    allocation: store.get('funding-allocation', JSON.stringify([funding.quote.tenantId, funding.quote.canonicalTaskId])),
    funding: { authorizationTx: funding.authorizationTx, stage: funding.stage, payment: funding.payment, quoteDigest: digest(funding.quote) },
    operation: store.get('funding-op', proofId),
    debt: store.get('debt', proofId),
    attempt: tx?.txId ? store.get('broadcast-attempt', tx.txId) : null,
  };
}

async function main() {
  const account = privateKeyToAccount(generatePrivateKey());
  const operator = account.address.toLowerCase();
  const identityDigest = 'c'.repeat(64);
  const abiDigest = 'd'.repeat(64);
  const bound = { origin: 'https://machine.example', tenant: 'pilot', profile: 'machine-market', source: 'a'.repeat(64), host: 'b'.repeat(64), network: identityDigest, executionClass: 'owned-fork', forkId: 'h103010-disposable', operator, feeRecipient: '0x' + '11'.repeat(20), epoch: 1, feeLimits: fees };
  const authorityDigest = historicalAuthorityDigest(bound);
  const lineage = [{ schema: 'pilot.historical-authority-lineage.v1', configuredChain: 'eip155:8453', abiDigest, bound }];
  const dir = mkdtempSync(join(tmpdir(), 'h115010-pre-'));
  const file = join(dir, 'rail.sqlite');
  const store = new RailStore(file, { kind: 'fork', forkId: 'h103010-disposable' });
  const budgetKey = 'budget-pre';
  store.put('native-budget', budgetKey, { remaining: '1000000000000', spent: '0', holds: {}, unknown: [] });
  const sends = { n: 0, raws: [] };
  let signs = 0;
  const signer = { address: account.address, async signTransaction(tx) { signs += 1; return account.signTransaction(tx); } };
  const produced = { chain: 'eip155:8453', token, decimals: 6, symbol: 'USDC' };
  const assets = new AssetRegistry('sandbox', [{ asset: produced, environment: 'sandbox', canonical: { asset: 'USDC', network: 'eip155:8453' } }]);
  const codeHashes = Object.fromEntries([escrow, collector, refund, token].map(address => [address, codeHash]));
  const network = { networkClass: 'owned-fork', forkId: 'h103010-disposable', identityDigest, abiDigest, grantEpoch: 1, authorityDigest, historicalLineage: lineage,
    feeLimits: { gasLimit: 100000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n },
    feeQuote: { baseFee: 1n, suggestedPriority: 1n, operatorFeeAtGasLimit: 0n, l1FeeUpperBound: 0n, l1Fee: 0n, source: 'disposable', block: '1', upgrade: 'unknown' },
    nativeBudgetKey: budgetKey, nativeBudgetRemaining: 1000000000000n };
  const rail = new CommercePaymentsRail(store, client(sends), signer, 'machine-commerce-v1', { chain: 'eip155:8453', escrow, collector, refundCollector: refund, token, abi, codeHashes, network }, async () => {}, 1n, assets);
  const signature = '0x' + '12'.repeat(65);
  const { quote, pay } = quoteFor(rail, account, 100n);
  const proofId = await rail.bindQuote(quote, pay);
  const operationId = 'authorize-original';
  store.put('debt', proofId, { amount: '1', status: 'open' });
  const first = await rail.authorize(proofId, signature, operationId);
  const parsed = parseTransaction(store.get('tx', `fund:${proofId}`).raw);
  record('baseline-sign', { signs, sends: sends.n, recovery: first.recovery ?? null, state: first.state ?? null, chainId: parsed.chainId, nonce: parsed.nonce, value: String(parsed.value ?? 0n), gas: String(parsed.gas), maxFeePerGas: String(parsed.maxFeePerGas), maxPriorityFeePerGas: String(parsed.maxPriorityFeePerGas), type: parsed.type, signer: (await recoverTransactionAddress({ serializedTransaction: store.get('tx', `fund:${proofId}`).raw })).toLowerCase() });
  const baseline = snap(store, proofId, budgetKey);
  store.close();

  async function replay(label, edit, caller = operationId) {
    const copy = join(dir, label + '.sqlite');
    const { copyFileSync } = await import('node:fs');
    copyFileSync(file, copy);
    const next = new RailStore(copy, { kind: 'fork', forkId: 'h103010-disposable' });
    const localSends = { n: 0, raws: [] };
    let localSigns = 0;
    const localSigner = { address: account.address, async signTransaction() { localSigns += 1; throw new Error('resigned'); } };
    if (edit) await edit(next, account);
    const before = snap(next, proofId, budgetKey);
    const localRail = new CommercePaymentsRail(next, client(localSends), localSigner, 'machine-commerce-v1', { chain: 'eip155:8453', escrow, collector, refundCollector: refund, token, abi, codeHashes, network }, async () => {}, 1n, assets);
    let result = null;
    let error = null;
    try { result = await localRail.authorize(proofId, signature, caller); }
    catch (caught) { error = caught.code || caught.message; }
    const after = snap(next, proofId, budgetKey);
    let parsedFields = null;
    try {
      const raw = next.get('tx', `fund:${proofId}`).raw;
      const body = parseTransaction(raw);
      parsedFields = { chainId: body.chainId, nonce: body.nonce, value: String(body.value ?? 0n), gas: String(body.gas), maxFeePerGas: String(body.maxFeePerGas), maxPriorityFeePerGas: String(body.maxPriorityFeePerGas), signer: (await recoverTransactionAddress({ serializedTransaction: raw })).toLowerCase() };
    } catch (caught) { parsedFields = { error: caught.message }; }
    record(label, { error, recovery: result?.recovery ?? null, state: result?.state ?? null, broadcast: result?.broadcast ?? null, signs: localSigns, sends: localSends.n, sentRawMatchesStored: localSends.raws[0] ? localSends.raws[0] === after.raw : null, parsed: parsedFields, preserved: JSON.stringify({ raw: before.raw, nonce: before.nonce, hold: before.hold, allocation: before.allocation, debt: before.debt, payment: before.funding.payment }) === JSON.stringify({ raw: after.raw, nonce: after.nonce, hold: after.hold, allocation: after.allocation, debt: after.debt, payment: after.funding.payment }), authorizationBefore: before.funding.authorizationTx, authorizationAfter: after.funding.authorizationTx });
    next.close();
  }

  async function rewrite(next, account, fields, data) {
    const id = `fund:${proofId}`;
    const tx = next.get('tx', id);
    const calldata = data ?? tx.data;
    const raw = await sign(account, { ...fields, data: calldata, to: escrow });
    const binding = digest({ proofId, data: calldata });
    next.put('tx', id, { ...tx, data: calldata, raw, txId: keccak256(raw), binding, nonce: fields.nonce ?? tx.nonce });
    const funding = next.get('funding', proofId);
    next.put('funding', proofId, { ...funding, authorizationTx: null, stage: 'signature' });
  }

  await replay('altered-chain', (next, account) => rewrite(next, account, { chainId: 84532 }));
  await replay('altered-nonce', (next, account) => rewrite(next, account, { nonce: 9 }));
  await replay('altered-value', (next, account) => rewrite(next, account, { value: 1n }));
  await replay('altered-gas', (next, account) => rewrite(next, account, { gas: 200000n }));
  await replay('altered-max-fee', (next, account) => rewrite(next, account, { maxFeePerGas: 99n }));
  await replay('altered-priority-fee', (next, account) => rewrite(next, account, { maxPriorityFeePerGas: 7n }));
  await replay('current-raw-old-witness', async (next, account) => {
    const id = `fund:${proofId}`;
    const tx = next.get('tx', id);
    const raw = await sign(account, { data: tx.data, gas: 180000n, maxFeePerGas: 50n, maxPriorityFeePerGas: 4n });
    next.put('tx', id, { ...tx, raw, txId: keccak256(raw) });
    const funding = next.get('funding', proofId);
    next.put('funding', proofId, { ...funding, authorizationTx: null, stage: 'signature' });
  });
  await replay('changed-operation-and-caller', next => {
    next.put('funding-op', proofId, { operationId: 'authorize-attacker' });
    const funding = next.get('funding', proofId);
    next.put('funding', proofId, { ...funding, authorizationTx: null, stage: 'signature' });
  }, 'authorize-attacker');
  await replay('changed-operation-short-binding-and-caller', next => {
    const id = `fund:${proofId}`;
    const tx = next.get('tx', id);
    const funding = next.get('funding', proofId);
    next.put('tx', id, { ...tx, binding: digest({ proofId, data: tx.data }) });
    next.remove('broadcast-attempt', tx.txId);
    next.put('funding-op', proofId, { operationId: 'authorize-attacker' });
    next.put('funding', proofId, { ...funding, authorizationTx: null, stage: 'signature' });
  }, 'authorize-attacker');
  await replay('payer-signature-substitution', async (next, account) => {
    const funding = next.get('funding', proofId);
    const substituted = '0x' + 'ab'.repeat(65);
    const payment = { ...funding.payment, maxAmount: BigInt(funding.payment.maxAmount), salt: BigInt(funding.payment.salt) };
    const data = encodeFunctionData({ abi, functionName: 'authorize', args: [payment, BigInt(funding.quote.gross), collector, substituted] });
    await rewrite(next, account, {}, data);
  });

  const currentDir = mkdtempSync(join(tmpdir(), 'h115010-current-'));
  const currentFile = join(currentDir, 'rail.sqlite');
  const currentStore = new RailStore(currentFile, { kind: 'fork', forkId: 'h103010-disposable' });
  currentStore.put('native-budget', budgetKey, { remaining: '1000000000000', spent: '0', holds: {}, unknown: [] });
  const currentSends = { n: 0, raws: [] };
  let currentSigns = 0;
  const currentSigner = { address: account.address, async signTransaction(tx) { currentSigns += 1; return account.signTransaction(tx); } };
  const currentNetwork = { ...network, historicalLineage: undefined, grantEpoch: 4, authorityDigest: 'e'.repeat(64) };
  const currentRail = new CommercePaymentsRail(currentStore, client(currentSends), currentSigner, 'machine-commerce-v1', { chain: 'eip155:8453', escrow, collector, refundCollector: refund, token, abi, codeHashes, network: currentNetwork }, async () => {}, 1n, assets);
  const currentQuote = quoteFor(currentRail, account, 200n);
  const currentProof = await currentRail.bindQuote(currentQuote.quote, currentQuote.pay);
  let second = null;
  let secondError = null;
  try {
    await currentRail.authorize(currentProof, signature, 'authorize-current');
    second = await currentRail.authorize(currentProof, '0x' + '00'.repeat(65), 'authorize-current');
  } catch (error) { secondError = error.code || error.message; }
  record('current-generation-second-authorize', { signs: currentSigns, sends: currentSends.n, secondRecovery: second?.recovery ?? null, secondState: second?.state ?? null, secondError, raw: typeof currentStore.get('tx', `fund:${currentProof}`)?.raw === 'string' });
  currentStore.close();

  const crashDir = mkdtempSync(join(tmpdir(), 'h115010-crash-'));
  const crashFile = join(crashDir, 'rail.sqlite');
  const crashStore = new RailStore(crashFile, { kind: 'fork', forkId: 'h103010-disposable' });
  crashStore.put('native-budget', budgetKey, { remaining: '1000000000000', spent: '0', holds: {}, unknown: [] });
  const crashSends = { n: 0, raws: [] };
  let crashSigns = 0;
  const crashSigner = { address: account.address, async signTransaction(tx) { crashSigns += 1; return account.signTransaction(tx); } };
  const put = crashStore.put.bind(crashStore);
  crashStore.put = (space, key, value) => { if (space === 'funding' && value?.authorizationTx) throw Object.assign(new Error('crash_before_funding_update'), { code: 'crash_before_funding_update' }); return put(space, key, value); };
  const crashRail = new CommercePaymentsRail(crashStore, client(crashSends), crashSigner, 'machine-commerce-v1', { chain: 'eip155:8453', escrow, collector, refundCollector: refund, token, abi, codeHashes, network: currentNetwork }, async () => {}, 1n, assets);
  const crashQuote = quoteFor(crashRail, account, 300n);
  const crashProof = await crashRail.bindQuote(crashQuote.quote, crashQuote.pay);
  let crashError = null;
  try { await crashRail.authorize(crashProof, signature, 'authorize-crash'); }
  catch (error) { crashError = error.code || error.message; }
  crashStore.put = put;
  const retrySigner = { address: account.address, async signTransaction() { crashSigns += 1; throw new Error('resigned'); } };
  const retrySends = { n: 0, raws: [] };
  const retryRail = new CommercePaymentsRail(crashStore, client(retrySends), retrySigner, 'machine-commerce-v1', { chain: 'eip155:8453', escrow, collector, refundCollector: refund, token, abi, codeHashes, network: currentNetwork }, async () => {}, 1n, assets);
  let retry = null;
  let retryError = null;
  try { retry = await retryRail.authorize(crashProof, signature, 'authorize-crash'); }
  catch (error) { retryError = error.code || error.message; }
  record('crash-before-funding-retry', { crashError, signs: crashSigns, firstSends: crashSends.n, retryRecovery: retry?.recovery ?? null, retryError, retrySends: retrySends.n, authorizationTx: crashStore.get('funding', crashProof)?.authorizationTx ?? null, raw: typeof crashStore.get('tx', `fund:${crashProof}`)?.raw === 'string' });
  crashStore.close();

  const raceDir = mkdtempSync(join(tmpdir(), 'h115010-race-'));
  const raceFile = join(raceDir, 'rail.sqlite');
  const left = new RailStore(raceFile, { kind: 'fork', forkId: 'h103010-disposable' });
  const right = new RailStore(raceFile, { kind: 'fork', forkId: 'h103010-disposable' });
  const raceRaw = baseline.raw;
  const raceIntent = { id: `fund:${proofId}`, txId: keccak256(raceRaw), raw: raceRaw, witness: { identityDigest, attestationRef: '', grantEpoch: 1, configuredChain: 'eip155:8453', networkClass: 'owned-fork', abiDigest, authorityDigest } };
  const raceSends = { n: 0, raws: [] };
  const attemptStates = [];
  for (const journal of [left, right]) {
    const originalPut = journal.put.bind(journal);
    journal.put = (space, key, value) => { if (space === 'broadcast-attempt') attemptStates.push(value.state); return originalPut(space, key, value); };
  }
  let waits = 0;
  const raceClient = client(raceSends);
  raceClient.sendRawTransaction = async ({ serializedTransaction }) => {
    raceSends.n += 1;
    raceSends.raws.push(serializedTransaction);
    if (raceSends.n === 2) await new Promise(resolve => setTimeout(resolve, 30));
    return keccak256(serializedTransaction);
  };
  raceClient.waitForTransactionReceipt = async () => {
    waits += 1;
    if (waits === 1) return { transactionHash: raceIntent.txId, status: 'success' };
    return null;
  };
  const identity = { ...network, configuredChain: 'eip155:8453', asset: produced, assets, broadcastStore: left, codeHashes };
  const identityRight = { ...identity, broadcastStore: right };
  await Promise.all([broadcast(raceClient, raceIntent, identity), broadcast(raceClient, raceIntent, identityRight)]);
  record('two-instance-send', { sends: raceSends.n, states: attemptStates, left: left.get('broadcast-attempt', raceIntent.txId), right: right.get('broadcast-attempt', raceIntent.txId) });
  const receiptSends = { n: 0, raws: [] };
  left.put('broadcast-attempt', raceIntent.txId, { state: 'unknown', txId: raceIntent.txId });
  const receiptClient = client(receiptSends, { receipt: { transactionHash: raceIntent.txId, status: 'success' } });
  const discovered = await broadcast(receiptClient, raceIntent, identity);
  record('receipt-does-not-promote-unknown', { returned: discovered?.status ?? null, sends: receiptSends.n, state: left.get('broadcast-attempt', raceIntent.txId)?.state ?? null });
  left.close();
  right.close();

  const walletSends = { n: 0, raws: [] };
  const walletClient = { chain: { id: 31337 }, transport: { url: 'http://127.0.0.1:9' }, async getChainId() { return 31337; }, async request() { return '0x7a69'; }, async getTransactionReceipt() { return null; }, async getTransaction() { return null; }, async sendRawTransaction() { walletSends.n += 1; return '0x' + '11'.repeat(32); }, async waitForTransactionReceipt() { return null; } };
  const walletAssets = new AssetRegistry('sandbox', [{ asset: { chain: 'eip155:31337', token, decimals: 6, symbol: 'USDC' }, environment: 'sandbox', canonical: { asset: 'USDC', network: 'eip155:31337' } }]);
  await broadcast(walletClient, { id: 'wallet:one', txId: '0x' + '22'.repeat(32), raw: '0x02' }, { configuredChain: 'eip155:31337', asset: { chain: 'eip155:31337', token, decimals: 6, symbol: 'USDC' }, assets: walletAssets });
  record('wallet-broadcast-without-journal', { sends: walletSends.n });
  record('baseline-preserved-shape', { debt: baseline.debt, hold: baseline.hold !== null });
  rmSync(dir, { recursive: true, force: true });
  rmSync(currentDir, { recursive: true, force: true });
  rmSync(crashDir, { recursive: true, force: true });
  rmSync(raceDir, { recursive: true, force: true });
}

const head = createHash('sha256');
for (const name of ['src/machine-money.mjs', 'runtime/agent-economy-rail/dist/local-chain.js', 'runtime/agent-economy-rail/dist/rail.js']) {
  head.update(name); head.update(readFileSync(new URL('../../' + name, import.meta.url)));
}
record('source-fingerprint', { sha256: head.digest('hex') });
await main();
console.log('CASES ' + out.length);
