import {isNativeCoinIntent,isNativeRewardAsset,BASE_NATIVE_ETH} from './reward-asset.mjs';
// Exclusive native-obligation registry and the unbound debt-disposition contract.
// Filesystem keys are hashes. Domain identifiers are never used as path segments.
// This module does not set kernel paid or transfer, and it does not import P2.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync, readFileSync, writeFileSync, linkSync, unlinkSync, renameSync,
  chmodSync, statSync, lstatSync, realpathSync, mkdirSync, openSync, closeSync, fsyncSync,
} from 'node:fs';
import { dirname, join, basename, resolve, sep, isAbsolute } from 'node:path';
import { NONPRODUCTION_TEST_SEAM, normalizeAddress } from './retained-award-validate.mjs';

export const CLAIM_SCHEMA = 'pilot.native-obligation.claim.v1';
export const RESERVATION_CLAIM_SCHEMA = 'pilot.native-obligation.reservation-claim.v1';
export const TRANSFER_SCHEMA = 'pilot.native-obligation.transfer-allocation.v1';
export const DISCHARGE_SCHEMA = 'pilot.native-obligation.discharge.v1';
export const BINDING_SCHEMA = 'pilot.native-obligation.consumer-binding.v1';
export const IMPORT_RESULT_SCHEMA = 'pilot.native-obligation.import-result.v1';
export const CONTROLLER_REGISTRY_RELATIVE = 'id/controller/native-obligation-registry';

export const IMPORT_CONTRACT = Object.freeze({
  schema: 'pilot.native-obligation.import-contract.v1',
  version: 2,
  nextConsumer: null,
  currentImporter: null,
  trustedConsumer: null,
  failClosedUntilBound: true,
  acceptsSuppliedInstallation: false,
  acceptsSuppliedBaseline: false,
  persistedBaseline: 'controller_registry_transfer_record',
  separates: Object.freeze(['chain_payment', 'debt_disposition', 'native_paid_observation']),
  forbiddenEffects: Object.freeze([
    'kernel_paid',
    'kernel_transfer',
    'native_paid_observation',
    'legacy_slot',
    'email_observation_as_settlement',
    'second_payment',
    'second_transfer_allocation',
  ]),
  exclusiveKey: Object.freeze(['network', 'token', 'transactionHash', 'logIndex']),
  reservationExclusive: true,
  p2DebtBaseline: 'not_installed',
});

const EFFECT_KEYS = [
  'kernelPaid',
  'kernelTransfer',
  'nativePaidObservation',
  'legacySlot',
  'emailObservationAsSettlement',
  'paymentAllocation',
  'transferAllocation',
  'recordExclusiveExternalDischarge',
];

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const KINDS = new Set(['obligations', 'reservations', 'transfers', 'discharges']);

export const NATIVE_COIN_IMPORT_CONTRACT=Object.freeze({schema:'pilot.native-obligation.import-contract.v2',version:1,proofKind:'native_value_transfer',exclusiveKey:['network','proofKind','transactionHash'],denomination:'wei',legacyContractUnchanged:true});
export function importContractSha256(coin=false) {
  if(coin)return createHash('sha256').update(JSON.stringify(NATIVE_COIN_IMPORT_CONTRACT)).digest('hex');
  return createHash('sha256').update(JSON.stringify(IMPORT_CONTRACT)).digest('hex');
}

export function currentImportContract() {
  return {
    contract: IMPORT_CONTRACT,
    contractSha256: importContractSha256(),
    boundConsumer: null,
    trustedConsumer: null,
    failClosed: true,
    p2InstalledByThisPackage: false,
    persistedBaseline: IMPORT_CONTRACT.persistedBaseline,
  };
}

function opaqueId(value) {
  assert(typeof value === 'string' && OPAQUE_ID.test(value), 'obligation_id_invalid');
  assert(!value.includes('..') && !value.includes('/') && !value.includes('\\'), 'obligation_id_invalid');
  return value;
}

function assertRealPrivateDirectory(dir) {
  assert(typeof dir === 'string' && dir.length > 0, 'claim_root_required');
  let listed;
  try {
    listed = lstatSync(dir);
  } catch {
    throw new Error('controller_registry_required');
  }
  assert(!listed.isSymbolicLink(), 'claim_root_alias_refused');
  assert(listed.isDirectory(), 'claim_root_required');
  assert.equal(listed.mode & 0o077, 0, 'private file permissions required');
  const real = realpathSync(dir);
  assert(real === resolve(dir), 'claim_root_alias_refused');
  return real;
}

