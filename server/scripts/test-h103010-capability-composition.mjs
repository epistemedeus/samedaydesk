import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import pg from 'pg';
import {machineHost} from './root10940-machine-host.mjs';
import {usefulEvidence} from '../../vendor/hosted-wallet-market/examples/participation-canary.mjs';
import {digest} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';
import {digest as canonicalDigest} from '../../vendor/hosted-wallet-market/src/canonical.mjs';
import {readSourceSuccession} from '../../vendor/hosted-wallet-market/src/source-succession.mjs';
import {voluntaryMarket} from '../../vendor/hosted-wallet-market/src/voluntary-market.mjs';
import {bindVoluntaryPredecessor} from '../../vendor/hosted-wallet-market/src/voluntary-predecessor.mjs';

const exec = promisify(execFile);
const clientPath = process.env.H103010_CLIENT || '/tmp/h113010-owned/client/cold-requester-0.3.1.mjs';
const clientBytes = readFileSync(clientPath);
assert.equal(createHash('sha256').update(clientBytes).digest('hex'), 'accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9');
assert.equal(clientBytes.length, 30187);
const published = JSON.parse(readFileSync(process.env.H103010_DESCRIPTOR || '/tmp/h113010-owned/client/descriptor-aa861e98.json', 'utf8'));
const codeOf = error => error?.code || error?.codeName || error?.message;

