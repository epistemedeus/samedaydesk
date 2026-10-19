// Read-only entitled result on the existing review route. Both taskId and
// reservationId select this join. A reservation-only read stays the thin
// review source and is unchanged. This module does not pay, transfer, sign,
// capture, import, or insert a receipt authority.
//
// fromEarned reads stored earned rows. It does not call the installed
// accepted-work validator. fromAccepted calls readAcceptedSource. The
// configured SDS mount implements that callback as installed.adapters.review.read,
// which revalidates canonical terms, the frozen submission, and the signed
// verdict history. That callback does not read the Root registry, the
// canonical transfer, or the consumer enrollment. A native_debt_dispositions
// row is the historical projection. verified_paid is a separate current check:
// the enrollment binding canonical-receiving already uses, then stored debt,
// the Root registry receipt, and the canonical transfer.
import {digest} from './canonical.mjs';
import {readRailTransfer} from './chain.mjs';
import {matchDebt, storedDebt} from './debt-source.mjs';
import {readAuthoritativeDischarge, pendingRegistryDisposition} from './discharge-authority.mjs';
import {sha256} from './ids.mjs';

const COOKIE = '__Host-neo_contributor';
const ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const SAFE_STATUS = /^[a-z_]{1,40}$/;
const SAFE_OUTCOME = /^[a-z0-9_-]{1,40}$/;

function fail(status, code) {
  throw Object.assign(new Error(code), {http: status, codeName: code});
}

function plain(value, code) {
  if (typeof value !== 'string' || !ID.test(value) || value.includes('..')) fail(400, code);
}

function presentedCookie(req) {
  const matches = String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  return matches[0];
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  return null;
}

function artifactField(bytes, mediaType) {
  const digestSha256 = sha256(bytes);
  const utf8 = bytes.toString('utf8');
  const encoding = Buffer.from(utf8, 'utf8').equals(bytes) ? 'utf8' : 'base64';
  return {
    mediaType: typeof mediaType === 'string' && mediaType.length > 0 && mediaType.length <= 200 ? mediaType : 'application/octet-stream',
    bytes: bytes.length,
    digestSha256,
    encoding,
    body: encoding === 'utf8' ? utf8 : bytes.toString('base64'),
  };
}

async function linkSchema(client, table) {
  const current = await client.query('SELECT current_schema() AS schema');
  const schemas = [current.rows[0]?.schema, 'public'].filter(schema => typeof schema === 'string' && /^[a-z_][a-z0-9_]*$/.test(schema));
  const found = await client.query(
    `SELECT table_schema FROM information_schema.tables
     WHERE table_name = $1 AND table_schema = ANY($2::text[])`,
    [table, schemas],
  );
  const names = new Set(found.rows.map(row => row.table_schema));
  if (names.has(current.rows[0]?.schema)) return current.rows[0].schema;
  if (names.has('public')) return 'public';
  return null;
}

async function taskRequesters(client, taskId) {
  const schema = await linkSchema(client, 'journey_task_links');
  if (!schema) return [];
  const rows = await client.query(
    `SELECT requester_account_id FROM ${schema}.journey_task_links WHERE task_id = $1`,
    [taskId],
  );
  return rows.rows.map(row => row.requester_account_id).filter(Boolean);
}

async function workLink(client, reservationId) {
  const schema = await linkSchema(client, 'journey_work_links');
  if (!schema) return null;
  const rows = await client.query(
    `SELECT task_id, account_id FROM ${schema}.journey_work_links WHERE reservation_id = $1`,
    [reservationId],
  );
  return rows.rows[0] || null;
}

