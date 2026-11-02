// Disposable owned-fork funded journey for one account that already has voluntary work.
// State changes stay on 127.0.0.1. No public Base broadcast and no live key.
import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import https from 'node:https';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {machineHost} from './root10940-machine-host.mjs';
import {usefulEvidence} from '../../vendor/hosted-wallet-market/examples/participation-canary.mjs';
import {digest} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';
import {versionedSource} from '../../vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/candidate.js';

const exec = promisify(execFile);
const CAST = '/tmp/h103010-scratch/cast';
const RPC = 'http://127.0.0.1:18545';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WHALE = '0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A';
const FEE_RECIPIENT = '0x' + '11'.repeat(20);
const OPERATOR_ENTRY = '/tmp/h103010-operator-companion/tools/ops/machine-market-operator/src/open-machine-authority.mjs';
const clientPath = '/tmp/h103010-neo/cold-requester-0.3.1.mjs';
const clientBytes = readFileSync(clientPath);
assert.equal(createHash('sha256').update(clientBytes).digest('hex'), 'accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9');
const published = JSON.parse(readFileSync('/tmp/h103010-neo/descriptor-aa861e98.json', 'utf8'));
const candidate = versionedSource('eip155:8453');

function rpc(method, params) {
  const body = execFileSync(CAST, ['rpc', method, ...params.map(value => String(value)), '--rpc-url', RPC], {encoding:'utf8', timeout:60000}).trim();
  try { return JSON.parse(body); } catch { return body; }
}
function balanceOf(address, block) {
  const args = ['call', USDC, 'balanceOf(address)(uint256)', address, '--rpc-url', RPC];
  if (block !== undefined) args.push('--block', typeof block === 'string' ? block : '0x' + block.toString(16));
  const out = execFileSync(CAST, args, {encoding:'utf8', timeout:60000});
  return BigInt(out.trim().split(/\s/)[0]);
}
function settledUsdc(receipt) {
  const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  return (receipt.logs || []).filter(log => (log.address || '').toLowerCase() === USDC && (log.topics || [])[0] === transfer).map(log => ({
    from: '0x' + log.topics[1].slice(-40).toLowerCase(),
    to: '0x' + log.topics[2].slice(-40).toLowerCase(),
    amount: BigInt(log.data),
  }));
}
function fundPayer(address) {
  rpc('anvil_impersonateAccount', [WHALE]);
  execFileSync(CAST, ['send', '--unlocked', '--from', WHALE, USDC, 'transfer(address,uint256)', address, '10000000', '--rpc-url', RPC], {stdio:'pipe', timeout:90000});
  rpc('anvil_stopImpersonatingAccount', [WHALE]);
}