const host = await machineHost();
const scratch = join(host.scratch, 'h103010');
mkdirSync(scratch);
const route = action => '/api/neomorphic-contributor-journey/v1/market/' + action;
try {
  const capability = await host.boot();
  const descriptor = {...published, requiredProfile:{money:'unfunded', participation:'voluntary-artifact-v1',
    sourceSha256:capability.sourceSha256, hostSha256:capability.hostSha256}};
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
  const requester = await cold(['signup', ...common, '--secret-file', requesterSecret, '--display-name', 'h103010-requester', '--role', 'requester']);
  assert.equal(requester.status, 0, JSON.stringify(requester.body));
  const contributor = await cold(['signup', ...common, '--secret-file', contributorSecret, '--display-name', 'h103010-contributor', '--role', 'contributor']);
  assert.equal(contributor.status, 0, JSON.stringify(contributor.body));
  host.fault.dropAction = 'post';
  const dropped = await cold(['post', ...common, '--secret-file', requesterSecret, '--title', 'Need', '--summary', 'One unfunded need', '--criterion', 'preserve-mapping']);
  assert.equal(dropped.body.code, 'unknown_outcome');
  const returned = await cold(['readback', ...common, '--secret-file', requesterSecret, '--operation', 'post']);
  assert.equal(returned.status, 0, JSON.stringify(returned.body));
  assert.equal(returned.body.paidWork, undefined);
  assert.equal(returned.body.state, 'unfunded_interest');
  const posts = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_tasks`)).rows[0].n);
  const interested = await cold(['interest', ...common, '--secret-file', contributorSecret, '--peer-secret', requesterSecret, '--note', 'I can preserve the mapping']);
  assert.equal(interested.status, 0, JSON.stringify(interested.body));
  const requesterFile = JSON.parse(readFileSync(requesterSecret, 'utf8'));
  const contributorFile = JSON.parse(readFileSync(contributorSecret, 'utf8'));
  const taskId = requesterFile.taskId;
  const offerPath = join(scratch, 'offer.json');
  writeFileSync(offerPath, JSON.stringify({taskId, contributorId:contributorFile.accountId, authorizedToRequest:true,
    rights:{license:'CC0-1.0', scope:'synthetic-or-authorized-reusable-artifact', attribution:'Synthetic fixture'}}));
  const offered = await cold(['act', ...common, '--secret-file', requesterSecret, '--action', 'offerVoluntary', '--input', offerPath]);
  assert.equal(offered.status, 0, JSON.stringify(offered.body));
  const inspectedPath = join(scratch, 'inspected.json');
  const inspected = await cold(['inspect', ...common, '--secret-file', contributorSecret, '--task-id', taskId, '--out', inspectedPath]);
  assert.equal(inspected.status, 0, JSON.stringify(inspected.body));
  const inspectedBody = JSON.parse(readFileSync(inspectedPath, 'utf8'));
  const assentPath = join(scratch, 'assent.json');
  writeFileSync(assentPath, JSON.stringify({taskId, termsDigest:inspectedBody.termsDigest, expectedRevision:inspectedBody.revision, authorizedToShare:true, spec:inspectedBody.spec}));
  const assented = await cold(['act', ...common, '--secret-file', contributorSecret, '--action', 'assentVoluntary', '--input', assentPath]);
  assert.equal(assented.status, 0, JSON.stringify(assented.body));
  const deliverPath = join(scratch, 'deliver.json');
  writeFileSync(deliverPath, JSON.stringify({taskId, termsDigest:inspectedBody.termsDigest, expectedRevision:assented.body.revision, evidence:usefulEvidence()}));
  const delivered = await cold(['act', ...common, '--secret-file', contributorSecret, '--action', 'deliverVoluntary', '--input', deliverPath]);
  assert.equal(delivered.status, 0, JSON.stringify(delivered.body));
  const reviewPath = join(scratch, 'review.json');
  writeFileSync(reviewPath, JSON.stringify({taskId, termsDigest:inspectedBody.termsDigest, expectedRevision:delivered.body.revision,
    artifactDigest:delivered.body.artifactDigest, accepted:true, exportAuthorized:true, reason:'Mapping preserved'}));
  const reviewed = await cold(['act', ...common, '--secret-file', requesterSecret, '--action', 'reviewVoluntary', '--input', reviewPath]);
  assert.equal(reviewed.status, 0, JSON.stringify(reviewed.body));
  const exported = await cold(['export', ...common, '--secret-file', requesterSecret, '--task-id', taskId, '--out', join(scratch, 'export.json')]);
  assert.equal(exported.status, 0, JSON.stringify(exported.body));
  assert.equal(exported.body.paidWork, false);
  const replayed = await cold(['readback', ...common, '--secret-file', requesterSecret, '--operation', 'offerVoluntary']);
  assert.equal(replayed.status, 0, JSON.stringify(replayed.body));
  const termsText = (await host.query(`SELECT voluntary::text AS voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0].voluntary;
  const obligations = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_obligations`)).rows[0].n);
  const debt = Number((await host.query(`SELECT count(*)::int AS n FROM hosted_wallet_market.native_debt_dispositions`)).rows[0].n);
  const quotes = Number((await host.query(`SELECT count(*)::int AS n FROM hosted_wallet_market.quotes`)).rows[0].n);
  const accounts = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.journey_accounts`)).rows[0].n);

  const requesterRole = {cookie:requesterFile.cookie, csrf:requesterFile.csrf};
  const contributorRole = {cookie:contributorFile.cookie, csrf:contributorFile.csrf};
  const call = (role, action, body, operationId, headers = {}) => host.request(route(action), {role, body, operationId, headers});
  const earlyFund = await call(requesterRole, 'fund', {taskId, quoteDigest:'ab'.repeat(32), proofId:'proof-early'}, 'fund-early-0001', {'x-machine-capability':'qualified'});
  assert.equal(earlyFund.body.ok, false);
  assert.equal(earlyFund.body.code, 'qualified_selection_required');
  const earlySelect = await call(requesterRole, 'selectCapability', {capability:'qualified'}, 'select-missing-01');
  assert.equal(earlySelect.body.code, 'machine_authority_required');

  await host.boot({qualified:true});
  const profile = await host.request(route('profile'), {method:'GET'});
  assert.equal(profile.body.value.capability.money, 'unfunded');
  assert.equal(profile.body.value.signerAuthority, false);
  assert.equal(profile.body.value.capability.sourceSha256, capability.sourceSha256);
  const chosen = await call(requesterRole, 'selectCapability', {capability:'qualified'}, 'select-qualified-01');
  assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
  assert.equal(chosen.body.value.result.paymentAuthority, false);
  assert.equal(chosen.body.value.result.signerAuthority, false);
  const replaySelect = await call(requesterRole, 'selectCapability', {capability:'qualified'}, 'select-qualified-01');
  assert.equal(replaySelect.status, 200);
  const paid = await call(requesterRole, 'fund', {taskId, quoteDigest:'ab'.repeat(32), proofId:'proof-qualified'}, 'fund-qualified-01', {'x-machine-capability':'qualified'});
  assert.notEqual(paid.status, 200);
  assert.equal(paid.body.ok, false);
  assert.equal(paid.body.value, undefined);
  const back = await call(requesterRole, 'selectCapability', {capability:'unfunded'}, 'select-unfunded-01');
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.value.result.paymentAuthority, false);
  const replayFirst = await call(requesterRole, 'selectCapability', {capability:'qualified'}, 'select-qualified-01');
  assert.equal(replayFirst.status, 200, JSON.stringify(replayFirst.body));
  assert.equal(replayFirst.body.value.result.capability, 'qualified');
  const projection = (await host.query(`SELECT capability, operation_id FROM hosted_wallet_market.capability_selection WHERE account_id=$1`, [requesterFile.accountId])).rows[0];
  assert.equal(projection.capability, 'unfunded');
  assert.equal(projection.operation_id, 'select-unfunded-01');
  const unfundedPaid = await call(requesterRole, 'fund', {taskId, quoteDigest:'ab'.repeat(32), proofId:'proof-unfunded'}, 'fund-unfunded-01');
  assert.equal(unfundedPaid.body.code, 'qualified_selection_required');
  const conflict = await call(requesterRole, 'selectCapability', {capability:'qualified'}, 'select-unfunded-01');
  assert.equal(conflict.body.code, 'operation_conflict');
  const [requesterAgain, contributorChoice] = await Promise.all([
    call(requesterRole, 'selectCapability', {capability:'unfunded'}, 'select-requester-02'),
    call(contributorRole, 'selectCapability', {capability:'qualified'}, 'select-contributor-01'),
  ]);
  assert.equal(requesterAgain.status, 200, JSON.stringify(requesterAgain.body));
  assert.equal(contributorChoice.status, 200, JSON.stringify(contributorChoice.body));
  const contributorFund = await call(contributorRole, 'fund', {taskId, quoteDigest:'ab'.repeat(32), proofId:'proof-contributor'}, 'fund-contributor-01');
  assert.equal(contributorFund.body.code, 'requester_required');
  const stillVoluntary = await cold(['export', ...common, '--secret-file', requesterSecret, '--task-id', taskId, '--out', join(scratch, 'export-live.json')]);
  assert.equal(stillVoluntary.status, 0, JSON.stringify(stillVoluntary.body));
  assert.equal(stillVoluntary.body.paidWork, false);
  const clientFund = await cold(['fund', ...common, '--secret-file', requesterSecret]);
  assert.equal(clientFund.body.ok, false);
  assert.equal(clientFund.body.paidWork, false);
  const denied = await call(requesterRole, 'receivePredecessor', {taskId, termsDigest:inspectedBody.termsDigest}, 'receive-unbound-01');
  assert.equal(denied.body.code, 'voluntary_predecessor_unbound');
  assert.equal((await host.query(`SELECT voluntary::text AS voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0].voluntary, termsText);

  const modulePath = join(scratch, 'authority.mjs');
  const journalPath = join(scratch, 'authority-journal.sqlite');
  writeFileSync(modulePath, `export async function openMachineAuthority(){return {
    networkClass:'owned-fork', forkId:'h103010-disposable', rpcUrl:${JSON.stringify('http://127.0.0.1:' + host.rpcPort)},
    operator:{address:'${'0x' + 'ab'.repeat(20)}', async signTransaction(){throw Object.assign(Error('sign_refused'),{codeName:'sign_refused'});}},
    async readAuthorization(){return null;}, grantEpoch:1,
    feeLimits:{gasLimit:'21000', maxFeePerGas:'1', maxPriorityFeePerGas:'1'}, nativeBudget:'1000000000000000',
    journalPath:${JSON.stringify(journalPath)} };}\n`);
  chmodSync(modulePath, 0o600);
  await host.boot({qualified:true, authorityModule:modulePath});
  const profileAgain = await host.request(route('profile'), {method:'GET'});
  assert.equal(profileAgain.body.value.capability.money, 'unfunded');
  assert.equal(profileAgain.body.value.signerAuthority, false);
  const selectedAfterAuthority = await call(requesterRole, 'selectCapability', {capability:'qualified'}, 'select-authority-01');
  assert.equal(selectedAfterAuthority.status, 200, JSON.stringify(selectedAfterAuthority.body));
  assert.equal(selectedAfterAuthority.body.value.result.paymentAuthority, false);
  const refusedPaid = await call(requesterRole, 'quote', {taskId, contributorId:contributorFile.accountId, gross:'1000000', railCostCap:'1', expiresAt:'2099-01-01T00:00:00.000Z'}, 'quote-authority-01');
  assert.notEqual(refusedPaid.status, 200);
  assert.equal(refusedPaid.body.ok, false);
  const afterRestart = await host.boot({qualified:true, authorityModule:modulePath});
  assert.equal(afterRestart.sourceSha256, capability.sourceSha256);
  const exportedAfter = await cold(['export', ...common, '--secret-file', requesterSecret, '--task-id', taskId, '--out', join(scratch, 'export-restart.json')]);
  assert.equal(exportedAfter.status, 0, JSON.stringify(exportedAfter.body));
  const paidAfter = await call(requesterRole, 'fundingAuthorize', {taskId, quoteDigest:'ab'.repeat(32), proofId:'proof-restart', signature:'0x' + 'ab'.repeat(65)}, 'authorize-restart-01');
  assert.notEqual(paidAfter.status, 200);
  assert.equal(paidAfter.body.ok, false);

  const pred = '12'.repeat(32), predHost = '34'.repeat(32), contract = '56'.repeat(32);
  const db = new pg.Client({connectionString:host.databaseUrl});
  await db.connect();
  try {
    await db.query('SET search_path TO cj227_earned_work, hosted_wallet_market, public');
    const seal = canonicalDigest([]);
    await db.query(`INSERT INTO hosted_wallet_market.source_succession
      (predecessor_source_sha256, successor_source_sha256, successor_host_source_sha256, consumer_contract_sha256, preservation_sha256, created_at)
      VALUES ($1,$2,$3,$4,$5,clock_timestamp())`, [pred, capability.sourceSha256, capability.hostSha256, contract, seal]);
    const observationSeal = async () => seal;
    const principal = '78'.repeat(32);
    // An edge that the enrolled package cannot reach is corruption, not a shortcut.
    await assert.rejects(readSourceSuccession(db, {source_sha256:capability.sourceSha256, host_source_sha256:capability.hostSha256, consumer_contract_sha256:contract}, observationSeal, principal), error => codeOf(error) === 'binding_stale');
    const walked = await readSourceSuccession(db, {source_sha256:pred, host_source_sha256:predHost, consumer_contract_sha256:contract}, observationSeal, principal);
    assert.deepEqual(walked.nodes.map(node => node.sourceSha256), [pred, capability.sourceSha256]);
    const spec = {title:'predecessor'};
    const terms = {schema:'pilot.machine-market.voluntary-terms.v1', origin:capability.origin, tenantId:'root10940-owner-qa-fixture',
      taskId:'pred-task', requesterId:'requester', contributorId:'contributor', specDigest:digest(spec),
      rights:{license:'CC0-1.0', scope:'synthetic-or-authorized-reusable-artifact', attribution:'Synthetic'},
      sourceSha256:pred, hostSha256:predHost, funding:'voluntary', contributionRequired:false, paymentAuthority:'none',
      requesterReviewRequired:true, exportRequiresBothParties:true};
    const termsDigest = digest(terms);
    const evidence = usefulEvidence();
    const row = {id:'pred-task', tenant_id:terms.tenantId, requester_id:'requester', spec,
      voluntary:{revision:4, terms, termsDigest, assented:true, artifact:{evidence, digest:digest(evidence)},
        review:{requesterId:'requester', artifactDigest:digest(evidence), accepted:true, exportAuthorized:true, reason:'ok', authority:'requester_decision'}}};
    const frozen = JSON.stringify(row.voluntary);
    const wrap = chain => ({schema:'pilot.native-debt.source-succession.v1', bindings:chain.nodes,
      current:{sourceSha256:capability.sourceSha256, hostSourceSha256:capability.hostSha256},
      graphSha256:canonicalDigest(chain.edges.map(({created_at, ...edge}) => edge))});
    const forged = wrap(walked);
    forged.bindings = [{sourceSha256:'99'.repeat(32), hostSourceSha256:predHost}];
    await assert.rejects(bindVoluntaryPredecessor(db, {tenantId:terms.tenantId, taskId:row.id, terms, termsDigest, chain:forged,
      successor:{sourceSha256:capability.sourceSha256, hostSha256:capability.hostSha256}, operationId:'bind-forged-01'}), error => codeOf(error) === 'voluntary_predecessor_unbound');
    await db.query('BEGIN');
    const bound = await bindVoluntaryPredecessor(db, {tenantId:terms.tenantId, taskId:row.id, terms, termsDigest, chain:wrap(walked),
      successor:{sourceSha256:capability.sourceSha256, hostSha256:capability.hostSha256}, operationId:'bind-real-0001'});
    await db.query('COMMIT');
    assert.equal(bound.termsRewritten, false);
    assert.equal(JSON.stringify(row.voluntary), frozen);
    const successor = voluntaryMarket({market:{actor:async () => ({tenantId:row.tenant_id, actorId:'requester'}), member:async () => ({role:'requester'}),
      store:{locked:async (_tenant, _id, fn) => fn(row, {query:async () => ({rows:[]})}), table:() => 't'}},
      capability:{...capability, money:'unfunded', participation:'voluntary-artifact-v1'}});
    await assert.rejects(successor.invoke({}, 'readVoluntary', {taskId:row.id}), error => codeOf(error) === 'voluntary_source_changed');
    const boundMarket = voluntaryMarket({market:successor && {actor:async () => ({tenantId:row.tenant_id, actorId:'requester'}), member:async () => ({role:'requester'}),
      store:{locked:async (_tenant, _id, fn) => fn(row, {query:async () => ({rows:[]})}), table:() => 't'}},
      capability:{money:'unfunded', participation:'voluntary-artifact-v1', origin:capability.origin, sourceSha256:capability.sourceSha256, hostSha256:capability.hostSha256},
      predecessorBinding:async (id, digestValue) => (await db.query(`SELECT terms_digest, predecessor_source_sha256, predecessor_host_sha256, successor_source_sha256, successor_host_sha256
        FROM hosted_wallet_market.voluntary_predecessor_binding WHERE tenant_id=$1 AND task_id=$2 AND terms_digest=$3
          AND successor_source_sha256=$4 AND successor_host_sha256=$5`, [terms.tenantId, id, digestValue, capability.sourceSha256, capability.hostSha256])).rows[0] ?? null});
    const read = await boundMarket.invoke({}, 'readVoluntary', {taskId:row.id});
    assert.equal(read.paidWork, false);
    assert.equal(read.termsDigest, termsDigest);
    assert.equal(JSON.stringify(row.voluntary), frozen);
    const exportedPredecessor = await boundMarket.invoke({}, 'exportVoluntary', {taskId:row.id});
    assert.equal(exportedPredecessor.paidWork, false);
    assert.equal(exportedPredecessor.evidence.kind, 'usable');
    const nextSource = 'ab'.repeat(32), nextHost = 'cd'.repeat(32);
    const second = wrap(walked);
    second.current = {sourceSha256:nextSource, hostSourceSha256:nextHost};
    await db.query('BEGIN');
    const boundNext = await bindVoluntaryPredecessor(db, {tenantId:terms.tenantId, taskId:row.id, terms, termsDigest, chain:second,
      successor:{sourceSha256:nextSource, hostSha256:nextHost}, operationId:'bind-real-0002'});
    await db.query('COMMIT');
    assert.equal(boundNext.termsRewritten, false);
    assert.equal(JSON.stringify(row.voluntary), frozen);
    const storedBindings = (await db.query(`SELECT successor_source_sha256 FROM hosted_wallet_market.voluntary_predecessor_binding WHERE tenant_id=$1 AND task_id=$2 AND terms_digest=$3 ORDER BY successor_source_sha256`, [terms.tenantId, row.id, termsDigest])).rows.map(item => item.successor_source_sha256);
    assert.deepEqual(storedBindings, [capability.sourceSha256, nextSource].sort());
    const laterMarket = voluntaryMarket({market:successor && {actor:async () => ({tenantId:row.tenant_id, actorId:'requester'}), member:async () => ({role:'requester'}),
      store:{locked:async (_tenant, _id, fn) => fn(row, {query:async () => ({rows:[]})}), table:() => 't'}},
      capability:{money:'unfunded', participation:'voluntary-artifact-v1', origin:capability.origin, sourceSha256:nextSource, hostSha256:nextHost},
      predecessorBinding:async (id, digestValue) => (await db.query(`SELECT terms_digest, predecessor_source_sha256, predecessor_host_sha256, successor_source_sha256, successor_host_sha256
        FROM hosted_wallet_market.voluntary_predecessor_binding WHERE tenant_id=$1 AND task_id=$2 AND terms_digest=$3
          AND successor_source_sha256=$4 AND successor_host_sha256=$5`, [terms.tenantId, id, digestValue, nextSource, nextHost])).rows[0] ?? null});
    const laterRead = await laterMarket.invoke({}, 'readVoluntary', {taskId:row.id});
    assert.equal(laterRead.paidWork, false);
    assert.equal(laterRead.termsDigest, termsDigest);
    const stillFirst = await boundMarket.invoke({}, 'readVoluntary', {taskId:row.id});
    assert.equal(stillFirst.termsDigest, termsDigest);
    assert.equal(JSON.stringify(row.voluntary), frozen);
  } finally { await db.end(); }

  assert.equal(Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.journey_accounts`)).rows[0].n), accounts);
  assert.equal(Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_obligations`)).rows[0].n), obligations);
  assert.equal(Number((await host.query(`SELECT count(*)::int AS n FROM hosted_wallet_market.native_debt_dispositions`)).rows[0].n), debt);
  assert.equal(Number((await host.query(`SELECT count(*)::int AS n FROM hosted_wallet_market.quotes`)).rows[0].n), quotes);
  assert.equal(Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_tasks`)).rows[0].n), posts + 0 || posts);
  const selections = Number((await host.query(`SELECT count(*)::int AS n FROM hosted_wallet_market.capability_selection`)).rows[0].n);
  const receipts = Number((await host.query(`SELECT count(*)::int AS n FROM hosted_wallet_market.capability_selection_receipt`)).rows[0].n);
  assert.equal(selections, 2);
  assert.ok(receipts > selections);
  assert.equal((await host.query(`SELECT voluntary::text AS voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0].voluntary, termsText);
  console.log(JSON.stringify({ok:true, accounts, obligations, debt, quotes, selections, posts, paidRefused:true, predecessorBound:true}));
} finally { await host.close(); }
