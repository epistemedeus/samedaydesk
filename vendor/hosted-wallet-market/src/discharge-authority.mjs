// Read-only consumption of the sender's existing exclusive registry. Never
// creates directories, claims, allocations, receipts, or payment authority.
import {digest} from './canonical.mjs';
import {createHash} from 'node:crypto';
import {constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DISCHARGE_SCHEMA, TRANSFER_SCHEMA, dischargeReceiptId, importContractSha256} from './native-obligation-discharge.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw Object.assign(new Error('disposition_hold'), {http: 409, codeName: 'disposition_hold'}); };
// A configured path digest is a comparison value, never registry authority.
// Only registryIdentity/read below validate the installed filesystem.
export function configuredRegistryIdentity(root) {
  if(typeof root!=='string'||!root.startsWith('/')||root.includes('\0'))fail();
  return sha(resolve(root));
}
export function registryIdentity(root) {
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || realpathSync(root) !== resolve(root)) fail();
    return configuredRegistryIdentity(resolve(root));
  } catch { fail(); }
}
function read(root, kind, key) {
  registryIdentity(root);
  const dir = join(root, kind);
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) fail();
  const file = join(dir, `${sha(`${kind}\n${key}`)}.json`);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) || stat.size > 131072) fail();
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}
export function readAuthoritativeDischarge(root, body) {
  try {
    const receipt = read(root, 'discharges', body.obligationId);
    const coin=body.proofKind==='native_value_transfer';
    const key = coin?`${body.network}\nnative_value_transfer\n${body.transactionHash}`:`${body.network}\n${body.token}\n${body.transactionHash}\n${body.logIndex}`;
    const allocation = read(root, 'transfers', key);
    if (receipt.schema !== (coin?'pilot.native-obligation.discharge.v2':DISCHARGE_SCHEMA) || receipt.receiptId !== dischargeReceiptId(receipt) ||
        receipt.importContractSha256 !== importContractSha256(coin) || receipt.importState !== 'unbound_fail_closed' ||
        receipt.consumerBinding !== null || receipt.kernelPaid !== false || receipt.kernelTransfer !== null || receipt.nativePaidObservation !== false ||
        receipt.suppliedAuthorityClass !== 'root_received' || receipt.exclusiveAllocation !== true || receipt.refusesAdditionalPayment !== true || receipt.refusesAdditionalTransferAllocation !== true ||
        receipt.legacySlotCreated !== false || receipt.emailObservationRelabeled !== false ||
        allocation.schema !== TRANSFER_SCHEMA || allocation.kind !== 'external_discharge_only' || allocation.authorityClass !== 'root_received' ||
        allocation.importContractSha256 !== importContractSha256(coin) || allocation.kernelPaid !== false || allocation.kernelTransfer !== null || allocation.noAutomaticReplay !== true) fail();
    if(coin&&(receipt.proofKind!==body.proofKind||allocation.proofKind!==body.proofKind||digest(receipt.rewardAsset)!==digest(body.rewardAsset)||digest(allocation.rewardAsset)!==digest(body.rewardAsset)))fail();
    for (const key of ['obligationId', 'reservationId', 'taskId', 'termsVersion', 'network', 'token', 'amountAtomic', 'transactionHash', 'logIndex', 'receiptId']) {
      if (receipt[key] !== body[key] || allocation[key] !== receipt[key]) fail();
    }
    for (const key of ['claimId', 'submissionId', 'verdictId', 'termsVersion', 'artifactDigestSha256', 'roundId', 'source', 'recipient']) {
      if (typeof receipt[key] !== 'string' || !receipt[key] || allocation[key] !== receipt[key]) fail();
    }
    if (receipt.blockNumber !== body.blockNumber || !/^0x[0-9a-f]{64}$/.test(receipt.blockHash) ||
        !/^0x[0-9a-f]{40}$/.test(receipt.source) || !/^0x[0-9a-f]{40}$/.test(receipt.recipient) ||
        receipt.source === receipt.recipient || !Number.isFinite(Date.parse(receipt.blockTimestamp))) fail();
    return {receipt, allocation, registrySha256: registryIdentity(root)};
  } catch { fail(); }
}

// A journaled/allocated payment cannot become a new payable merely because its
// local projection is missing. Malformed or unavailable authority is a hold.
export function pendingRegistryDisposition(root, obligationId) {
  if (!root) return 'authority_unavailable';
  try {
    registryIdentity(root);
    for (const kind of ['discharges','obligations']) {
      try { read(root,kind,obligationId); return kind==='discharges'?'external_discharge_pending':'payment_outcome_pending'; }
      catch(error) { if(error.code!=='ENOENT') return 'authority_unavailable'; }
    }
    return null;
  } catch { return 'authority_unavailable'; }
}