async function authenticate(client, req, nowMs) {
  const cookie = presentedCookie(req);
  if (!cookie) fail(401, 'unauthenticated');
  let token;
  try { token = decodeURIComponent(cookie.slice(COOKIE.length + 1)); }
  catch { fail(401, 'unauthenticated'); }
  if (!token) fail(401, 'unauthenticated');
  const pairHash = sha256(cookie);
  const valueHash = sha256(token);
  const rows = await client.query(
    `SELECT s.revoked_at, s.expires_at, s.token_hash, a.id AS account_id
     FROM journey_account_sessions s
     JOIN journey_accounts a ON a.id = s.account_id
     WHERE s.token_hash = $1 OR s.token_hash = $2`,
    [pairHash, valueHash],
  );
  if (!rows.rows.length) fail(401, 'unauthenticated');
  const accounts = new Set(rows.rows.map(row => row.account_id));
  if (accounts.size !== 1) fail(401, 'unauthenticated');
  const live = rows.rows.filter(row => !row.revoked_at && row.expires_at.getTime() > nowMs());
  if (!live.length) fail(401, 'revoked');
  if (live.length !== 1) fail(401, 'unauthenticated');
  const session = live[0];
  const delivery = await client.query(
    `SELECT d.cookie_hash
     FROM hosted_wallet_market.roles r
     JOIN hosted_wallet_market.session_delivery d ON d.account_id = r.account_id
     WHERE r.account_id = $1`,
    [session.account_id],
  );
  if (delivery.rows[0] && delivery.rows[0].cookie_hash !== session.token_hash) fail(401, 'unauthenticated');
  return {accountId: session.account_id};
}

function roleOf(accountId, parties) {
  if (parties.requesters.includes(accountId)) return 'requester';
  if (parties.contributors.includes(accountId)) return 'contributor';
  return null;
}

async function earnedParties(client, reservation) {
  const quote = await client.query(
    'SELECT requester_account_id FROM hosted_wallet_market.quotes WHERE task_id = $1',
    [reservation.task_id],
  );
  const grant = await client.query(
    'SELECT account_id FROM hosted_wallet_market.grants WHERE task_id = $1 AND token_id = $2',
    [reservation.task_id, reservation.contributor_token_id],
  );
  const linked = await workLink(client, reservation.id);
  const contributors = [];
  if (grant.rows[0]?.account_id) contributors.push(grant.rows[0].account_id);
  if (linked && linked.task_id === reservation.task_id && linked.account_id) contributors.push(linked.account_id);
  return {
    requesters: [...new Set([...(quote.rows[0] ? [quote.rows[0].requester_account_id] : []), ...await taskRequesters(client, reservation.task_id)])],
    contributors: [...new Set(contributors)],
  };
}

function sameTerms(values) {
  const present = values.filter(value => value != null);
  return present.length > 0 && present.every(value => value === present[0]);
}

function bodyFrom(row) {
  return {
    importContractSha256: row.import_contract_sha256,
    tenant: row.tenant,
    obligationId: row.obligation_id,
    reservationId: row.reservation_id,
    taskId: row.task_id,
    termsVersion: row.terms_version,
    network: row.network,
    token: row.token,
    transactionHash: row.transaction_hash,
    logIndex: Number(row.log_index),
    blockNumber: String(row.block_number),
    amountAtomic: String(row.amount_atomic),
    receiptId: row.receipt_id,
    receivedAt: new Date(row.received_at).toISOString(),
  };
}

async function verifyCurrentFulfillment(client, row, {readAcceptedSource, rpcUrl, registryRoot, artifactDigest, assertBound,signal}) {
  if (typeof assertBound !== 'function') fail(409, 'stale_evidence');
  let stored;
  let receipt;
  try {
    await assertBound(client);
    stored = await storedDebt(client, row.obligation_id, {readAcceptedSource});
    ({receipt} = readAuthoritativeDischarge(registryRoot, bodyFrom(row)));
    matchDebt(stored, receipt);
  } catch {
    fail(409, 'stale_evidence');
  }
  if (!stored || stored.amountAtomic !== String(row.amount_atomic) || stored.termsVersion !== row.terms_version || stored.artifactDigestSha256 !== artifactDigest) {
    fail(409, 'stale_evidence');
  }
  if (digest(receipt) !== row.authority_receipt_sha256) fail(409, 'stale_evidence');
  if (receipt.termsVersion !== row.terms_version || receipt.artifactDigestSha256 !== artifactDigest || receipt.source !== row.observed_source) {
    fail(409, 'stale_evidence');
  }
  if (receipt.amountAtomic !== String(row.amount_atomic) || receipt.transactionHash !== row.transaction_hash || Number(receipt.logIndex) !== Number(row.log_index)) {
    fail(409, 'stale_evidence');
  }
  let observed;
  try { observed = await readRailTransfer(rpcUrl, bodyFrom(row),{signal}); }
  catch(error) {
    if(['chain_unreachable','chain_cancelled','chain_rpc_refused'].includes(error?.codeName))fail(503,'fulfillment_unavailable');
    fail(409,'stale_evidence');
  }
  for (const key of ['source', 'recipient', 'amountAtomic', 'blockNumber', 'blockHash', 'blockTimestamp', 'logIndex']) {
    if (observed[key] !== receipt[key]) fail(409, 'stale_evidence');
  }
}

