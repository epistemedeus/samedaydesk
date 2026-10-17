import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {digest} from './canonical.mjs';
import {readPublicChain, readRailTransfer} from './chain.mjs';

// Installed receiving projection. The archival obligation row stays owed.
// A bound row is an append-only allocation of one verified Base/USDC transfer.
// Trust: the process profile RPC (HOSTED_WALLET_MARKET_RPC), the enrollment row,
// and the stored obligation are the authority. Caller paid, installed, verified,
// baseline, store, and RPC fields are not. The receipt id is the stable external
// correlation id for one allocation. It does not authorize the transfer.
// receivedAt is the off-chain receive time. It must be at or after the block
// timestamp and not in the future. It is not a chain field.

export const IMPORT_CONTRACT_SHA256 = '414ba86df5bfacd2876f38bd62d11781e9c9971cd8219ceec577f85dc0f93063';
export const RAIL_NETWORK = 'eip155:8453';
export const RAIL_TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

// Exact Root receipt kept for tests and receiving evidence. It is not an
// acceptance whitelist. A second verified obligation uses the same code.
export const CANONICAL_DISCHARGE = Object.freeze({
  obligationId: 'oobl_izUh7nn9vd_APjsR',
  reservationId: 'root-fund-continuity-234100',
  taskId: 'continuity-234100-v1:continuity',
  network: RAIL_NETWORK,
  token: RAIL_TOKEN,
  transactionHash: '0xc90108e141b78d6581b4bc39dc810723570d492fd0fdd57622137aa2a6efc2de',
  logIndex: 102,
  blockNumber: '52729611',
  amountAtomic: '100000',
  receiptId: '83b4331a83480cce74a2d5142b66149c986f913621cc121a859e25c6bef3ac4e',
  receivedAt: '2026-10-17T14:49:36.737Z',
  recipient: '0x2dc4309f29a1ad89bea07059c4633a33f8238e5b',
  source: '0x8904df3de6dfee6a7c8cc38619d2f17806213cee',
  blockTimestamp: '2026-10-17T14:49:29.000Z',
});

export const NATIVE_DEBT_CONSUMER = Object.freeze({
  schema: 'pilot.root71.native-debt.consumer.v1',
  version: 2,
  role: 'receivingConsumer',
  bindsImportContract: 'pilot.native-obligation.import-contract.v1',
  bindsImportContractVersion: 2,
  bindsImportContractSha256: IMPORT_CONTRACT_SHA256,
  store: 'hosted_wallet_market.native_debt_dispositions',
  enrollment: 'hosted_wallet_market.consumer_enrollment',
  rail: RAIL_NETWORK,
  token: RAIL_TOKEN,
  archivalObligationPayoutState: 'owed',
  projectionWhenBound: 'native_paid',
  suppliedBooleansAreNotPaidAuthority: true,
  secondTransfer: false,
  persistedBaseline: 'hosted_wallet_market_native_debt_disposition',
});

export const IMPORT_BODY_KEYS = Object.freeze([
  'importContractSha256',
  'tenant',
  'obligationId',
  'reservationId',
  'taskId',
  'termsVersion',
  'network',
  'token',
  'transactionHash',
  'logIndex',
  'blockNumber',
  'amountAtomic',
  'receiptId',
  'receivedAt',
]);

const DISPOSITION_SCHEMA = 'pilot.root71.native-debt.disposition.v1';
const ENROLL_SCHEMA = 'pilot.root71.native-debt.enrollment.v1';
const SOURCE_FILES = Object.freeze(['native-debt.mjs', 'native-obligation-discharge.mjs']);

function refuse(status, code) {
  throw Object.assign(new Error(code), {http: status, codeName: code});
}

export function consumerContractSha256() {
  return digest(NATIVE_DEBT_CONSUMER);
}