function locate(repoRoot, file) {
  if (typeof file !== 'string' || file.length === 0 || file.includes('\0')) {
    throw new Error('claim_root_not_authoritative');
  }
  return isAbsolute(file) || repoRoot == null ? resolve(file) : resolve(repoRoot, file);
}

// One controller registry. Intent claim roots are compared and never selected.
export function resolveControllerRegistry({
  repoRoot = null, testSeam = null, controllerRegistry = null, suppliedClaimRoot = null,
} = {}) {
  const production = testSeam !== NONPRODUCTION_TEST_SEAM;
  const selected = production
    ? resolve(repoRoot, CONTROLLER_REGISTRY_RELATIVE)
    : controllerRegistry;
  if (production && !existsSync(selected)) {
    if (suppliedClaimRoot != null && suppliedClaimRoot !== '') throw new Error('claim_root_not_authoritative');
    throw new Error('controller_registry_required');
  }
  assert(typeof selected === 'string' && selected.length > 0, 'controller_registry_required');
  const root = assertRealPrivateDirectory(selected);
  if (suppliedClaimRoot != null && suppliedClaimRoot !== '') {
    const supplied = locate(repoRoot, suppliedClaimRoot);
    let listed;
    try {
      listed = lstatSync(supplied);
    } catch {
      throw new Error('claim_root_not_authoritative');
    }
    if (listed.isSymbolicLink()) throw new Error('claim_root_alias_refused');
    if (!listed.isDirectory()) throw new Error('claim_root_not_authoritative');
    let real;
    try {
      real = realpathSync(supplied);
    } catch {
      throw new Error('claim_root_not_authoritative');
    }
    if (real !== root) throw new Error('claim_root_not_authoritative');
  }
  return root;
}

function registryFile(registryRoot, kind, material) {
  assert(KINDS.has(kind), 'registry_kind_invalid');
  assert(typeof material === 'string' && material.length > 0, 'registry_key_required');
  const root = assertRealPrivateDirectory(registryRoot);
  const digest = createHash('sha256').update(`${kind}\n${material}`).digest('hex');
  const dir = join(root, kind);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const file = join(dir, `${digest}.json`);
  assert(file.startsWith(root + sep), 'registry_path_invalid');
  assert(basename(file) === `${digest}.json`, 'registry_path_invalid');
  return file;
}

export function obligationClaimPath(registryRoot, obligationId) {
  return registryFile(registryRoot, 'obligations', opaqueId(obligationId));
}

export function obligationDischargePath(registryRoot, obligationId) {
  return registryFile(registryRoot, 'discharges', opaqueId(obligationId));
}

export function reservationClaimPath(registryRoot, reservationId) {
  assert(typeof reservationId === 'string' && OPAQUE_ID.test(reservationId), 'reservation_id_required');
  return registryFile(registryRoot, 'reservations', reservationId);
}

export function transferAllocationPath(registryRoot, allocation) {
  const network = allocation?.network;
  const coin=allocation?.proofKind==='native_value_transfer';
  if(coin)assert(isNativeRewardAsset(allocation.rewardAsset)&&allocation.token===null&&allocation.logIndex===null,'unsupported_reward_asset');
  const token = coin?null:normalizeAddress(allocation?.token);
  const transactionHash = String(allocation?.transactionHash ?? '').toLowerCase();
  const logIndex = allocation?.logIndex;
  assert(network === 'eip155:8453', 'network_mismatch');
  assert(/^0x[0-9a-f]{64}$/.test(transactionHash), 'known hash required');
  if(coin)return registryFile(registryRoot,'transfers',`${network}\nnative_value_transfer\n${transactionHash}`);
  assert(Number.isInteger(logIndex) && logIndex >= 0, 'transfer_log_index_required');
  return registryFile(registryRoot, 'transfers', `${network}\n${token}\n${transactionHash}\n${logIndex}`);
}

function syncPath(file){const fd=openSync(file,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function publishExclusive(file, record) {
  const dir = dirname(file);
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  syncPath(tmp);
  try {
    linkSync(tmp, file);
  } catch (error) {
    unlinkSync(tmp);
    if (error?.code === 'EEXIST') throw new Error('obligation_already_claimed');
    throw error;
  }
  unlinkSync(tmp);
  chmodSync(file, 0o600);
  syncPath(dir);
  return record;
}

function readPrivateJson(file) {
  if (!existsSync(file)) return null;
  assert.equal(statSync(file).mode & 0o077, 0, 'private file permissions required');
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('import_baseline_malformed');
  }
  assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'import_baseline_malformed');
  return parsed;
}

