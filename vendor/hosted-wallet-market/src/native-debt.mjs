import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,readFileSync, readdirSync, lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, resolve, parse, dirname} from 'node:path';
import {digest} from './canonical.mjs';
import {readSourceSuccession as readSourceSuccessionChain, sourcePair, sourcePairKey} from './source-succession.mjs';
import {assertRpcUrl, readPublicChain, readRailTransfer} from './chain.mjs';
import {readAuthoritativeDischarge, registryIdentity, configuredRegistryIdentity, pendingRegistryDisposition} from './discharge-authority.mjs';
import {matchDebt, storedDebt} from './debt-source.mjs';

export const IMPORT_CONTRACT_SHA256 = '414ba86df5bfacd2876f38bd62d11781e9c9971cd8219ceec577f85dc0f93063';
export const RAIL_NETWORK = 'eip155:8453';
export const RAIL_TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const CANONICAL_DISCHARGE = Object.freeze({
  obligationId: 'oobl_izUh7nn9vd_APjsR',
  reservationId: 'root-fund-continuity-234100',
  taskId: 'continuity-234100-v1:continuity',
  network: RAIL_NETWORK,
  token: RAIL_TOKEN,
  transactionHash: '0xc90108e141b78d6581b4bc39dc810723570d492fd0fdd57622137aa2a6efc2de',
  logIndex: 102,
  blockNumber: '52729611',
  blockHash: '0xbd9b0483c98a4fd41708b0385bf476a1d7bc724ce8e239f44f1272b3e3db6699',
  amountAtomic: '100000',
  receiptId: '83b4331a83480cce74a2d5142b66149c986f913621cc121a859e25c6bef3ac4e',
  receivedAt: '2026-10-17T14:49:36.737Z',
  recipient: '0x2dc4309f29a1ad89bea07059c4633a33f8238e5b',
  source: '0x8904df3de6dfee6a7c8cc38619d2f17806213cee',
  blockTimestamp: '2026-10-17T14:49:29.000Z',
});


export const NATIVE_DEBT_CONSUMER = Object.freeze({
  schema: 'pilot.root71.native-debt.consumer.v1', version: 3, role: 'receivingConsumer',
  bindsImportContract: 'pilot.native-obligation.import-contract.v1', bindsImportContractVersion: 2,
  bindsImportContractSha256: IMPORT_CONTRACT_SHA256, store: 'hosted_wallet_market.native_debt_dispositions',
  enrollment: 'hosted_wallet_market.consumer_enrollment', rail: RAIL_NETWORK, token: RAIL_TOKEN,
  archivalObligationPayoutState: 'owed', projectionWhenBound: 'native_paid',
  allocationAuthority: 'existing_root_controller_registry', sourceBinding: 'complete_package_and_host_closure',
  finality: 'finalized_canonical_block', suppliedBooleansAreNotPaidAuthority: true, secondTransfer: false,
  persistedBaseline: 'hosted_wallet_market_native_debt_disposition',
});
export const IMPORT_BODY_KEYS = Object.freeze(['importContractSha256','tenant','obligationId','reservationId','taskId','termsVersion',
  'network','token','transactionHash','logIndex','blockNumber','amountAtomic','receiptId','receivedAt']);