async function dispositionFor(client, {obligationId, reservationId, taskId, termsVersion, digest: artifactDigest, registryRoot, fallbackPayoutState = null, readAcceptedSource, rpcUrl, assertBound,fulfillmentReceiving}) {
  if (!obligationId) fail(409, 'incomplete_evidence');
  const owed = await client.query(
    `SELECT payout_state FROM earned_work_obligations WHERE id = $1
     UNION ALL SELECT payout_state FROM opportunity_obligations WHERE id = $1`,
    [obligationId],
  );
  if (owed.rows.length > 1) fail(409, 'incomplete_evidence');
  const row = (await client.query(
    'SELECT * FROM hosted_wallet_market.native_debt_dispositions WHERE obligation_id = $1',
    [obligationId],
  )).rows[0];
  if (!owed.rows.length && row) fail(409, 'stale_evidence');
  const payoutState = owed.rows[0]?.payout_state || fallbackPayoutState;
  if (!payoutState) fail(409, 'incomplete_evidence');
  if (!row) {
    if (payoutState !== 'owed') fail(409, 'incomplete_evidence');
    const pending = pendingRegistryDisposition(registryRoot, obligationId);
    const payable = !pending && payoutState === 'owed';
    return {
      schema: 'pilot.root71.native-debt.disposition.v1',
      projection: 'owed',
      payable,
      newPayable: payable,
      kernelPaid: false,
      nativePaidObservation: false,
      transferInitiated: false,
      payoutState,
      obligationId,
      obligationFamily: null,
      termsVersion,
      artifactDigestSha256: artifactDigest,
      reservationId,
      taskId,
      holdReason: pending || null,
    };
  }
  const joined = row.import_state === 'bound'
    && row.kernel_paid === true
    && row.kernel_transfer === row.transaction_hash
    && row.native_paid_observation === true
    && row.transfer_initiated === false
    && row.payout_state === 'owed'
    && row.claim_id === reservationId
    && row.task_id === taskId
    && row.terms_version === termsVersion
    && row.artifact_digest_sha256 === artifactDigest;
  if (!joined || payoutState !== 'owed') fail(409, 'stale_evidence');
  const received=fulfillmentReceiving?await fulfillmentReceiving.read(async(signal,phase)=>{
    phase('registry_and_chain');
    await verifyCurrentFulfillment(client,row,{readAcceptedSource,rpcUrl,registryRoot,artifactDigest,assertBound,signal});return true;
  },(reason,error)=>{if(error&&error.codeName!=='fulfillment_unavailable')throw error;return false;}):await verifyCurrentFulfillment(client,row,{readAcceptedSource,rpcUrl,registryRoot,artifactDigest,assertBound}).then(()=>true);
  if(!received)return {schema:'pilot.root71.native-debt.disposition.v1',projection:'unknown',payable:false,newPayable:false,kernelPaid:false,nativePaidObservation:false,transferInitiated:false,payoutState:'owed',obligationId,obligationFamily:row.obligation_family,termsVersion,artifactDigestSha256:artifactDigest,reservationId,taskId,holdReason:'fulfillment_unavailable'};
  return {
    schema: 'pilot.root71.native-debt.disposition.v1',
    projection: 'native_paid',
    payable: false,
    newPayable: false,
    kernelPaid: true,
    nativePaidObservation: true,
    transferInitiated: false,
    payoutState: 'owed',
    obligationId,
    obligationFamily: row.obligation_family,
    termsVersion,
    artifactDigestSha256: artifactDigest,
    reservationId,
    taskId,
    transactionHash: row.transaction_hash,
    logIndex: Number(row.log_index),
    receiptId: row.receipt_id,
    holdReason: null,
  };
}

