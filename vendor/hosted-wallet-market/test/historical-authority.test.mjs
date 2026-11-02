// Configured predecessor recovery. Both commits go through their own
// openQualifiedMoney. The current companion refuses both before a signature:
// aa861e has no withOperation, and 290414 still binds only proofId plus calldata.
// Those bytes come from that commit's own grant document. Recovery is the
// current money plus the current companion. The lineage is recomputed from the
// closure that signed, not from the witness and not from the successor digest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionResult, keccak256, parseAbi, recoverTransactionAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { digest } from '../runtime/agent-economy-foundation/dist/index.js';
import { capturePlan } from '../runtime/agent-economy-rail/dist/fees.js';
import { RailStore } from '../runtime/agent-economy-rail/dist/store.js';
import { versionedSource } from '../runtime/agent-economy-rail/dist/candidate.js';
import { historicalAuthorityDigest } from '../src/machine-money.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const market = fileURLToPath(new URL('..', import.meta.url));
const companionEntry = '/home/ubuntu/ae14-work/h113010-companion/tools/ops/machine-market-operator/src/open-machine-authority.mjs';
const cachePath = '/tmp/h113010-owned/cache/code-53412211.json';
const FORK = 'h113010-historical';
const ORIGIN = 'https://machine.example';
const TENANT = 'pilot';
const PREDECESSORS = [
  { commit: 'aa861e980df0f75a782ff30996450cf15870f2e7', nativeBudget: true, crash: false },
  { commit: '290414e614f781357d41565258f4666208f5d70b', nativeBudget: false, crash: true },
];

function privateFile(file, text) {
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
}

function worktree(commit) {
  const dir = join('/tmp/h113010-owned/src', commit.slice(0, 12));
  const rail = join(dir, 'vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/rail.js');
  if (!existsSync(rail)) {
    execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', dir, commit], { stdio: 'pipe' });
    symlinkSync(join(market, 'node_modules'), join(dir, 'vendor/hosted-wallet-market/node_modules'));
  }
  return dir;
}

function checkpoint(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
}

function copyJournal(src, dest) {
  checkpoint(src);
  copyFileSync(src, dest);
  chmodSync(dest, 0o600);
}

function feeText(block) {
  const base = BigInt(block.baseFeePerGas);
  const gasLimit = 300000n;
  const maxPriorityFeePerGas = 1000000n;
  const maxFeePerGas = base * 2n + 1000000000n;
  const nativeBudget = (gasLimit * maxFeePerGas * 10n).toString();
  return {
    nativeBudget,
    feeLimits: { gasLimit: gasLimit.toString(), maxFeePerGas: maxFeePerGas.toString(), maxPriorityFeePerGas: maxPriorityFeePerGas.toString() },
  };
}