const sha = value => createHash('sha256').update(value).digest('hex');
const root = fileURLToPath(new URL('../', import.meta.url));
const fail = (code = 'disposition_hold', http = 409) => { throw Object.assign(new Error(code), {http, codeName: code}); };
export const consumerContractSha256 = () => digest(NATIVE_DEBT_CONSUMER);
export function installedSourceFiles() {
  const walk = dir => readdirSync(join(root, dir)).sort().flatMap(name => {
    const file = `${dir}/${name}`, stat = lstatSync(join(root, file));
    if (stat.isSymbolicLink()) fail('binding_stale');
    return stat.isDirectory() ? walk(file) : [file];
  });
  return ['package.json', 'package-lock.json', ...['bin', 'client', 'contracts', 'schema', 'src', 'runtime'].flatMap(walk)].sort();
}
function boundSourceBytes(base,name) {
    const file = resolve(base, name);
    let current = parse(file).root;
    for (const part of dirname(file).slice(current.length).split('/').filter(Boolean)) {
      current = join(current, part);
      const parent = lstatSync(current);
      if (!parent.isDirectory() || parent.isSymbolicLink()) fail('binding_stale');
    }
    let fd;
    try {
      fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const stat=fstatSync(fd);
      if(!stat.isFile())fail('binding_stale');
      const bytes=readFileSync(fd);
      if(bytes.length!==stat.size)fail('binding_stale');
      return bytes;
    }catch{fail('binding_stale');}finally{if(fd!==undefined)closeSync(fd);}
}
function hashFiles(base, files) {
  const hash = createHash('sha256');
  for (const name of [...files].sort()) {
    hash.update(name); hash.update('\0'); hash.update(boundSourceBytes(base,name)); hash.update('\0');
  }
  return hash.digest('hex');
}
export const installedSourceSha256 = () => hashFiles(root, installedSourceFiles());
export const rpcOriginSha256 = url => sha(assertRpcUrl(url).origin);
const endpointHash = url => sha(assertRpcUrl(url).href);
export function hostSourceSha256(sdsRoot) {
  if (!sdsRoot) fail('discharge_consumer_unbound');
  const pinFile='server/foundry/activation/private-control-pin.json';
  const pin=JSON.parse(boundSourceBytes(sdsRoot,pinFile).toString('utf8'));
  const files=Object.keys(pin.files);
  if(!files.length||files.length>4000||files.some(name=>name.startsWith('/')||name.includes('..')||name.includes('\\'))) fail('binding_stale');
  for(const file of files) if(sha(boundSourceBytes(sdsRoot,file))!==pin.files[file]) fail('binding_stale');
  return hashFiles(sdsRoot,[...files,pinFile]);
}
const plainId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f/\\]/.test(value) && !value.includes('..');
export function assertImportShape(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !IMPORT_BODY_KEYS.includes(k)) || IMPORT_BODY_KEYS.some(k => body[k] === undefined)) fail('body_refused', 400);
  if (!/^[0-9a-f]{64}$/.test(body.importContractSha256) || !/^[a-z][a-z0-9_-]{2,63}$/.test(body.tenant) ||
      !plainId(body.obligationId) || !plainId(body.reservationId) || !plainId(body.taskId) || !/^sha256:[0-9a-f]{64}$/.test(body.termsVersion) ||
      typeof body.network !== 'string' || !/^eip155:[0-9]+$/.test(body.network) || !/^0x[0-9a-f]{40}$/.test(body.token) ||
      !/^0x[0-9a-f]{64}$/.test(body.transactionHash) || !Number.isSafeInteger(body.logIndex) || body.logIndex < 0 || body.logIndex > 2147483647 ||
      typeof body.blockNumber !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(body.blockNumber) ||
      typeof body.amountAtomic !== 'string' || !/^[1-9][0-9]{0,18}$/.test(body.amountAtomic) || !/^[0-9a-f]{64}$/.test(body.receiptId) ||
      typeof body.receivedAt !== 'string' || !Number.isFinite(Date.parse(body.receivedAt)) || new Date(body.receivedAt).toISOString() !== body.receivedAt) fail('body_refused', 400);
}
const ROW_SQL = 'SELECT * FROM hosted_wallet_market.native_debt_dispositions';
const ENROLL_SQL = 'SELECT * FROM hosted_wallet_market.consumer_enrollment WHERE id IS TRUE';
export function dispositionView(row) {
  if (row.import_state !== 'bound' || !row.kernel_paid || row.kernel_transfer !== row.transaction_hash ||
      !row.native_paid_observation || row.transfer_initiated || row.payout_state !== 'owed') fail();
  return {schema: 'pilot.root71.native-debt.disposition.v1', state: 'bound', disposition: row.disposition, importState: 'bound',
    projection: 'native_paid', payable: false, newPayable: false, kernelPaid: true, kernelTransfer: row.kernel_transfer,
    nativePaidObservation: true, transferInitiated: false, payoutState: 'owed', obligationId: row.obligation_id,
    obligationFamily: row.obligation_family, tenant: row.tenant, reservationId: row.reservation_id, claimId: row.claim_id,
    taskId: row.task_id, termsVersion: row.terms_version, network: row.network, token: row.token, recipient: row.recipient,
    observedSource: row.observed_source, transactionHash: row.transaction_hash, logIndex: row.log_index, blockNumber: row.block_number,
    blockHash: row.block_hash, amountAtomic: row.amount_atomic, receiptId: row.receipt_id, receivedAt: new Date(row.received_at).toISOString(),
    importContractSha256: row.import_contract_sha256, consumerContractSha256: row.consumer_contract_sha256};
}