function fulfillmentOf(disposition) {
  const paid = disposition.projection === 'native_paid'
    && disposition.kernelPaid === true
    && disposition.nativePaidObservation === true
    && disposition.transferInitiated === false
    && disposition.payoutState === 'owed'
    && disposition.payable === false
    && disposition.newPayable === false;
  return {state: disposition.projection==='unknown'?'unknown':disposition.holdReason?'pending':paid ? 'verified_paid' : 'not_observed', paid};
}

function entitledValue({role, taskId, reservationId, termsVersion, artifact, verdict, disposition, businessStatus, evidenceHash, usefulOutcome}) {
  const fulfillment = fulfillmentOf(disposition);
  const source = {taskId, reservationId, termsVersion, evidenceHash: evidenceHash || null, businessStatus};
  return {
    viewer: role,
    state: 'accepted',
    source,
    debtCreated: true,
    fulfillment,
    entitled: {
      schema: 'pilot.root239.entitled-result.v1',
      role,
      taskId,
      reservationId,
      termsVersion,
      artifact,
      verdict: {id: verdict.id, outcome: verdict.outcome},
      disposition,
      fulfillment,
      businessStatus,
      usefulOutcome,
    },
  };
}

async function fromEarned(client, reservation, {registryRoot, rpcUrl, readAcceptedSource, assertBound,fulfillmentReceiving}) {
  const submission = (await client.query(
    'SELECT * FROM earned_work_submissions WHERE reservation_id = $1',
    [reservation.id],
  )).rows[0];
  const obligations = (await client.query(
    'SELECT * FROM earned_work_obligations WHERE reservation_id = $1',
    [reservation.id],
  )).rows;
  if (!submission || obligations.length !== 1) fail(409, 'incomplete_evidence');
  const obligation = obligations[0];
  const verdict = (await client.query(
    'SELECT * FROM earned_work_verdicts WHERE id = $1 AND reservation_id = $2 AND submission_id = $3',
    [obligation.verdict_id, reservation.id, submission.id],
  )).rows[0];
  if (!verdict || verdict.outcome == null) fail(409, 'incomplete_evidence');
  const bytes = asBuffer(submission.evidence_bytes);
  if (!bytes || bytes.length === 0) fail(409, 'artifact_absent');
  const digest = sha256(bytes);
  if (digest !== submission.artifact_digest_sha256 || digest !== verdict.artifact_digest_sha256 || bytes.length !== submission.artifact_bytes) {
    fail(409, 'artifact_digest_mismatch');
  }
  if (!sameTerms([reservation.terms_version, submission.terms_version, verdict.terms_version, obligation.terms_version])) {
    fail(409, 'terms_unbound');
  }
  const delivery = (await client.query(
    'SELECT evidence_hash, business_status FROM hosted_wallet_market.delivery WHERE reservation_id = $1',
    [reservation.id],
  )).rows[0];
  const disposition = await dispositionFor(client, {
    obligationId: obligation.id,
    reservationId: reservation.id,
    taskId: reservation.task_id,
    termsVersion: reservation.terms_version,
    digest,
    registryRoot,
    fallbackPayoutState: obligation.payout_state,
    readAcceptedSource,
    rpcUrl,
    assertBound,fulfillmentReceiving,
  });
  const businessStatus = SAFE_STATUS.test(delivery?.business_status || '') ? delivery.business_status : null;
  return entitledValue({
    role: null,
    taskId: reservation.task_id,
    reservationId: reservation.id,
    termsVersion: reservation.terms_version,
    artifact: artifactField(bytes, submission.artifact_media_type),
    verdict,
    disposition,
    businessStatus,
    evidenceHash: delivery?.evidence_hash || null,
    usefulOutcome: null,
  });
}