export function claimObligationExclusive(claimPath, record) {
  assert(record?.schema === CLAIM_SCHEMA, 'claim_schema_required');
  const signing=record.proofKind==='native_value_transfer'&&record.state==='signing_attempted_unknown'&&record.transactionHash===null;
  assert(signing||record.state === 'broadcast_attempted_unknown', 'claim_must_journal_unknown_before_broadcast');
  assert(signing||typeof record.transactionHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(record.transactionHash), 'known hash required');
  assert(record.noAutomaticReplay === true, 'replay_forbidden');
  return publishExclusive(claimPath, record);
}

export function claimReservationExclusive(claimPath, record) {
  assert(record?.schema === RESERVATION_CLAIM_SCHEMA, 'reservation_claim_schema_required');
  const signing=record.proofKind==='native_value_transfer'&&record.state==='signing_attempted_unknown'&&record.transactionHash===null;
  assert(signing||record.state === 'broadcast_attempted_unknown', 'claim_must_journal_unknown_before_broadcast');
  assert(signing||typeof record.transactionHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(record.transactionHash), 'known hash required');
  assert(record.noAutomaticReplay === true, 'replay_forbidden');
  assert(typeof record.obligationId === 'string' && typeof record.reservationId === 'string', 'reservation_id_required');
  return publishExclusive(claimPath, record);
}