const viewAbi = parseAbi([
  'function authCaptureEscrow() view returns (address)',
  'function collectorType() view returns (uint8)',
]);
function startLoopback(cache, candidate, abi) {
  const codes = new Map(Object.entries(cache.codes).map(([address, code]) => [address.toLowerCase(), code]));
  const sends = { n: 0, raws: [] };
  let receipts = true;
  const sent = new Set();
  function callResult(to, data) {
    const address = String(to).toLowerCase();
    let decoded;
    let selected = abi;
    try { decoded = decodeFunctionData({ abi, data }); }
    catch {
      decoded = decodeFunctionData({ abi: viewAbi, data });
      selected = viewAbi;
    }
    if (decoded.functionName === 'getHash') return encodeFunctionResult({ abi: selected, functionName: 'getHash', result: keccak256(data) });
    if (decoded.functionName === 'paymentState') return encodeFunctionResult({ abi: selected, functionName: 'paymentState', result: [false, 0n, 0n] });
    if (decoded.functionName === 'authCaptureEscrow') return encodeFunctionResult({ abi: selected, functionName: 'authCaptureEscrow', result: candidate.escrow });
    if (decoded.functionName === 'collectorType') return encodeFunctionResult({ abi: selected, functionName: 'collectorType', result: address === candidate.refundCollector ? 1 : 0 });
    if (decoded.functionName === 'tokenStoreImplementation') return encodeFunctionResult({ abi: selected, functionName: 'tokenStoreImplementation', result: candidate.tokenStore });
    throw new Error('unhandled call ' + decoded.functionName);
  }
  function reply(message) {
    const id = message?.id ?? null;
    const method = message?.method;
    const params = message?.params || [];
    if (method === 'eth_chainId') return { jsonrpc: '2.0', id, result: '0x2105' };
    if (method === 'eth_blockNumber') return { jsonrpc: '2.0', id, result: cache.block.number };
    if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') return { jsonrpc: '2.0', id, result: cache.block };
    if (method === 'eth_getCode') {
      const code = codes.get(String(params[0]).toLowerCase());
      if (!code) return { jsonrpc: '2.0', id, error: { code: -32000, message: 'code_absent' } };
      return { jsonrpc: '2.0', id, result: code };
    }
    if (method === 'eth_getStorageAt') return { jsonrpc: '2.0', id, result: cache.storage.value };
    if (method === 'eth_call') return { jsonrpc: '2.0', id, result: callResult(params[0].to, params[0].data) };
    if (method === 'eth_estimateGas') return { jsonrpc: '2.0', id, result: '0x5208' };
    if (method === 'eth_getTransactionCount') return { jsonrpc: '2.0', id, result: '0x0' };
    if (method === 'eth_maxPriorityFeePerGas' || method === 'eth_gasPrice') return { jsonrpc: '2.0', id, result: '0x1' };
    if (method === 'eth_getLogs') return { jsonrpc: '2.0', id, result: [] };
    if (method === 'eth_getTransactionByHash') return { jsonrpc: '2.0', id, result: null };
    if (method === 'eth_getTransactionReceipt') {
      const hash = String(params[0]).toLowerCase();
      if (!receipts || !sent.has(hash)) return { jsonrpc: '2.0', id, result: null };
      return { jsonrpc: '2.0', id, result: {
        transactionHash: params[0], transactionIndex: '0x0', blockHash: cache.block.hash, blockNumber: cache.block.number,
        from: candidate.escrow, to: candidate.escrow, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', contractAddress: null,
        logs: [], logsBloom: '0x' + '0'.repeat(512), status: '0x1', effectiveGasPrice: '0x1', type: '0x2',
      } };
    }
    if (method === 'eth_sendRawTransaction') {
      const raw = params[0];
      const hash = keccak256(raw);
      sends.n += 1;
      sends.raws.push(raw);
      sent.add(hash.toLowerCase());
      return { jsonrpc: '2.0', id, result: hash };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method_refused' } };
  }
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { response.writeHead(400).end(); return; }
    let body;
    try { body = Array.isArray(payload) ? payload.map(reply) : reply(payload); }
    catch (error) { body = { jsonrpc: '2.0', id: payload?.id ?? null, error: { code: -32603, message: String(error.message).slice(0, 200) } }; }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/`,
        sends,
        setReceipts(value) { receipts = value; },
        reset() { sent.clear(); },
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

function lineageEntry(spec, identity, fees, operator, feeRecipient) {
  const bound = {
    origin: ORIGIN, tenant: TENANT, profile: 'machine-market', source: identity.sourceSha256, host: identity.hostSha256,
    network: identity.candidate.identityDigest, executionClass: 'owned-fork', forkId: FORK, operator, feeRecipient,
    epoch: 1, feeLimits: fees.feeLimits,
  };
  if (spec.nativeBudget) bound.nativeBudget = fees.nativeBudget;
  return { schema: 'pilot.historical-authority-lineage.v1', configuredChain: 'eip155:8453', abiDigest: identity.candidate.abiDigest, bound };
}

function writeGrant(dir, fields) {
  const file = join(dir, 'grant.json');
  privateFile(file, `${JSON.stringify(fields)}\n`);
  return file;
}

function grantFields({ sdsRoot, sourceSha256, hostSha256, rpcUrl, operator, feeRecipient, epoch, journalPath, keyFile, fees, lineage }) {
  const body = {
    schema: 'pilot.machine-operator-grant.v1', enrolled: true, origin: ORIGIN, tenant: TENANT, sdsRoot, sourceSha256, hostSha256,
    networkClass: 'owned-fork', forkId: FORK, chain: 'eip155:8453', rpcUrl, operator, feeRecipient, epoch, minimumEpoch: epoch,
    revoked: false, revokedEpochs: [], expiresAt: new Date(Date.now() + 3_600_000).toISOString(), journalPath, nativeBudget: fees.nativeBudget,
    feeLimits: fees.feeLimits, signer: { kind: 'viem-private-key-file', path: keyFile },
  };
  if (lineage) body.historicalLineage = lineage;
  return body;
}

async function openMoney(spec, identity, authority, fees, profile) {
  const money = await import(pathToFileURL(join(identity.dir, 'vendor/hosted-wallet-market/src/machine-money.mjs')).href);
  const capability = {
    profile: 'machine-market', sourceSha256: identity.sourceSha256, hostSha256: identity.hostSha256,
    networkSource: identity.candidate, execution: { class: 'owned-fork', forkId: FORK },
  };
  return money.openQualifiedMoney({
    capability, authority, profile, assertCurrent() {}, assertFundingConsent: async () => {}, approve: async () => {}, now: () => Date.now(),
  });
}

function quoteAndPayment(rail, candidate, parties, name) {
  const now = Math.floor(Date.now() / 1000);
  const gross = '1000000';
  const plan = capturePlan([gross]);
  const pay = {
    operator: parties.operatorAddress, payer: parties.payer, receiver: parties.receiver, token: candidate.token, maxAmount: 1000000n,
    preApprovalExpiry: now + 86400, authorizationExpiry: now + 172800, refundExpiry: now + 259200,
    minFeeBps: 500, maxFeeBps: 500, feeReceiver: parties.feeRecipient, salt: 100n,
  };
  const quote = {
    schemaVersion: 'pilot.agent-economy.v2', quoteId: `quote${name}`, tenantId: `tenant${name}`, taskId: `task${name}`, canonicalTaskId: `canon${name}`,
    taskVersion: 1, termsVersion: 'terms1', requesterId: 'requester1', evaluatorId: 'evaluator1', contributorId: 'contributor1',
    payoutDestination: parties.receiver, fundingAuthorityId: 'machine-commerce-v1', settlementAuthorityId: 'settlement-v1',
    asset: { chain: 'eip155:8453', token: candidate.token, decimals: 6, symbol: 'USDC' }, gross, contributorNet: plan.net, platformFee: plan.feeAmount, subsidy: '0',
    fee: { schemaVersion: 'pilot.agent-economy.v2', bps: 500, basis: 'new_job_gross', profile: { id: 'commerce-payments-v1.1.0-single-capture', rounding: 'per_capture_floor', mode: 'single_capture', escrow: rail.protocol } },
    rail: { mode: 'deduct_gross', costCap: '0' }, fundingTarget: candidate.escrow, expiresAt: new Date((pay.preApprovalExpiry - 60) * 1000).toISOString(),
    rules: { partial: 'accepted_gross_only', refund: 'unaccepted_gross_only', dispute: 'hold_until_authoritative_resolution', reversal: 'reconcile_without_repricing_earned_obligation', rightsTermsRef: 'terms1' },
    feeRecipient: parties.feeRecipient,
  };
  return { quote, pay };
}

function view(store, proofId) {
  const id = `fund:${proofId}`;
  const tx = store.get('tx', id);
  const funding = store.get('funding', proofId);
  const budget = store.all('native-budget')[0];
  return {
    raw: tx?.raw, binding: tx?.binding, txId: tx?.txId, witness: tx?.witness, nonce: store.all('nonce'),
    hold: budget?.holds?.[id], authorizationTx: funding?.authorizationTx ?? null, payment: funding?.payment,
    allocation: store.get('funding-allocation', JSON.stringify([funding.quote.tenantId, funding.quote.canonicalTaskId])),
    operation: store.get('funding-op', proofId),
  };
}
function snap(file, proofId) {
  const store = new RailStore(file, { kind: 'fork', forkId: FORK });
  try { return view(store, proofId); }
  finally { store.close(); }
}

test('configured predecessors recover only with retained authority and current replay permission', { timeout: 180000 }, async () => {
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  assert.equal(cache.observedBlockHash, '0x6f50eea711bc1a20239c6a9350e44a2f7f3ae96432ffb3a8f1946252a3429e79');
  assert.equal(cache.blockHash, cache.observedBlockHash);
  const candidate = versionedSource('eip155:8453');
  for (const [address, hash] of Object.entries(candidate.codeHashes)) assert.equal(keccak256(cache.codes[address]), hash);
  const abi = JSON.parse(readFileSync(new URL('../runtime/agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json', import.meta.url), 'utf8'));
  const fees = feeText(cache.block);
  const loop = await startLoopback(cache, candidate, abi);
  const scratch = mkdtempSync(join(tmpdir(), 'h113010-hist-'));
  const wrapper = join(scratch, 'authority.mjs');
  privateFile(wrapper, `export { openMachineAuthority } from ${JSON.stringify(pathToFileURL(companionEntry).href)};\n`);
  const key = generatePrivateKey();
  const keyFile = join(scratch, 'operator.key');
  privateFile(keyFile, `${key}\n`);
  const operatorAccount = privateKeyToAccount(key);
  const operator = operatorAccount.address.toLowerCase();
  const payerAccount = privateKeyToAccount(generatePrivateKey());
  const payer = payerAccount.address.toLowerCase();
  const receiver = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const feeRecipient = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const parties = { operatorAddress: operatorAccount.address, payer, receiver, feeRecipient };
  const profile = { origin: ORIGIN, tenant: TENANT, chain: 'eip155:8453', settlementToken: candidate.token, feeRecipient };
  const currentNative = await import(pathToFileURL(join(market, 'src/native-debt.mjs')).href);
  const currentIdentity = { sourceSha256: currentNative.installedSourceSha256(), hostSha256: currentNative.hostSourceSha256(root) };
  const produced = [];
  try {
    for (const spec of PREDECESSORS) {
      const dir = worktree(spec.commit);
      const native = await import(pathToFileURL(join(dir, 'vendor/hosted-wallet-market/src/native-debt.mjs')).href);
      const identity = {
        dir, sourceSha256: native.installedSourceSha256(), hostSha256: native.hostSourceSha256(dir),
        candidate: (await import(pathToFileURL(join(dir, 'vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/candidate.js')).href)).versionedSource('eip155:8453'),
      };
      assert.equal(identity.candidate.identityDigest, candidate.identityDigest);
      const name = spec.commit.slice(0, 8);
      const journalPath = join(scratch, `${name}.sqlite`);
      const refusalJournal = join(scratch, `${name}-companion-refusal.sqlite`);
      process.env.PILOT_MACHINE_OPERATOR_GRANT = writeGrant(scratch, grantFields({
        sdsRoot: dir, sourceSha256: identity.sourceSha256, hostSha256: identity.hostSha256, rpcUrl: loop.url,
        operator, feeRecipient, epoch: 1, journalPath: refusalJournal, keyFile, fees,
      }));
      const companionOpened = await openMoney(spec, identity, wrapper, fees, profile);
      let companionRefusal = null;
      try {
        const refusedQuote = quoteAndPayment(companionOpened.rail, identity.candidate, parties, `${name}ref`);
        const refusedProof = await companionOpened.rail.bindQuote(refusedQuote.quote, refusedQuote.pay);
        const refusedSignature = await payerAccount.signTypedData(await companionOpened.rail.authorizationTypedData(refusedProof));
        await companionOpened.rail.authorize(refusedProof, refusedSignature, `authorize-${name}ref`);
      } catch (error) {
        companionRefusal = error?.code || error?.codeName || error?.message;
      } finally { companionOpened.journal.close(); }
      // aa861e never enters withOperation. 290414 writes the short fund binding, which this companion refuses.
      assert.equal(companionRefusal, spec.commit.startsWith('aa861e98') ? 'outside_operation_scope' : 'canonical_mismatch');
      const refused = new RailStore(refusalJournal, { kind: 'fork', forkId: FORK });
      try { assert.equal(refused.all('tx').some(row => row.raw), false); }
      finally { refused.close(); }
      let signs = 0;
      const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
      const opened = await openMoney(spec, identity, {
        networkClass: 'owned-fork', rpcUrl: loop.url, forkId: FORK, journalPath, grantEpoch: 1, nativeBudget: fees.nativeBudget, feeLimits: fees.feeLimits,
        operator: { address: operatorAccount.address, async signTransaction(tx) { signs += 1; return operatorAccount.signTransaction(tx); } },
        readAuthorization: async () => ({
          schema: 'pilot.machine-rail-authority.v1', revoked: false, origin: ORIGIN, tenant: TENANT, profile: 'machine-market',
          executionClass: 'owned-fork', forkId: FORK, sourceSha256: identity.sourceSha256, hostSha256: identity.hostSha256,
          networkIdentityDigest: identity.candidate.identityDigest, operator, feeRecipient, epoch: 1, expiresAt,
        }),
      }, fees, profile);
      const prepared = quoteAndPayment(opened.rail, identity.candidate, parties, name);
      const proofId = await opened.rail.bindQuote(prepared.quote, prepared.pay);
      const signature = await payerAccount.signTypedData(await opened.rail.authorizationTypedData(proofId));
      if (spec.crash) {
        const put = opened.journal.put.bind(opened.journal);
        opened.journal.put = (space, key, value) => {
          if (space === 'funding' && value?.authorizationTx) throw Object.assign(new Error('crash_before_funding_update'), { code: 'crash_before_funding_update' });
          return put(space, key, value);
        };
        await assert.rejects(() => opened.rail.authorize(proofId, signature, `authorize-${name}`), error => error.code === 'crash_before_funding_update');
      } else await opened.rail.authorize(proofId, signature, `authorize-${name}`);
      opened.journal.close();
      const seen = snap(journalPath, proofId);
      assert.equal(signs, 1);
      assert.equal(typeof seen.raw, 'string');
      assert.equal((await recoverTransactionAddress({ serializedTransaction: seen.raw })).toLowerCase(), operator);
      assert.equal(seen.witness.grantEpoch, 1);
      const entry = lineageEntry(spec, identity, fees, operator, feeRecipient);
      assert.equal(seen.witness.authorityDigest, historicalAuthorityDigest(entry.bound));
      assert.equal(seen.witness.authorityDigest === digest({ ...entry.bound, source: currentIdentity.sourceSha256, host: currentIdentity.hostSha256 }), false);
      if (spec.crash) assert.equal(seen.authorizationTx, null);
      else assert.equal(seen.authorizationTx, seen.txId);
      produced.push({ spec, identity, proofId, operationId: `authorize-${name}`, journal: journalPath, entry, raw: seen.raw });
    }
    assert.equal(new Set(produced.map(row => row.raw)).size, 2);
    const currentMoney = await import(pathToFileURL(join(market, 'src/machine-money.mjs')).href);
    async function recover(row, lineage, journal, receipts) {
      loop.reset();
      loop.setReceipts(receipts);
      const beforeSends = loop.sends.n;
      const grantDir = mkdtempSync(join(scratch, 'recover-'));
      const grant = writeGrant(grantDir, grantFields({
        sdsRoot: root, sourceSha256: currentIdentity.sourceSha256, hostSha256: currentIdentity.hostSha256, rpcUrl: loop.url,
        operator, feeRecipient, epoch: 2, journalPath: journal, keyFile, fees, lineage,
      }));
      process.env.PILOT_MACHINE_OPERATOR_GRANT = grant;
      const opened = await currentMoney.openQualifiedMoney({
        capability: {
          profile: 'machine-market', sourceSha256: currentIdentity.sourceSha256, hostSha256: currentIdentity.hostSha256,
          networkSource: candidate, execution: { class: 'owned-fork', forkId: FORK },
        },
        authority: wrapper, profile, assertCurrent() {}, assertFundingConsent: async () => {}, approve: async () => {}, now: () => Date.now(),
      });
      try {
        const before = view(opened.journal, row.proofId);
        const result = await opened.rail.authorize(row.proofId, '0x' + '00'.repeat(65), row.operationId);
        return { result, before, after: view(opened.journal, row.proofId), sends: loop.sends.n - beforeSends, opened };
      } catch (error) {
        opened.journal.close();
        throw error;
      }
    }
    for (const row of produced) {
      const base = join(scratch, `${row.spec.commit.slice(0, 8)}-base.sqlite`);
      copyJournal(row.journal, base);
      const positiveFile = join(scratch, `${row.spec.commit.slice(0, 8)}-positive.sqlite`);
      copyJournal(base, positiveFile);
      const positive = await recover(row, [row.entry], positiveFile, true);
      assert.equal(positive.result.recovery, undefined);
      assert.equal(positive.result.state, 'pending');
      assert.equal(positive.sends, 1);
      assert.equal(positive.after.raw, row.raw);
      assert.equal(positive.after.authorizationTx, positive.after.txId);
      assert.equal(loop.sends.raws.at(-1), row.raw);
      const sendsAfterPositive = loop.sends.n;
      const again = await positive.opened.rail.authorize(row.proofId, '0x' + 'ab'.repeat(65), row.operationId);
      assert.equal(again.state, 'pending');
      assert.equal(loop.sends.n, sendsAfterPositive);
      assert.equal(positive.opened.journal.get('tx', `fund:${row.proofId}`).raw, row.raw);
      positive.opened.journal.close();
      const unknownFile = join(scratch, `${row.spec.commit.slice(0, 8)}-unknown.sqlite`);
      copyJournal(base, unknownFile);
      const unknown = await recover(row, [row.entry], unknownFile, false);
      assert.equal(unknown.sends, 1);
      assert.equal(unknown.opened.journal.get('broadcast-attempt', unknown.after.txId).state, 'unknown');
      const sendsAfterUnknown = loop.sends.n;
      const unknownAgain = await unknown.opened.rail.authorize(row.proofId, '0x' + 'ab'.repeat(65), row.operationId);
      assert.equal(unknownAgain.state, 'pending');
      assert.equal(loop.sends.n, sendsAfterUnknown);
      assert.equal(unknown.opened.journal.get('tx', `fund:${row.proofId}`).raw, row.raw);
      unknown.opened.journal.close();
      const cases = [];
      function mutated(label, fileName, edit, lineage = [row.entry]) {
        cases.push({ label, fileName, edit, lineage });
      }
      mutated('missing-witness', 'missing-witness', store => {
        const id = `fund:${row.proofId}`;
        const tx = store.get('tx', id);
        delete tx.witness;
        store.put('tx', id, tx);
      });
      mutated('malformed-witness', 'malformed-witness', store => {
        const id = `fund:${row.proofId}`;
        const tx = store.get('tx', id);
        delete tx.witness.authorityDigest;
        store.put('tx', id, tx);
      });
      mutated('wrong-source', 'wrong-source', () => {}, [{ ...row.entry, bound: { ...row.entry.bound, source: 'ab'.repeat(32) } }]);
      mutated('wrong-host', 'wrong-host', () => {}, [{ ...row.entry, bound: { ...row.entry.bound, host: 'cd'.repeat(32) } }]);
      mutated('wrong-epoch', 'wrong-epoch', () => {}, [{ ...row.entry, bound: { ...row.entry.bound, epoch: 9 } }]);
      mutated('wrong-operator', 'wrong-operator', () => {}, [{ ...row.entry, bound: { ...row.entry.bound, operator: `0x${'44'.repeat(20)}` } }]);
      mutated('changed-grant-fee', 'changed-grant-fee', () => {}, [{ ...row.entry, bound: { ...row.entry.bound, feeLimits: { ...row.entry.bound.feeLimits, maxFeePerGas: '101' } } }]);
      mutated('missing-lineage', 'missing-lineage', () => {}, null);
      mutated('empty-lineage', 'empty-lineage', () => {}, []);
      mutated('wrong-quote', 'wrong-quote', store => {
        const funding = store.get('funding', row.proofId);
        store.put('funding', row.proofId, { ...funding, quote: { ...funding.quote, requesterId: 'requester-hidden' } });
      });
      mutated('changed-payment', 'changed-payment', store => {
        const funding = store.get('funding', row.proofId);
        store.put('funding', row.proofId, { ...funding, payment: { ...funding.payment, salt: (BigInt(funding.payment.salt) + 1n).toString() } });
      });
      mutated('changed-operation', 'changed-operation', store => store.put('funding-op', row.proofId, { operationId: 'authorize-changed-op' }));
      for (const item of cases) {
        const file = join(scratch, `${row.spec.commit.slice(0, 8)}-${item.fileName}.sqlite`);
        copyJournal(base, file);
        if (item.edit) {
          const store = new RailStore(file, { kind: 'fork', forkId: FORK });
          item.edit(store);
          store.close();
          checkpoint(file);
        }
        const before = snap(file, row.proofId);
        const outcome = await recover(row, item.lineage, file, true);
        assert.equal(outcome.result.recovery, 'historical_unknown', item.label);
        assert.equal(outcome.result.broadcast, false, item.label);
        assert.equal(outcome.result.authorization, null, item.label);
        assert.equal(outcome.sends, 0, item.label);
        const after = outcome.after;
        assert.equal(after.raw, before.raw, item.label);
        assert.equal(after.binding, before.binding, item.label);
        assert.deepEqual(after.nonce, before.nonce, item.label);
        assert.equal(after.hold, before.hold, item.label);
        assert.deepEqual(after.allocation, before.allocation, item.label);
        assert.deepEqual(after.payment, before.payment, item.label);
        assert.deepEqual(after.operation, before.operation, item.label);
        outcome.opened.journal.close();
      }
    }
    const marker = createHash('sha256').update(produced.map(row => row.raw).join('\n')).digest('hex');
    assert.equal(typeof marker, 'string');
  } finally {
    delete process.env.PILOT_MACHINE_OPERATOR_GRANT;
    await loop.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});