async function fromAccepted(client, accepted, {taskId, reservationId, registryRoot, rpcUrl, readAcceptedSource, assertBound,fulfillmentReceiving}) {
  const aggregate = accepted?.aggregate;
  const submission = aggregate?.submission;
  const verdict = aggregate?.verdict;
  const obligation = aggregate?.obligation;
  const termsVersion = aggregate?.terms?.version || submission?.termsVersion;
  if (!submission || !verdict || !obligation || !termsVersion) fail(409, 'incomplete_evidence');
  if (aggregate?.task?.id && aggregate.task.id !== taskId) fail(409, 'mismatch');
  if (aggregate?.reservation?.id && aggregate.reservation.id !== reservationId) fail(409, 'mismatch');
  if (submission.reservationId && submission.reservationId !== reservationId) fail(409, 'mismatch');
  if (obligation.taskId && obligation.taskId !== taskId) fail(409, 'mismatch');
  if (obligation.reservationId && obligation.reservationId !== reservationId) fail(409, 'mismatch');
  const bytes = asBuffer(aggregate.submissionEvidenceBytes);
  if (!bytes || bytes.length === 0) fail(409, 'artifact_absent');
  const digest = sha256(bytes);
  const artifact = submission.artifact || {};
  if (artifact.digestSha256 !== digest || artifact.bytes !== bytes.length || (verdict.artifactDigestSha256 && verdict.artifactDigestSha256 !== digest)) {
    fail(409, 'artifact_digest_mismatch');
  }
  if (!sameTerms([termsVersion, submission.termsVersion, verdict.termsVersion, obligation.termsVersion])) fail(409, 'terms_unbound');
  const disposition = await dispositionFor(client, {
    obligationId: obligation.id,
    reservationId,
    taskId,
    termsVersion,
    digest,
    registryRoot,
    fallbackPayoutState: obligation.payoutState || obligation.payout_state || null,
    readAcceptedSource,
    rpcUrl,
    assertBound,fulfillmentReceiving,
  });
  const supplied = typeof aggregate.usefulOutcome === 'string' && SAFE_OUTCOME.test(aggregate.usefulOutcome) ? aggregate.usefulOutcome : null;
  return entitledValue({
    role: null,
    taskId,
    reservationId,
    termsVersion,
    artifact: artifactField(bytes, artifact.mediaType),
    verdict,
    disposition,
    businessStatus: null,
    evidenceHash: null,
    usefulOutcome: supplied,
  });
}

export async function readEntitledOutcome(client, req, {taskId, reservationId, readAcceptedSource, nowMs, registryRoot, rpcUrl, assertBound,fulfillmentReceiving}) {
  plain(taskId, 'task_refused');
  plain(reservationId, 'reservation_refused');
  const account = await authenticate(client, req, nowMs);
  const reservation = (await client.query('SELECT * FROM earned_work_reservations WHERE id = $1', [reservationId])).rows[0];
  if (reservation) {
    const parties = await earnedParties(client, reservation);
    const role = roleOf(account.accountId, parties);
    if (!role) fail(404, 'not_found');
    if (reservation.task_id !== taskId) fail(409, 'mismatch');
    const value = await fromEarned(client, reservation, {registryRoot, rpcUrl, readAcceptedSource, assertBound,fulfillmentReceiving});
    value.viewer = role;
    value.entitled.role = role;
    return value;
  }
  const linked = await workLink(client, reservationId);
  const requestedRequesters = await taskRequesters(client, taskId);
  const storedRequesters = linked ? await taskRequesters(client, linked.task_id) : [];
  if (linked && linked.task_id !== taskId) {
    const role = roleOf(account.accountId, {
      requesters: storedRequesters,
      contributors: linked.account_id ? [linked.account_id] : [],
    });
    if (!role) fail(404, 'not_found');
    fail(409, 'mismatch');
  }
  const role = roleOf(account.accountId, {
    requesters: requestedRequesters,
    contributors: linked?.account_id && linked.task_id === taskId ? [linked.account_id] : [],
  });
  if (!role) fail(404, 'not_found');
  if (typeof readAcceptedSource !== 'function') fail(404, 'not_found');
  let accepted;
  try { accepted = await readAcceptedSource({taskId, reservationId}); }
  catch (error) {
    if (error?.codeName) throw error;
    fail(409, 'stale_evidence');
  }
  if (!accepted) fail(404, 'not_found');
  const value = await fromAccepted(client, accepted, {taskId, reservationId, registryRoot, rpcUrl, readAcceptedSource, assertBound,fulfillmentReceiving});
  value.viewer = role;
  value.entitled.role = role;
  return value;
}