export function updateObligationClaim(claimPath, record) {
  const dir = dirname(claimPath);
  const tmp = join(dir, `.${basename(claimPath)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  syncPath(tmp);
  renameSync(tmp, claimPath);
  chmodSync(claimPath, 0o600);
  syncPath(dir);
  return record;
}

export function readObligationClaim(registryRoot, obligationId) {
  const claimPath = obligationClaimPath(registryRoot, obligationId);
  const claim = readPrivateJson(claimPath);
  return { claimPath, claim };
}

export function readReservationClaim(registryRoot, reservationId) {
  const claimPath = reservationClaimPath(registryRoot, reservationId);
  const claim = readPrivateJson(claimPath);
  return { claimPath, claim };
}

function sameAllocation(existing, record) {
  if (!existing || existing.schema !== TRANSFER_SCHEMA) return false;
  if (existing.kernelPaid !== false || existing.kernelTransfer !== null) return false;
  if (existing.obligationId !== record.obligationId || existing.reservationId !== record.reservationId) return false;
  if (existing.transactionHash?.toLowerCase() !== record.transactionHash.toLowerCase()) return false;
  if (Number(existing.logIndex) !== Number(record.logIndex)) return false;
  if(record.proofKind==='native_value_transfer'){if(existing.proofKind!==record.proofKind||!isNativeRewardAsset(existing.rewardAsset)||!isNativeRewardAsset(record.rewardAsset)||existing.token!==null||existing.logIndex!==null)return false;}
  else if (normalizeAddress(existing.token) !== normalizeAddress(record.token)) return false;
  if (existing.network !== record.network || existing.amountAtomic !== record.amountAtomic) return false;
  if (normalizeAddress(existing.source) !== normalizeAddress(record.source)) return false;
  if (normalizeAddress(existing.recipient) !== normalizeAddress(record.recipient)) return false;
  if (existing.receiptId != null && record.receiptId != null && existing.receiptId !== record.receiptId) return false;
  return true;
}

export function claimTransferExclusive(registryRoot, record) {
  assert(record?.schema === TRANSFER_SCHEMA, 'transfer_schema_required');
  assert(record.kernelPaid === false && record.kernelTransfer === null, 'kernel_paid_forbidden');
  assert(record.noAutomaticReplay === true, 'replay_forbidden');
  const file = transferAllocationPath(registryRoot, record);
  try {
    publishExclusive(file, record);
    return { created: true, file, value: record };
  } catch (error) {
    if (error.message !== 'obligation_already_claimed') throw error;
    const existing = readPrivateJson(file);
    assert(sameAllocation(existing, record), 'transfer_already_allocated');
    if (record.receiptId && existing.receiptId !== record.receiptId) {
      const updated = {
        ...existing,
        receiptId: record.receiptId,
        importContractSha256: record.importContractSha256 ?? existing.importContractSha256,
      };
      updateObligationClaim(file, updated);
      return { created: false, file, value: updated };
    }
    return { created: false, file, value: existing };
  }
}

export function readTransferAllocation(registryRoot, allocation) {
  const file = transferAllocationPath(registryRoot, allocation);
  return { file, record: readPrivateJson(file) };
}

export function dischargeReceiptId(receipt) {
  const body = {
    schema: receipt.schema,
    ...(receipt.proofKind==='native_value_transfer'?{proofKind:receipt.proofKind,rewardAsset:BASE_NATIVE_ETH}:{}),
    obligationId: receipt.obligationId,
    reservationId: receipt.reservationId,
    transactionHash: receipt.transactionHash,
    logIndex: receipt.logIndex,
    amountAtomic: receipt.amountAtomic,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    source: receipt.source,
    recipient: receipt.recipient,
    token: receipt.token,
    network: receipt.network,
  };
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function buildDischargeReceipt({ intent, canonical, authorityClass }) {
  assert(authorityClass === 'root_received' || authorityClass === 'synthetic_fixture', 'authority_class_required');
  assert(canonical?.status === 'success', 'discharge_requires_canonical_success');
  assert(canonical.exactTransferVerified === true, 'discharge_requires_exact_transfer');
  const coin=isNativeCoinIntent(intent);
  if(coin)assert(canonical.logIndex===null&&canonical.proofKind==='native_value_transfer','native_proof_required');
  else assert(Number.isInteger(canonical.logIndex) && canonical.logIndex >= 0, 'transfer_log_index_required');
  const receipt = {
    schema: coin?"pilot.native-obligation.discharge.v2":DISCHARGE_SCHEMA,
    disposition: 'external_chain_discharge',
    chainPayment: 'separate_canonical_receipt',
    debtDisposition: 'exclusive_external_discharge',
    nativePaidObservation: false,
    kernelPaid: false,
    kernelTransfer: null,
    legacySlotCreated: false,
    emailObservationRelabeled: false,
    liveAuthorityValidated: false,
    liveAcceptanceClaimed: false,
    provesLiveAcceptance: false,
    suppliedAuthorityClass: authorityClass,
    consumerBinding: null,
    importState: 'unbound_fail_closed',
    importContract: coin?NATIVE_COIN_IMPORT_CONTRACT.schema:IMPORT_CONTRACT.schema,
    importContractSha256: importContractSha256(coin),
    obligationId: intent.obligationId,
    reservationId: intent.reservationId,
    taskId: intent.taskId,
    claimId: intent.claimId,
    submissionId: intent.submissionId,
    verdictId: intent.verdictId,
    termsVersion: intent.termsVersion,
    artifactDigestSha256: intent.artifactDigestSha256,
    roundId: intent.roundId,
    network: intent.network,
    ...(coin?{token:null,proofKind:"native_value_transfer",rewardAsset:intent.rewardAsset}:{token:normalizeAddress(intent.token)}),
    amountAtomic: intent.amountAtomic,
    transactionHash: canonical.transactionHash,
    logIndex: canonical.logIndex,
    blockHash: canonical.blockHash,
    blockNumber: canonical.blockNumber,
    blockTimestamp: canonical.blockTimestamp,
    knownFeeWei: canonical.knownFeeWei,
    ...(coin?{l2FeeWei:canonical.l2FeeWei,l1FeeWei:canonical.l1FeeWei,operatorFeeWei:canonical.operatorFeeWei,feeCompleteness:canonical.feeCompleteness}:{}),
    source: normalizeAddress(intent.source),
    recipient: normalizeAddress(intent.recipient),
    exclusiveAllocation: true,
    refusesAdditionalPayment: true,
    refusesAdditionalTransferAllocation: true,
    customerRevenue: false,
  };
  receipt.receiptId = dischargeReceiptId(receipt);
  return receipt;
}

export function writeExclusiveJson(file, value) {
  try {
    publishExclusive(file, value);
    return { created: true, value };
  } catch (error) {
    if (error.message !== 'obligation_already_claimed') throw error;
    assert.equal(statSync(file).mode & 0o077, 0, 'private file permissions required');
    const existing = JSON.parse(readFileSync(file, 'utf8'));
    assert(existing.receiptId === value.receiptId, 'discharge_already_allocated');
    assert(existing.transactionHash === value.transactionHash, 'discharge_already_allocated');
    assert(Number(existing.logIndex) === Number(value.logIndex), 'discharge_already_allocated');
    assert(existing.obligationId === value.obligationId, 'discharge_already_allocated');
    assert(existing.reservationId === value.reservationId, 'discharge_already_allocated');
    assert(existing.kernelPaid === false && existing.kernelTransfer === null, 'kernel_paid_forbidden');
    return { created: false, value: existing };
  }
}

function assertClosedReceipt(receipt) {
  assert(receipt && typeof receipt === 'object', 'discharge_schema_required');
  assert(receipt.schema === DISCHARGE_SCHEMA, 'discharge_schema_required');
  assert(receipt.kernelPaid === false, 'kernel_paid_forbidden');
  assert(receipt.kernelTransfer === null, 'kernel_transfer_forbidden');
  assert(receipt.nativePaidObservation === false, 'native_paid_observation_forbidden');
  assert(receipt.legacySlotCreated === false, 'legacy_slot_refused');
  assert(receipt.emailObservationRelabeled === false, 'email_observation_not_settlement');
  assert(receipt.liveAuthorityValidated === false, 'live_authority_claim_refused');
  assert(receipt.liveAcceptanceClaimed === false && receipt.provesLiveAcceptance === false, 'live_authority_claim_refused');
  assert(receipt.consumerBinding == null, 'receipt_must_fail_closed_until_import');
  assert(receipt.importState === 'unbound_fail_closed', 'receipt_must_fail_closed_until_import');
  assert(receipt.receiptId === dischargeReceiptId(receipt), 'discharge_receipt_id_mismatch');
}

function nonproductionImport({ receipt, binding = null, baseline = null, registryRoot = null }) {
  assertClosedReceipt(receipt);
  if (binding?.installed === true || binding?.assumedAlreadyHonored === true || binding?.p2AlreadyHonors === true) {
    throw new Error('self_asserted_installation_refused');
  }
  if (baseline != null) throw new Error('supplied_baseline_refused');
  if (registryRoot == null) throw new Error('import_baseline_required');
  let record;
  try {
    record = readTransferAllocation(registryRoot, receipt).record;
  } catch (error) {
    if (error.message === 'import_baseline_malformed') throw error;
    throw new Error('import_baseline_required');
  }
  if (record == null) throw new Error('import_baseline_required');
  if (record.schema !== TRANSFER_SCHEMA) throw new Error('import_baseline_malformed');
  if (record.kind === 'payment' || record.kind === 'transfer') {
    throw new Error('discharge_refuses_payment_or_transfer_allocation');
  }
  if (record.importContractSha256 !== importContractSha256()) throw new Error('import_baseline_stale');
  assert(record.transactionHash?.toLowerCase() === receipt.transactionHash.toLowerCase(), 'transfer_already_allocated');
  assert(Number(record.logIndex) === Number(receipt.logIndex), 'transfer_already_allocated');
  assert(record.obligationId === receipt.obligationId, 'discharge_already_allocated');
  assert(record.reservationId === receipt.reservationId, 'discharge_already_allocated');
  assert(record.receiptId === receipt.receiptId, 'discharge_already_allocated');
  assert(record.kernelPaid === false && record.kernelTransfer === null, 'kernel_paid_forbidden');
  return {
    schema: IMPORT_RESULT_SCHEMA,
    mode: 'nonproduction_validation',
    dispositionRecorded: false,
    persisted: false,
    chainAllocationPersisted: true,
    liveDebtDisposition: false,
    installation: 'not_installed',
    boundConsumer: null,
    idempotent: true,
    kernelPaid: false,
    kernelTransfer: null,
    nativePaidObservation: false,
    paymentAllocated: false,
    transferAllocated: false,
    legacySlotCreated: false,
    emailObservationRelabeled: false,
    p2InstalledByThisPackage: false,
    liveAuthorityValidated: false,
    allocation: {
      kind: 'external_discharge_only',
      receiptId: receipt.receiptId,
      obligationId: receipt.obligationId,
      reservationId: receipt.reservationId,
      transactionHash: receipt.transactionHash,
      logIndex: receipt.logIndex,
    },
  };
}

// Production import stays closed while IMPORT_CONTRACT has no trusted consumer.
// Supplied installed/baseline values are not consulted on that path.
// The test seam validates registry semantics and does not record a debt disposition.
export function importNativeDischarge(input = {}) {
  if (input?.testSeam !== NONPRODUCTION_TEST_SEAM) throw new Error('discharge_consumer_unbound');
  return nonproductionImport(input);
}