export function installedSourceSha256() {
  const hash = createHash('sha256');
  for (const name of SOURCE_FILES) {
    const file = fileURLToPath(new URL(`./${name}`, import.meta.url));
    hash.update(name);
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function rpcOriginSha256(rpcUrl) {
  const url = new URL(rpcUrl);
  return createHash('sha256').update(url.origin).digest('hex');
}

function plainId(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 200
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('\0')
    && !value.includes('..');
}

export function assertImportShape(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) refuse(400, 'body_refused');
  if (typeof body.importContractSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(body.importContractSha256)) refuse(400, 'body_refused');
  if (typeof body.tenant !== 'string' || !/^[a-z][a-z0-9_-]{2,63}$/.test(body.tenant)) refuse(400, 'body_refused');
  if (!plainId(body.obligationId) || !plainId(body.reservationId) || !plainId(body.taskId)) refuse(400, 'body_refused');
  if (typeof body.termsVersion !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(body.termsVersion)) refuse(400, 'body_refused');
  if (typeof body.network !== 'string' || !/^eip155:[0-9]+$/.test(body.network)) refuse(400, 'body_refused');
  if (typeof body.token !== 'string' || !/^0x[0-9a-f]{40}$/.test(body.token)) refuse(400, 'body_refused');
  if (typeof body.transactionHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(body.transactionHash)) refuse(400, 'body_refused');
  if (!Number.isInteger(body.logIndex) || body.logIndex < 0) refuse(400, 'body_refused');
  if (typeof body.blockNumber !== 'string' || !/^[0-9]+$/.test(body.blockNumber)) refuse(400, 'body_refused');
  if (typeof body.amountAtomic !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(body.amountAtomic)) refuse(400, 'body_refused');
  if (typeof body.receiptId !== 'string' || !/^[0-9a-f]{64}$/.test(body.receiptId)) refuse(400, 'body_refused');
  if (typeof body.receivedAt !== 'string' || Number.isNaN(Date.parse(body.receivedAt))) refuse(400, 'body_refused');
  if (new Date(body.receivedAt).toISOString() !== body.receivedAt) refuse(400, 'body_refused');
}

function flagsBound(row) {
  return row.import_state === 'bound'
    && row.disposition === 'external_discharge_allocated'
    && row.kernel_paid === true
    && row.kernel_transfer === row.transaction_hash
    && row.native_paid_observation === true
    && row.transfer_initiated === false
    && row.payout_state === 'owed';
}

function sameBound(row, body, observed) {
  return flagsBound(row)
    && row.obligation_id === body.obligationId
    && row.tenant === body.tenant
    && row.reservation_id === body.reservationId
    && row.task_id === body.taskId
    && row.terms_version === body.termsVersion
    && row.network === body.network
    && row.token === body.token
    && row.recipient === observed.recipient
    && row.transaction_hash === body.transactionHash
    && Number(row.log_index) === body.logIndex
    && String(row.block_number) === body.blockNumber
    && row.amount_atomic === body.amountAtomic
    && row.receipt_id === body.receiptId
    && new Date(row.received_at).toISOString() === body.receivedAt
    && row.import_contract_sha256 === IMPORT_CONTRACT_SHA256
    && row.observed_source === observed.source;
}

export function dispositionView(row) {
  if (!flagsBound(row)) refuse(409, 'disposition_hold');
  return {
    schema: DISPOSITION_SCHEMA,
    state: 'bound',
    disposition: row.disposition,
    importState: row.import_state,
    projection: 'native_paid',
    payable: false,
    newPayable: false,
    kernelPaid: true,
    kernelTransfer: row.kernel_transfer,
    nativePaidObservation: true,
    transferInitiated: false,
    payoutState: row.payout_state,
    obligationId: row.obligation_id,
    tenant: row.tenant,
    reservationId: row.reservation_id,
    taskId: row.task_id,
    termsVersion: row.terms_version,
    network: row.network,
    token: row.token,
    recipient: row.recipient,
    observedSource: row.observed_source,
    transactionHash: row.transaction_hash,
    logIndex: Number(row.log_index),
    blockNumber: String(row.block_number),
    amountAtomic: row.amount_atomic,
    receiptId: row.receipt_id,
    receivedAt: new Date(row.received_at).toISOString(),
    importContractSha256: row.import_contract_sha256,
    consumerContractSha256: consumerContractSha256(),
  };
}

const ROW_SQL = `SELECT obligation_id, tenant, reservation_id, task_id, terms_version, network, token, recipient,
  transaction_hash, log_index, block_number, amount_atomic, receipt_id, received_at, import_contract_sha256,
  import_state, disposition, kernel_paid, kernel_transfer, native_paid_observation, transfer_initiated,
  payout_state, observed_source
  FROM hosted_wallet_market.native_debt_dispositions`;

const ENROLL_SQL = `SELECT source_sha256, import_contract_sha256, consumer_contract_sha256, tenant, network, token,
  rpc_origin_sha256, profile_chain, created_at
  FROM hosted_wallet_market.consumer_enrollment WHERE id IS TRUE`;

function currentOriginHash() {
  const rpcUrl = process.env.HOSTED_WALLET_MARKET_RPC;
  if (typeof rpcUrl !== 'string' || rpcUrl.length === 0) return null;
  try {
    return rpcOriginSha256(rpcUrl);
  } catch {
    return null;
  }
}

function enrollmentQualified(row) {
  return row.source_sha256 === installedSourceSha256()
    && row.import_contract_sha256 === IMPORT_CONTRACT_SHA256
    && row.consumer_contract_sha256 === consumerContractSha256()
    && row.network === RAIL_NETWORK
    && row.token === RAIL_TOKEN
    && row.rpc_origin_sha256 === currentOriginHash();
}

function enrollmentView(row) {
  return {
    schema: ENROLL_SCHEMA,
    state: 'enrolled',
    qualified: enrollmentQualified(row),
    sourceSha256: row.source_sha256,
    importContractSha256: row.import_contract_sha256,
    consumerContractSha256: row.consumer_contract_sha256,
    tenant: row.tenant,
    network: row.network,
    token: row.token,
    rpcOriginSha256: row.rpc_origin_sha256,
    profileChain: row.profile_chain,
    boundConsumer: 'hosted_wallet_market.native_debt_dispositions',
  };
}

function profileRpc() {
  const rpcUrl = process.env.HOSTED_WALLET_MARKET_RPC;
  if (typeof rpcUrl !== 'string' || rpcUrl.length === 0) refuse(409, 'discharge_consumer_unbound');
  return rpcUrl;
}

export async function enrollInstalledConsumer(tx, createdAt) {
  const rpcUrl = profileRpc();
  const observed = await readPublicChain(rpcUrl, RAIL_NETWORK);
  if (observed.chain !== RAIL_NETWORK) refuse(409, 'binding_stale');
  const installation = await tx.query(
    'SELECT tenant, chain, payments FROM hosted_wallet_market.installation WHERE id IS TRUE',
  );
  const installed = installation.rows[0];
  if (!installed || installed.payments !== 'off' || installed.chain !== RAIL_NETWORK) refuse(409, 'binding_stale');
  const next = {
    source_sha256: installedSourceSha256(),
    import_contract_sha256: IMPORT_CONTRACT_SHA256,
    consumer_contract_sha256: consumerContractSha256(),
    tenant: installed.tenant,
    network: RAIL_NETWORK,
    token: RAIL_TOKEN,
    rpc_origin_sha256: rpcOriginSha256(rpcUrl),
    profile_chain: installed.chain,
  };
  const existing = await tx.query(ENROLL_SQL);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const same = row.source_sha256 === next.source_sha256
      && row.import_contract_sha256 === next.import_contract_sha256
      && row.consumer_contract_sha256 === next.consumer_contract_sha256
      && row.tenant === next.tenant
      && row.network === next.network
      && row.token === next.token
      && row.rpc_origin_sha256 === next.rpc_origin_sha256
      && row.profile_chain === next.profile_chain;
    if (!same) refuse(409, 'enrollment_conflict');
    return enrollmentView(row);
  }
  await tx.query(
    `INSERT INTO hosted_wallet_market.consumer_enrollment (
      id, source_sha256, import_contract_sha256, consumer_contract_sha256, tenant, network, token,
      rpc_origin_sha256, profile_chain, created_at
    ) VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      next.source_sha256,
      next.import_contract_sha256,
      next.consumer_contract_sha256,
      next.tenant,
      next.network,
      next.token,
      next.rpc_origin_sha256,
      next.profile_chain,
      createdAt,
    ],
  );
  const inserted = await tx.query(ENROLL_SQL);
  return enrollmentView(inserted.rows[0]);
}

export async function readEnrollment(tx) {
  const existing = await tx.query(ENROLL_SQL);
  if (!existing.rows[0]) {
    return {schema: ENROLL_SCHEMA, state: 'absent', qualified: false, boundConsumer: null};
  }
  return enrollmentView(existing.rows[0]);
}

function assertReceivedWindow(body, blockTimestampMs) {
  const received = Date.parse(body.receivedAt);
  if (received < blockTimestampMs) refuse(409, 'disposition_hold');
  if (received > Date.now() + 5000) refuse(409, 'disposition_hold');
}

export async function receiveBoundDischarge(input) {
  const body = input?.receipt;
  const tx = input?.client;
  if (!tx || typeof tx.query !== 'function') refuse(409, 'discharge_consumer_unbound');
  assertImportShape(body);
  if (body.importContractSha256 !== IMPORT_CONTRACT_SHA256) refuse(409, 'disposition_hold');
  if (body.network !== RAIL_NETWORK || body.token !== RAIL_TOKEN) refuse(409, 'disposition_hold');
  const rpcUrl = profileRpc();
  const enrolled = await tx.query(ENROLL_SQL);
  const enrollment = enrolled.rows[0];
  if (!enrollment) refuse(409, 'discharge_consumer_unbound');
  if (!enrollmentQualified(enrollment) || enrollment.tenant !== body.tenant) {
    if (!enrollmentQualified(enrollment)) refuse(409, 'binding_stale');
    refuse(409, 'disposition_hold');
  }
  const installation = await tx.query(
    'SELECT tenant, chain, payments FROM hosted_wallet_market.installation WHERE id IS TRUE',
  );
  const installed = installation.rows[0];
  if (!installed || installed.tenant !== enrollment.tenant || installed.chain !== enrollment.profile_chain || installed.payments !== 'off') {
    refuse(409, 'binding_stale');
  }
  let observed;
  try {
    observed = await readRailTransfer(rpcUrl, body);
  } catch (error) {
    if (error?.codeName === 'transfer_unverified') refuse(409, 'disposition_hold');
    throw error;
  }
  if (observed.amountAtomic !== body.amountAtomic || observed.blockNumber !== body.blockNumber || observed.logIndex !== body.logIndex) {
    refuse(409, 'disposition_hold');
  }
  assertReceivedWindow(body, observed.blockTimestampMs);
  const taken = await tx.query(
    `SELECT obligation_id, reservation_id FROM hosted_wallet_market.native_debt_dispositions
     WHERE network = $1 AND token = $2 AND transaction_hash = $3 AND log_index = $4`,
    [body.network, body.token, body.transactionHash, body.logIndex],
  );
  if (taken.rows[0] && taken.rows[0].obligation_id !== body.obligationId) refuse(409, 'transfer_already_allocated');
  const reserved = await tx.query(
    'SELECT obligation_id FROM hosted_wallet_market.native_debt_dispositions WHERE reservation_id = $1',
    [body.reservationId],
  );
  if (reserved.rows[0] && reserved.rows[0].obligation_id !== body.obligationId) refuse(409, 'reservation_already_allocated');
  const found = await tx.query(
    `SELECT id, task_id, reservation_id, terms_version, reward_amount, reward_asset, reward_network,
            payout_state, payout_destination
     FROM earned_work_obligations WHERE id = $1`,
    [body.obligationId],
  );
  const stored = found.rows[0];
  if (!stored || stored.payout_state !== 'owed' || stored.reward_asset !== 'USDC') refuse(409, 'disposition_hold');
  if (stored.task_id !== body.taskId || stored.reservation_id !== body.reservationId || stored.terms_version !== body.termsVersion) {
    refuse(409, 'disposition_hold');
  }
  if (stored.reward_amount !== body.amountAtomic || stored.reward_network !== body.network) refuse(409, 'disposition_hold');
  if (String(stored.payout_destination || '').toLowerCase() !== observed.recipient) refuse(409, 'disposition_hold');
  const existing = await tx.query(`${ROW_SQL} WHERE obligation_id = $1`, [body.obligationId]);
  if (existing.rows[0]) {
    if (!sameBound(existing.rows[0], body, observed)) refuse(409, 'disposition_hold');
    return dispositionView(existing.rows[0]);
  }
  await tx.query(
    `INSERT INTO hosted_wallet_market.native_debt_dispositions (
      obligation_id, tenant, reservation_id, task_id, terms_version, network, token, recipient,
      transaction_hash, log_index, block_number, amount_atomic, receipt_id, received_at,
      import_contract_sha256, import_state, disposition, kernel_paid, kernel_transfer,
      native_paid_observation, transfer_initiated, payout_state, observed_source, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15,
      'bound', 'external_discharge_allocated', TRUE, $9, TRUE, FALSE, 'owed', $16, $17
    )`,
    [
      body.obligationId,
      body.tenant,
      body.reservationId,
      body.taskId,
      body.termsVersion,
      body.network,
      body.token,
      observed.recipient,
      body.transactionHash,
      body.logIndex,
      body.blockNumber,
      body.amountAtomic,
      body.receiptId,
      body.receivedAt,
      IMPORT_CONTRACT_SHA256,
      observed.source,
      input.createdAt || new Date(),
    ],
  );
  const inserted = await tx.query(`${ROW_SQL} WHERE obligation_id = $1`, [body.obligationId]);
  return dispositionView(inserted.rows[0]);
}

export async function readNativeDebt(tx, obligationId) {
  if (!plainId(obligationId)) refuse(400, 'obligation_refused');
  const obligation = await tx.query(
    'SELECT id, payout_state FROM earned_work_obligations WHERE id = $1',
    [obligationId],
  );
  if (!obligation.rows[0]) refuse(404, 'not_found');
  const row = await tx.query(`${ROW_SQL} WHERE obligation_id = $1`, [obligationId]);
  if (!row.rows[0]) {
    const owed = obligation.rows[0].payout_state === 'owed';
    return {
      schema: DISPOSITION_SCHEMA,
      state: 'absent',
      obligationId,
      payoutState: obligation.rows[0].payout_state,
      payable: owed,
      newPayable: owed,
      projection: 'owed',
      importState: 'unbound',
      kernelPaid: false,
      kernelTransfer: null,
      nativePaidObservation: false,
      transferInitiated: false,
      consumerContractSha256: consumerContractSha256(),
    };
  }
  return dispositionView(row.rows[0]);
}