/** Called only by the installed server with its closed-over profile. No JSON
 * binding, public baseline, environment reassignment, or test seam is consulted. */
export function createInstalledDebtConsumer({profile, sdsRoot, registryRoot, readAcceptedSource, authorityPrincipalId}) {
  const configured = Object.freeze({...profile});
  const databaseUrl = new URL(profile.databaseUrl);
  const databaseIdentity = {host: databaseUrl.hostname, port: databaseUrl.port || '5432', database:decodeURIComponent(databaseUrl.pathname)};
  const profileSha256 = digest({databaseIdentity, tenant: profile.tenant, earnedSchema: profile.earnedSchema, chain: profile.chain,
    payments: profile.payments, publicReads: profile.publicReads, fundedTasks: profile.fundedTasks, humanAssets: profile.humanAssets,
    tls: profile.tls, origin: profile.origin || null, token: profile.settlementToken, feeRecipient: profile.feeRecipient});
  function binding(registryDigest) {
    if (!registryRoot) fail('discharge_consumer_unbound');
    if (configured.chain !== RAIL_NETWORK || configured.payments !== 'off' || configured.settlementToken !== RAIL_TOKEN) fail('binding_stale');
    return {source_sha256: installedSourceSha256(), host_source_sha256: hostSourceSha256(sdsRoot),
      import_contract_sha256: IMPORT_CONTRACT_SHA256, consumer_contract_sha256: consumerContractSha256(),
      tenant: configured.tenant, earned_schema: configured.earnedSchema, network: RAIL_NETWORK, token: RAIL_TOKEN,
      rpc_origin_sha256: rpcOriginSha256(configured.rpcUrl), rpc_endpoint_sha256: endpointHash(configured.rpcUrl),
      registry_sha256: registryDigest(), profile_sha256: profileSha256, profile_chain: configured.chain};
  }
  const expected=()=>binding(()=>registryIdentity(registryRoot));
  // Descriptor only: no enrollment/read/import can use this as authority.
  const describeRemoteBinding=()=>binding(()=>configuredRegistryIdentity(registryRoot));
  const equal = (a, b) => Object.keys(b).every(key => a[key] === b[key]);
  const PRESERVE = Object.freeze(['obligation_id', 'authority_receipt_sha256', 'amount_atomic', 'reservation_id', 'task_id', 'terms_version', 'transaction_hash', 'log_index', 'observed_source', 'artifact_digest_sha256', 'payout_state', 'receipt_id']);
  async function observationSeal(tx, through = null, complete = false) {
    if (complete) {
      const rows = (await tx.query(`SELECT to_jsonb(d) || jsonb_build_object(
        'created_at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'received_at', to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'block_timestamp', to_char(block_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS observation
        FROM hosted_wallet_market.native_debt_dispositions d
        WHERE ($1::timestamptz IS NULL OR created_at <= $1) ORDER BY obligation_id`, [through])).rows;
      return digest(rows.map(row => row.observation));
    }
    const rows = (await tx.query(`SELECT ${PRESERVE.join(', ')} FROM hosted_wallet_market.native_debt_dispositions
      WHERE ($1::timestamptz IS NULL OR created_at <= $1) ORDER BY obligation_id`, [through])).rows;
    return digest(rows.map(row => {
      const item = {};
      for (const key of PRESERVE) item[key] = key === 'log_index' ? Number(row[key]) : String(row[key]);
      return item;
    }));
  }
  function sourceDriftOnly(row, next) {
    return equal(row, {...next, source_sha256: row.source_sha256, host_source_sha256: row.host_source_sha256});
  }
  const successionChain = (tx, row) => readSourceSuccessionChain(tx, row, observationSeal, authorityPrincipalId);
  async function successionMatches(tx, row, next) {
    if (!sourceDriftOnly(row, next)) return false;
    return (await successionChain(tx, row)).nodes.some(pair => sourcePairKey(pair) === sourcePairKey(sourcePair(next)));
  }
  function enrollmentView(row) {
    let qualified = false;
    try { qualified = equal(row, expected()); } catch { /* explicit unavailable */ }
    return {schema: 'pilot.root71.native-debt.enrollment.v1', state: 'enrolled', qualified,
      sourceSha256: row.source_sha256, hostSourceSha256: row.host_source_sha256, importContractSha256: row.import_contract_sha256,
      consumerContractSha256: row.consumer_contract_sha256, tenant: row.tenant, network: row.network, token: row.token,
      rpcOriginSha256: row.rpc_origin_sha256, rpcEndpointSha256: row.rpc_endpoint_sha256, profileChain: row.profile_chain,
      profileSha256: row.profile_sha256, boundConsumer: 'hosted_wallet_market.native_debt_dispositions'};
  }
  async function assertEnrollmentAuthority(tx, row) {
    // Predecessor packages already stored their authenticated owner principal
    // with the successful empty-body enroll operation. Reuse that consent;
    // changing the configured bearer cannot adopt it. Missing history is a hold.
    if (!/^[0-9a-f]{64}$/.test(authorityPrincipalId || '')) fail('enrollment_conflict');
    const consent = {...enrollmentView(row), qualified: true};
    const operations = (await tx.query(`SELECT DISTINCT principal_id FROM earned_work_idempotency
      WHERE scope='hosted-wallet-market' AND task_id='' AND status_code=200
      AND request_hash=$1 AND response_json->'value' @> $2::jsonb`, [
      digest({method: 'POST', route: '/api/neomorphic-contributor-journey/v1/native-debt/enroll', body: {}}),
      JSON.stringify(consent),
    ])).rows;
    if (operations.length !== 1 || operations[0].principal_id !== authorityPrincipalId) fail('enrollment_conflict');
  }
  async function assertInstallation(tx) {
    const installation = (await tx.query('SELECT * FROM hosted_wallet_market.installation WHERE id IS TRUE')).rows[0];
    if (!installation || installation.tenant !== configured.tenant || installation.earned_schema !== configured.earnedSchema ||
        installation.chain !== configured.chain || installation.payments !== 'off') fail('binding_stale');
  }
  async function assertBinding(tx) {
    const row = (await tx.query(ENROLL_SQL)).rows[0];
    if (!row) fail('discharge_consumer_unbound');
    const next = expected();
    if (!await successionMatches(tx, row, next)) fail('binding_stale');
    await assertEnrollmentAuthority(tx, row);
    await assertInstallation(tx);
    return row;
  }
  async function assertEnrollmentCandidate(tx) {
    const next = expected(), row = (await tx.query(ENROLL_SQL)).rows[0];
    if (row && !equal(row, next) && !sourceDriftOnly(row, next)) fail('enrollment_conflict');
    if (row) await assertEnrollmentAuthority(tx, row);
  }
  async function enroll(tx, createdAt) {
    const next = expected();
    const observed = await readPublicChain(configured.rpcUrl, RAIL_NETWORK);
    if (observed.chain !== configured.chain) fail('binding_stale');
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('native-debt-enrollment', 0))");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('native-debt-projection', 0))");
    let row = (await tx.query(ENROLL_SQL)).rows[0];
    const fresh = !row;
    if (!row) {
      const fields = Object.keys(next);
      await tx.query(`INSERT INTO hosted_wallet_market.consumer_enrollment (id, ${fields.join(',')}, created_at)
        VALUES (TRUE, ${fields.map((_,i) => '$' + (i+1)).join(',')}, $${fields.length+1})`, [...Object.values(next), createdAt]);
      row = (await tx.query(ENROLL_SQL)).rows[0];
    } else {
      if (!sourceDriftOnly(row, next)) fail('enrollment_conflict');
      await assertEnrollmentAuthority(tx, row);
      const chain = await successionChain(tx, row);
      const pair = sourcePair(next);
      const known = chain.nodes.some(node => sourcePairKey(node) === sourcePairKey(pair));
      // This lock is shared with imports. Use database time after both locks,
      // never request-start time, for an exact paid-observation boundary.
      if (!known) {
        if (chain.edges.length >= 64) fail('binding_stale');
        const stamp = (await tx.query('SELECT clock_timestamp()::text AS stamp')).rows[0].stamp;
        const seal = await observationSeal(tx, stamp, true);
        if (!chain.anchor) await tx.query(`INSERT INTO hosted_wallet_market.source_binding_anchor
          (id, legacy_chain_sha256, legacy_edge_count, preservation_sha256, principal_id, created_at)
          VALUES (TRUE, $1, $2, $3, $4, $5)`, [chain.legacyDigest, chain.legacyCount, seal, authorityPrincipalId, stamp]);
        await tx.query(`INSERT INTO hosted_wallet_market.source_binding_succession
          (predecessor_source_sha256, predecessor_host_source_sha256, successor_source_sha256,
           successor_host_source_sha256, consumer_contract_sha256, preservation_sha256, principal_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [chain.tail.sourceSha256, chain.tail.hostSourceSha256, pair.sourceSha256, pair.hostSourceSha256,
            next.consumer_contract_sha256, seal, authorityPrincipalId, stamp]);
      }
    }
    // mutate stores initial consent in this transaction after this returns.
    // The HTTP owner entry checks the complete binding after that insert,
    // including on a cached response, and before COMMIT.
    if (fresh) await assertInstallation(tx);
    else await assertBinding(tx);
    const view = enrollmentView(row);
    view.qualified = true;
    view.sourceBinding = sourcePair(next);
    return view;
  }
  async function importNativeDischarge(tx, body, createdAt) {
    assertImportShape(body);
    await assertBinding(tx);
    if (body.importContractSha256 !== IMPORT_CONTRACT_SHA256 || body.tenant !== configured.tenant || body.network !== RAIL_NETWORK || body.token !== RAIL_TOKEN) fail();
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('native-debt-projection', 0))");
    const {receipt, allocation} = readAuthoritativeDischarge(registryRoot, body);
    const stored = await storedDebt(tx, body.obligationId, {readAcceptedSource});
    matchDebt(stored, receipt);
    // The financial reservation is separate from the kernel claim id.
    const taken = (await tx.query(`${ROW_SQL} WHERE (network=$1 AND token=$2 AND transaction_hash=$3 AND log_index=$4) OR reservation_id=$5`,
      [body.network, body.token, body.transactionHash, body.logIndex, body.reservationId])).rows;
    if (taken.some(row => row.obligation_id !== body.obligationId)) fail(taken.some(row => row.transaction_hash === body.transactionHash && row.log_index === body.logIndex) ? 'transfer_already_allocated' : 'reservation_already_allocated');
    const existing = (await tx.query(`${ROW_SQL} WHERE obligation_id=$1`, [body.obligationId])).rows[0];
    const receiptSha = digest(receipt), requestSha = digest(body);
    if (existing) {
      if (existing.authority_receipt_sha256 !== receiptSha || existing.request_sha256 !== requestSha) fail();
      return dispositionView(existing);
    }
    let observed;
    try { observed = await readRailTransfer(configured.rpcUrl, body); }
    catch (error) { if (error.codeName === 'transfer_unverified') fail(); throw error; }
    for (const key of ['source','recipient','amountAtomic','blockNumber','blockHash','blockTimestamp','logIndex']) if (observed[key] !== receipt[key]) fail();
    if (Date.parse(body.receivedAt) < observed.blockTimestampMs || Date.parse(body.receivedAt) > Date.now()+5000) fail();
    const row = {obligation_id: body.obligationId, obligation_family: stored.family, tenant: body.tenant, reservation_id: body.reservationId,
      claim_id: stored.claimId, task_id: body.taskId, terms_version: body.termsVersion, submission_id: stored.submissionId,
      verdict_id: stored.verdictId, artifact_digest_sha256: stored.artifactDigestSha256, network: body.network, token: body.token,
      recipient: observed.recipient, transaction_hash: body.transactionHash, log_index: body.logIndex, block_number: body.blockNumber,
      block_hash: observed.blockHash, block_timestamp: observed.blockTimestamp, amount_atomic: body.amountAtomic, receipt_id: body.receiptId,
      received_at: body.receivedAt, import_contract_sha256: IMPORT_CONTRACT_SHA256, consumer_contract_sha256: consumerContractSha256(),
      authority_receipt_sha256: receiptSha, request_sha256: requestSha, import_state: 'bound', disposition: 'external_discharge_allocated',
      kernel_paid: true, kernel_transfer: body.transactionHash, native_paid_observation: true, transfer_initiated: false,
      payout_state: 'owed', observed_source: observed.source,
      created_at: (await tx.query('SELECT clock_timestamp()::text AS stamp')).rows[0].stamp};
    const fields = Object.keys(row);
    await tx.query(`INSERT INTO hosted_wallet_market.native_debt_dispositions (${fields.join(',')}) VALUES (${fields.map((_,i) => '$'+(i+1)).join(',')})`, Object.values(row));
    return dispositionView((await tx.query(`${ROW_SQL} WHERE obligation_id=$1`, [body.obligationId])).rows[0]);
  }
  async function readEnrollment(tx) {
    const row = (await tx.query(ENROLL_SQL)).rows[0];
    if (row) {
      const view = enrollmentView(row);
      try { await assertBinding(tx); view.qualified = true; view.sourceBinding = sourcePair(expected()); }
      catch { view.qualified = false; }
      return view;
    }
    return {schema: 'pilot.root71.native-debt.enrollment.v1', state: 'absent', qualified: false, boundConsumer: null};
  }
  async function readSourceSuccession(tx) {
    const row = await assertBinding(tx), chain = await successionChain(tx, row);
    return {schema:'pilot.native-debt.source-succession.v1', original:sourcePair(row), current:sourcePair(expected()),
      bindings:chain.nodes, ownerPrincipalSha256:authorityPrincipalId, invariantBinding:Object.fromEntries(
        Object.entries(expected()).filter(([name])=>!['source_sha256','host_source_sha256'].includes(name))),
      graphSha256:digest(chain.edges.map(({created_at,...edge})=>edge))};
  }
  async function readNativeDebt(tx, obligationId) {
    if (!plainId(obligationId)) fail('obligation_refused', 400);
    const row = (await tx.query(`${ROW_SQL} WHERE obligation_id=$1`, [obligationId])).rows[0];
    if (row) return dispositionView(row); // Durable consumed proof survives disabled/stale code.
    const found = await tx.query(`SELECT payout_state FROM earned_work_obligations WHERE id=$1
      UNION ALL SELECT payout_state FROM opportunity_obligations WHERE id=$1`, [obligationId]);
    if (!found.rows.length) fail('not_found', 404);
    if (found.rows.length !== 1) fail();
    const pending = pendingRegistryDisposition(registryRoot,obligationId);
    return {schema: 'pilot.root71.native-debt.disposition.v1', state: pending?'hold':'absent', obligationId, payoutState: found.rows[0].payout_state,
      payable: !pending && found.rows[0].payout_state === 'owed', newPayable: !pending && found.rows[0].payout_state === 'owed', projection: 'owed',
      importState: pending?'unbound_fail_closed':'unbound', holdReason:pending,
      kernelPaid: false, kernelTransfer: null, nativePaidObservation: false, transferInitiated: false, consumerContractSha256: consumerContractSha256()};
  }
  return Object.freeze({enroll, importNativeDischarge, readEnrollment, readNativeDebt, assertBinding, assertEnrollmentCandidate, readSourceSuccession, expectedBinding: expected, describeRemoteBinding});
}