const host = await machineHost();
const scratch = join(host.scratch, 'funded');
mkdirSync(scratch, {mode:0o700});
const ca = readFileSync(host.caFile);
const route = action => '/api/neomorphic-contributor-journey/v1/market/' + action;
function request(path, {role, body, operationId, method='POST', timeout=120000} = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((done, reject) => {
    const req = https.request(host.origin + path, {method, ca, timeout, headers:{origin:host.origin, 'x-ae-wire-version':'c0-1',
      ...(role ? {cookie:role.cookie, 'x-cj-csrf':role.csrf} : {}),
      ...(payload ? {'content-type':'application/json', 'content-length':String(payload.length)} : {}),
      ...(operationId ? {'idempotency-key':operationId} : {})}}, res => {
      let bytes = '';
      res.on('data', chunk => { bytes += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(bytes); } catch {}
        done({status:res.statusCode, body:parsed, raw:bytes.slice(0, 800)});
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('timeout')));
    req.end(payload);
  });
}
const call = (role, action, body, operationId) => request(route(action), {role, body, operationId});
function must(result, label) {
  assert.equal(result.status, 200, label + ' ' + JSON.stringify(result.body ?? result.raw));
  assert.equal(result.body?.ok, true, label + ' ' + JSON.stringify(result.body));
  return result.body.value.result;
}
function journalTxs(file) {
  const db = new DatabaseSync(file, {readOnly:true});
  try {
    return db.prepare(`SELECT key, value FROM records WHERE space='tx' ORDER BY key`).all().map(row => {
      const value = JSON.parse(row.value);
      return {key:row.key, txId:value.txId, phase:value.phase};
    });
  } finally { db.close(); }
}

const report = {signs:0, capture:null, refund:null};
try {
  const chain = rpc('eth_chainId', []);
  assert.equal(chain, '0x2105');
  const capability = await host.boot();
  const descriptor = {...published, requiredProfile:{money:'unfunded', participation:'voluntary-artifact-v1', sourceSha256:capability.sourceSha256, hostSha256:capability.hostSha256}};
  const descriptorPath = join(scratch, 'descriptor.json');
  writeFileSync(descriptorPath, JSON.stringify(descriptor));
  const descriptorSha = createHash('sha256').update(readFileSync(descriptorPath)).digest('hex');
  const sourceFlags = ['--source-repository', published.source.repository, '--source-commit', published.source.commit, '--source-path', published.source.path];
  async function cold(args) {
    try {
      const {stdout} = await exec(process.execPath, ['--max-old-space-size=256', clientPath, ...args], {encoding:'utf8', timeout:20000, maxBuffer:1024 * 1024});
      return {status:0, body:JSON.parse(stdout)};
    } catch (error) { return {status:error.status ?? 1, body:JSON.parse(error.stdout || '{}')}; }
  }
  const common = ['--origin', host.origin, '--ca-file', host.caFile, '--descriptor', descriptorPath, '--descriptor-sha256', descriptorSha, ...sourceFlags];
  const requesterSecret = join(scratch, 'requester.json');
  const contributorSecret = join(scratch, 'contributor.json');
  assert.equal((await cold(['signup', ...common, '--secret-file', requesterSecret, '--display-name', 'h103010-requester', '--role', 'requester'])).status, 0);
  assert.equal((await cold(['signup', ...common, '--secret-file', contributorSecret, '--display-name', 'h103010-contributor', '--role', 'contributor'])).status, 0);
  const posted = await cold(['post', ...common, '--secret-file', requesterSecret, '--title', 'Need', '--summary', 'One unfunded need', '--criterion', 'preserve-mapping']);
  assert.equal(posted.status, 0, JSON.stringify(posted.body));
  const requesterFile = JSON.parse(readFileSync(requesterSecret, 'utf8'));
  const contributorFile = JSON.parse(readFileSync(contributorSecret, 'utf8'));
  const requesterRole = {cookie:requesterFile.cookie, csrf:requesterFile.csrf};
  const contributorRole = {cookie:contributorFile.cookie, csrf:contributorFile.csrf};
  const voluntaryId = requesterFile.taskId;
  assert.equal((await cold(['interest', ...common, '--secret-file', contributorSecret, '--peer-secret', requesterSecret, '--note', 'I can preserve the mapping'])).status, 0);
  const offerPath = join(scratch, 'offer.json');
  writeFileSync(offerPath, JSON.stringify({taskId:voluntaryId, contributorId:contributorFile.accountId, authorizedToRequest:true, rights:{license:'CC0-1.0', scope:'synthetic-or-authorized-reusable-artifact', attribution:'Synthetic fixture'}}));
  assert.equal((await cold(['act', ...common, '--secret-file', requesterSecret, '--action', 'offerVoluntary', '--input', offerPath])).status, 0);
  const inspectedPath = join(scratch, 'inspected.json');
  assert.equal((await cold(['inspect', ...common, '--secret-file', contributorSecret, '--task-id', voluntaryId, '--out', inspectedPath])).status, 0);
  const inspectedBody = JSON.parse(readFileSync(inspectedPath, 'utf8'));
  const assentPath = join(scratch, 'assent.json');
  writeFileSync(assentPath, JSON.stringify({taskId:voluntaryId, termsDigest:inspectedBody.termsDigest, expectedRevision:inspectedBody.revision, authorizedToShare:true, spec:inspectedBody.spec}));
  const assented = await cold(['act', ...common, '--secret-file', contributorSecret, '--action', 'assentVoluntary', '--input', assentPath]);
  assert.equal(assented.status, 0, JSON.stringify(assented.body));
  const deliverPath = join(scratch, 'deliver.json');
  writeFileSync(deliverPath, JSON.stringify({taskId:voluntaryId, termsDigest:inspectedBody.termsDigest, expectedRevision:assented.body.revision, evidence:usefulEvidence()}));
  const delivered = await cold(['act', ...common, '--secret-file', contributorSecret, '--action', 'deliverVoluntary', '--input', deliverPath]);
  assert.equal(delivered.status, 0, JSON.stringify(delivered.body));
  const reviewPath = join(scratch, 'review.json');
  writeFileSync(reviewPath, JSON.stringify({taskId:voluntaryId, termsDigest:inspectedBody.termsDigest, expectedRevision:delivered.body.revision, artifactDigest:delivered.body.artifactDigest, accepted:true, exportAuthorized:true, reason:'Mapping preserved'}));
  assert.equal((await cold(['act', ...common, '--secret-file', requesterSecret, '--action', 'reviewVoluntary', '--input', reviewPath])).status, 0);
  const exported = await cold(['export', ...common, '--secret-file', requesterSecret, '--task-id', voluntaryId, '--out', join(scratch, 'export.json')]);
  assert.equal(exported.status, 0, JSON.stringify(exported.body));
  assert.equal(exported.body.paidWork, false);
  const termsBefore = (await host.query(`SELECT voluntary::text AS voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [voluntaryId])).rows[0].voluntary;

  const operatorKey = generatePrivateKey();
  const operator = privateKeyToAccount(operatorKey);
  const payer = privateKeyToAccount(generatePrivateKey());
  const receiver = privateKeyToAccount(generatePrivateKey());
  const keyFile = join(scratch, 'operator.key');
  const readerFile = join(scratch, 'reader.mjs');
  const grantFile = join(scratch, 'grant.json');
  const journalFile = join(scratch, 'journal.sqlite');
  const authorityFile = join(scratch, 'authority.mjs');
  writeFileSync(keyFile, operatorKey + '\n', {mode:0o600});
  chmodSync(keyFile, 0o600);
  writeFileSync(readerFile, `import {readFileSync} from 'node:fs';
import {privateKeyToAccount} from 'viem/accounts';
export async function readOperatorAccount() {
  const text = readFileSync(process.env.H103010_OPERATOR_KEY, 'utf8').trim();
  const account = privateKeyToAccount(text);
  return {address:account.address, signTransaction:async tx => {
    globalThis.__h103010Signs = (globalThis.__h103010Signs || 0) + 1;
    return account.signTransaction(tx);
  }};
}
`, {mode:0o600});
  chmodSync(readerFile, 0o600);
  symlinkSync('/tmp/sds-aa861e98/node_modules', join(scratch, 'node_modules'));
  writeFileSync(authorityFile, `export {openMachineAuthority} from ${JSON.stringify(pathToFileURL(OPERATOR_ENTRY).href)};\n`, {mode:0o600});
  chmodSync(authorityFile, 0o600);
  const block = JSON.parse(execFileSync(CAST, ['rpc', '--rpc-url', RPC, 'eth_getBlockByNumber', 'latest', 'false'], {encoding:'utf8', timeout:30000}));
  const base = BigInt(block.baseFeePerGas ?? block);
  const gasLimit = 2000000n;
  const maxPriorityFeePerGas = 1000000n;
  const maxFeePerGas = base * 2n + 1000000000n;
  const grant = {
    schema:'pilot.machine-operator-grant.v1', enrolled:true, origin:host.origin, tenant:'root10940-owner-qa-fixture',
    sdsRoot:'/home/ubuntu/ae14-work/h103010', sourceSha256:capability.sourceSha256, hostSha256:capability.hostSha256,
    networkClass:'owned-fork', forkId:'h103010-disposable', chain:'eip155:8453', rpcUrl:RPC,
    operator:operator.address.toLowerCase(), feeRecipient:FEE_RECIPIENT, epoch:1, minimumEpoch:1,
    revoked:false, revokedEpochs:[], expiresAt:new Date(Date.now() + 6 * 3600_000).toISOString(),
    journalPath:journalFile, nativeBudget:(gasLimit * maxFeePerGas * 12n).toString(),
    feeLimits:{gasLimit:gasLimit.toString(), maxFeePerGas:maxFeePerGas.toString(), maxPriorityFeePerGas:maxPriorityFeePerGas.toString()},
    signer:{kind:'account-reader', module:readerFile},
  };
  writeFileSync(grantFile, JSON.stringify(grant) + '\n', {mode:0o600});
  chmodSync(grantFile, 0o600);
  process.env.H103010_OPERATOR_KEY = keyFile;
  process.env.PILOT_MACHINE_OPERATOR_GRANT = grantFile;
  rpc('anvil_setBalance', [operator.address, '0x8AC7230489E80000']);
  fundPayer(payer.address);
  const payerBefore = balanceOf(payer.address);
  assert.equal(payerBefore >= 1000000n, true);

  await host.boot({qualified:true, authorityModule:authorityFile});
  const profile = await request(route('profile'), {method:'GET'});
  assert.equal(profile.body.value.capability.money, 'unfunded');
  assert.equal(profile.body.value.signerAuthority, false);
  const selected = must(await call(requesterRole, 'selectCapability', {capability:'qualified'}, 'select-funded-req-01'), 'select');
  assert.equal(selected.paymentAuthority, false);
  assert.equal(selected.signerAuthority, false);
  assert.equal((await call(contributorRole, 'selectCapability', {capability:'qualified'}, 'select-funded-con-01')).status, 200);
  const voluntaryQuote = await call(requesterRole, 'quote', {taskId:voluntaryId, contributorId:contributorFile.accountId, gross:'1000000', railCostCap:'0', expiresAt:new Date(Date.now() + 86400_000).toISOString()}, 'quote-voluntary-0001');
  assert.equal(voluntaryQuote.body.ok, false);
  assert.equal(voluntaryQuote.body.code, 'voluntary_task_cannot_be_funded');
  assert.equal(globalThis.__h103010Signs || 0, 0);

  async function prove(role, account, signer) {
    const issued = must(await call(role, 'walletChallenge', {address:signer.address.toLowerCase()}), 'challenge');
    const signature = await account.signMessage({message:issued.message});
    const proved = must(await call(role, 'walletProve', {challengeDigest:digest(issued.challenge), signature}), 'prove');
    assert.equal(proved.controlProved, true);
  }
  await prove(requesterRole, payer, payer);
  await prove(contributorRole, receiver, receiver);
  const paidPost = must(await call(requesterRole, 'post', {title:'Funded need', summary:'Explicit qualified commerce', criteria:['preserve-mapping'], payableKinds:['usable']}, 'post-funded-0001'), 'post');
  const taskId = paidPost.taskId;
  assert.notEqual(taskId, voluntaryId);
  must(await call(contributorRole, 'interest', {taskId, note:'I can deliver the funded mapping'}, 'interest-funded-01'), 'interest');
  const expiresAt = new Date(Date.now() + 86400_000).toISOString();
  const quoted = must(await call(requesterRole, 'quote', {taskId, contributorId:contributorFile.accountId, gross:'1000000', railCostCap:'0', expiresAt}, 'quote-funded-0001'), 'quote');
  const quote = quoted.quote;
  assert.equal(quote.platformFee, '50000');
  assert.equal(quote.contributorNet, '950000');
  assert.equal(quote.gross, '1000000');
  assert.equal(Number(quote.fee.bps), 500);
  assert.equal(quote.feeRecipient, FEE_RECIPIENT);
  const quoteDigest = digest(quote);
  must(await call(contributorRole, 'assent', {taskId, quoteId:quote.quoteId, quoteDigest}, 'assent-funded-01'), 'assent');
  must(await call(requesterRole, 'select', {taskId, quoteId:quote.quoteId, quoteDigest}, 'select-quote-0001'), 'select-quote');
  const intent = must(await call(requesterRole, 'fundingIntent', {taskId, quoteDigest}), 'intent');
  assert.equal(Number(intent.payment.minFeeBps), 500);
  assert.equal(Number(intent.payment.maxFeeBps), 500);
  assert.equal(intent.payment.feeReceiver, FEE_RECIPIENT);
  const message = {...intent.typedData.message, value:BigInt(intent.typedData.message.value), validAfter:BigInt(intent.typedData.message.validAfter), validBefore:BigInt(intent.typedData.message.validBefore)};
  const signature = await payer.signTypedData({...intent.typedData, domain:{...intent.typedData.domain, chainId:Number(intent.typedData.domain.chainId)}, message});
  assert.match(signature, /^0x[0-9a-fA-F]{130}$/);
  const authorizeBody = {taskId, quoteDigest, proofId:intent.proofId, signature};
  const beforeMoney = {
    payer: balanceOf(payer.address),
    receiver: balanceOf(receiver.address),
    fee: balanceOf(FEE_RECIPIENT),
    escrow: balanceOf(candidate.escrow),
    collector: balanceOf(candidate.collector),
  };
  host.fault.dropAction = 'fundingAuthorize';
  let dropped;
  try { dropped = await call(requesterRole, 'fundingAuthorize', authorizeBody, 'authorize-funded-01'); }
  catch (error) { dropped = {error:error.message}; }
  let txs = [];
  try { txs = journalTxs(journalFile); } catch {}
  if (!txs.some(row => row.key.startsWith('fund:'))) {
    host.fault.dropAction = null;
    const visible = await call(requesterRole, 'fundingAuthorize', authorizeBody, 'authorize-funded-01');
    throw new Error('authorize did not commit ' + JSON.stringify({dropped, visible:visible.body ?? visible.raw, signs:globalThis.__h103010Signs || 0}));
  }
  assert.equal(globalThis.__h103010Signs || 0, 1);
  const funded = must(await call(requesterRole, 'fundingAuthorize', authorizeBody, 'authorize-funded-01'), 'authorize-replay');
  assert.equal(globalThis.__h103010Signs || 0, 1);
  assert.equal(funded.state, 'confirmed_escrow', JSON.stringify(funded));
  const payerAfter = balanceOf(payer.address);
  assert.equal(payerBefore - payerAfter, 1000000n);
  assert.equal(beforeMoney.payer - payerAfter, 1000000n);
  const stored = journalTxs(journalFile);
  assert.equal(stored.filter(row => row.key.startsWith('fund:')).length, 1);
  const receipt = JSON.parse(execFileSync(CAST, ['receipt', stored[0].txId, '--json', '--rpc-url', RPC], {encoding:'utf8', timeout:30000}));
  assert.equal(receipt.status, '0x1');
  assert.equal(receipt.transactionHash, stored[0].txId);
  const pulls = settledUsdc(receipt).filter(row => row.amount === 1000000n);
  assert.equal(pulls.length >= 1, true);
  assert.equal(pulls[0].from, payer.address.toLowerCase());
  const custody = pulls[pulls.length - 1].to;
  const custodyBefore = balanceOf(custody, BigInt(receipt.blockNumber) - 1n);
  assert.equal(balanceOf(custody) - custodyBefore, 1000000n);
  assert.equal(balanceOf(candidate.escrow) - beforeMoney.escrow, 0n);
  assert.equal(balanceOf(candidate.collector) - beforeMoney.collector, 0n);
  report.txId = stored[0].txId;
  report.payerDelta = '1000000';
  report.escrowDelta = '0';
  report.collectorDelta = '0';
  report.custodyDelta = '1000000';
  report.feeBps = 500;

  await host.boot({qualified:true, authorityModule:authorityFile});
  const recovered = must(await call(requesterRole, 'fundingAuthorize', authorizeBody, 'authorize-funded-01'), 'authorize-restart');
  assert.equal(recovered.state, 'confirmed_escrow');
  assert.equal(globalThis.__h103010Signs || 0, 1);
  assert.equal(journalTxs(journalFile).filter(row => row.key.startsWith('fund:')).length, 1);
  const stillVoluntary = await cold(['export', ...common, '--secret-file', requesterSecret, '--task-id', voluntaryId, '--out', join(scratch, 'export-after.json')]);
  assert.equal(stillVoluntary.status, 0, JSON.stringify(stillVoluntary.body));
  assert.equal(stillVoluntary.body.paidWork, false);
  assert.equal((await host.query(`SELECT voluntary::text AS voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [voluntaryId])).rows[0].voluntary, termsBefore);

  const claimed = must(await call(contributorRole, 'claim', {taskId, quoteDigest}, 'claim-funded-0001'), 'claim');
  const reservationId = claimed.body.reservation.id;
  must(await call(contributorRole, 'deliver', {taskId, quoteDigest, reservationId, evidence:usefulEvidence()}, 'deliver-funded-01'), 'deliver');
  must(await call(requesterRole, 'review', {taskId, quoteDigest, useful:true, reason:'Mapping preserved'}, 'review-funded-0001'), 'review');
  const approved = must(await call(requesterRole, 'approve', {taskId, quoteDigest}, 'approve-funded-01'), 'approve');
  assert.equal(approved.state, 'accepted_settled');
  assert.equal(approved.outcome.state, 'captured');
  assert.equal(approved.outcome.amount, '1000000');
  assert.equal(approved.outcome.feeAmount, '50000');
  assert.equal(approved.outcome.feeRecipient, FEE_RECIPIENT);
  assert.equal(approved.settlement.contributorNet, '950000');
  assert.equal(approved.settlement.qualified, true);
  assert.equal(globalThis.__h103010Signs || 0, 2);
  const afterCapture = journalTxs(journalFile);
  assert.equal(afterCapture.filter(row => row.key.startsWith('fund:')).length, 1);
  assert.equal(afterCapture.filter(row => row.key.startsWith('capture:')).length, 1);
  assert.equal(afterCapture.every(row => row.phase === 'signed' && typeof row.txId === 'string'), true);
  const captureRow = afterCapture.find(row => row.key.startsWith('capture:'));
  const captureHash = String(approved.outcome.txRef).split(':')[0];
  assert.equal(captureRow.txId, captureHash);
  const captureReceipt = JSON.parse(execFileSync(CAST, ['receipt', captureHash, '--json', '--rpc-url', RPC], {encoding:'utf8', timeout:30000}));
  assert.equal(captureReceipt.transactionHash, captureHash);
  assert.equal(captureReceipt.status, '0x1');
  const afterMoney = {
    payer: balanceOf(payer.address),
    receiver: balanceOf(receiver.address),
    fee: balanceOf(FEE_RECIPIENT),
    escrow: balanceOf(candidate.escrow),
    collector: balanceOf(candidate.collector),
  };
  assert.equal(afterMoney.receiver - beforeMoney.receiver, 950000n);
  assert.equal(afterMoney.fee - beforeMoney.fee, 50000n);
  assert.equal(beforeMoney.payer - afterMoney.payer, 1000000n);
  assert.equal(afterMoney.escrow - beforeMoney.escrow, 0n);
  assert.equal(afterMoney.collector - beforeMoney.collector, 0n);
  assert.equal(balanceOf(custody) - custodyBefore, 0n);
  const captureMoves = settledUsdc(captureReceipt).filter(row => row.amount === 950000n || row.amount === 50000n);
  assert.equal(captureMoves.some(row => row.to === receiver.address.toLowerCase() && row.amount === 950000n), true);
  assert.equal(captureMoves.some(row => row.to === FEE_RECIPIENT && row.amount === 50000n), true);
  assert.equal((beforeMoney.payer - afterMoney.payer), (afterMoney.receiver - beforeMoney.receiver) + (afterMoney.fee - beforeMoney.fee));
  report.capture = {state:approved.state, txRef:approved.outcome.txRef, captureTx:captureHash, feeAmount:approved.outcome.feeAmount, contributorNet:approved.settlement.contributorNet, contributorDelta:'950000', feeDelta:'50000', escrowDelta:'0', collectorDelta:'0', custodyDelta:'0'};
  report.refund = 'composed HTTP consumer has no refund action; rail refund stays unwired and was not called';
  const clientFund = await cold(['fund', ...common, '--secret-file', requesterSecret]);
  assert.equal(clientFund.body.ok, false);
  assert.equal(clientFund.body.paidWork, false);

  delete process.env.PILOT_MACHINE_OPERATOR_GRANT;
  await host.boot({qualified:true});
  const freeAfter = await cold(['export', ...common, '--secret-file', requesterSecret, '--task-id', voluntaryId, '--out', join(scratch, 'export-free.json')]);
  assert.equal(freeAfter.status, 0, JSON.stringify(freeAfter.body));
  assert.equal(freeAfter.body.paidWork, false);
  const paidAfterMissing = await call(requesterRole, 'fundingAuthorize', authorizeBody, 'authorize-funded-01');
  assert.equal(paidAfterMissing.body.ok, false);
  assert.notEqual(paidAfterMissing.body.code, undefined);
  assert.equal(paidAfterMissing.body.value, undefined);
  report.signs = globalThis.__h103010Signs || 0;
  report.missingOperator = paidAfterMissing.body.code;
  report.freeAfterMissing = true;
  report.voluntaryPaidWork = false;
  console.log(JSON.stringify({ok:true, ...report}));
} finally {
  delete process.env.PILOT_MACHINE_OPERATOR_GRANT;
  delete process.env.H103010_OPERATOR_KEY;
  await host.close();
}
