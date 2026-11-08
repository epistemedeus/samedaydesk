// Private consumer for Pilot's already-sealed late settlement. Reads the
// original registry and configured Neo role. This module has no write port.
import { createHash } from 'node:crypto';
import { digest } from './canonical.mjs';
import { readRegistryRecord } from './discharge-authority.mjs';

export const LATE_ACCEPTANCE_KIND = 'late_receipt_v1';
export const LATE_IMPORT_FIELDS = ['acceptanceKind', 'acceptanceOperationId', 'acceptanceReceiptSha256', 'blockHash'];
export const lateReceiptId = ({ receiptId, ...body }) => digest({ domain: 'pilot.hosted.late-discharge.receipt.v1', body });
const pilotDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const address = value => typeof value === 'string' && /^0x[a-f0-9]{40}$/.test(value) && !/^0x0{40}$/.test(value);
const positive = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
const unsigned = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const same = (left, right, keys) => keys.every(key => left[key] === right[key]);
const holdFailure = () => Object.assign(new Error('disposition_hold'), { http: 409, codeName: 'disposition_hold' });
const need = condition => { if (!condition) throw holdFailure(); };
const obligationFields = ['obligationId','reservationId','taskId','claimId','submissionId','requesterId','contributorId',
  'termsVersion','artifactDigestSha256','artifactBytes','artifactMediaType','artifactRef','roundId','network','token',
  'source','recipient','amountAtomic','otherReservedPrincipalAtomic','aggregateGasCapWei','gasAlreadyAllocatedWei',
  'authorityClass','acceptanceOperationId','acceptanceReceiptSha256','transactionHash'];

export function readLateRegistry(root, body) {
  try {
    const read = (kind, key) => readRegistryRecord(root, kind, key, true);
    const reserve = body.reservationId;
    const hold = read('reservations', reserve);
    const claim = read('reservation-settlement-claims', reserve);
    const attempt = read('reservation-attempts', reserve);
    const issuance = read('reservation-issuance', hold.issuanceId);
    const obligation = read('obligations', body.obligationId);
    const allocation = read('transfers', `${body.network}\n${body.token}\n${body.transactionHash}\n${body.logIndex}`);
    const original = issuance.receipt;
    need(hold.schema === 'pilot.reservation-authority.decision.v1' && hold.action === 'late_acceptance_hold' &&
      hold.reservationId === reserve && hold.operationId === body.acceptanceOperationId &&
      hold.source.operationId === hold.operationId && hold.source.allocationReceiptSha256 === hold.receiptSha256 &&
      hold.source.termsVersion === body.termsVersion && hold.source.amountAtomic === body.amountAtomic &&
      hex(hold.requestHash) && hex(hold.witnessSha256) && hex(hold.destinationEvidenceSha256) &&
      address(hold.destination) && typeof hold.key === 'string' && hold.witness?.schema === 'neomorphic.root-external-late-evidence.v1');
    need(claim.schema === 'pilot.reservation-authority.late-settlement-claim.v1' &&
      same(claim, hold, ['reservationId','issuanceId','receiptSha256']) && claim.holdSha256 === pilotDigest(hold) &&
      claim.operationId !== hold.operationId && hex(claim.intentSha256) && hex(claim.approvalSha256) &&
      claim.authorityClass === 'root_received' &&
      same(claim, body, ['obligationId','acceptanceReceiptSha256']));
    need(attempt.schema === 'pilot.reservation-authority.attempt.v1' && attempt.decisionSha256 === pilotDigest(claim) &&
      attempt.transactionHash === body.transactionHash && positive(attempt.remainingGasBudgetWei) &&
      unsigned(attempt.conservativeFeeEnvelopeWei) && BigInt(attempt.conservativeFeeEnvelopeWei) <= BigInt(attempt.remainingGasBudgetWei));
    need(issuance.schema === 'pilot.reservation-authority.issuance.v1' && issuance.reservationId === reserve &&
      original.schema === 'pilot.root-allocation-receipt.v1' && original.status === 'reserved' &&
      original.operationId === hold.issuanceId && pilotDigest(original) === hold.receiptSha256 &&
      original.roundId === hold.source.roundKey && original.termsVersion === body.termsVersion &&
      original.principalReserveAtomicUsdc === body.amountAtomic && original.asset === 'USDC' && original.chainId === 8453 &&
      issuance.originalDestination?.claimId === hold.source.claimId && issuance.originalDestination.address === hold.destination &&
      issuance.originalDestination.evidenceSha256 === hold.destinationEvidenceSha256);
    need(allocation.schema === 'pilot.native-obligation.transfer-allocation.v1' && allocation.kind === 'late_chain_reconciliation' &&
      allocation.authorityClass === claim.authorityClass && allocation.kernelPaid === false && allocation.kernelTransfer === null &&
      allocation.noAutomaticReplay === true && !Object.hasOwn(allocation, 'verdictId') &&
      obligation.schema === 'pilot.native-obligation.claim.v1' &&
      ['broadcast_attempted_unknown','success_exact_transfer_verified'].includes(obligation.state) &&
      obligation.noAutomaticReplay === true && (obligation.logIndex == null || obligation.logIndex === body.logIndex) &&
      same(allocation, obligation, obligationFields) &&
      same(allocation, body, ['obligationId','reservationId','taskId','termsVersion','network','token','amountAtomic',
        'transactionHash','logIndex','acceptanceOperationId','acceptanceReceiptSha256']) &&
      allocation.recipient === hold.destination && address(allocation.source) && allocation.source !== allocation.recipient &&
      allocation.claimId === hold.source.claimId && allocation.requesterId === hold.source.requesterId &&
      allocation.roundId === hold.source.roundKey && allocation.aggregateGasCapWei === original.gasCapWei &&
      positive(original.gasCapWei) && unsigned(allocation.gasAlreadyAllocatedWei) &&
      BigInt(original.gasCapWei) - BigInt(allocation.gasAlreadyAllocatedWei) === BigInt(attempt.remainingGasBudgetWei));
    return { hold, claim, attempt, original, obligation, allocation };
  } catch { throw holdFailure(); }
}

export async function readLateDebt(tx, body, registry, sessionToken, readLateAcceptedSource) {
  const { hold, original, allocation } = registry;
  const stored = (await tx.query(`SELECT c.credential_ref, c.import_key, i.principal_id, i.request_hash, i.response_json
    FROM opportunity_obligations o
    JOIN opportunity_claims c ON c.id=o.claim_id AND c.round_id=o.round_id
    JOIN opportunity_rounds r ON r.id=c.round_id
    JOIN earned_work_idempotency i ON i.scope='opportunity_accept_late_private_v1' AND i.task_id=c.id
      AND i.key=$3 AND i.status_code=201
    WHERE o.id=$1 AND c.id=$2 AND r.id=$4 AND r.status='closed'
      AND c.kind='owner_assigned' AND c.status='owed' AND o.payout_state='owed'
      AND NOT o.paid AND NOT o.settled AND o.transfer IS NULL`,
    [body.obligationId, allocation.claimId, body.acceptanceOperationId, hold.source.roundId])).rows;
  need(stored.length === 1 && typeof readLateAcceptedSource === 'function' &&
    typeof sessionToken === 'string' && /^acs_[A-Za-z0-9_-]{43}$/.test(sessionToken));
  const row = stored[0];
  need(row.credential_ref === hold.source.credentialRef && row.principal_id === hold.source.requesterId &&
    row.request_hash === hold.requestHash && typeof row.import_key === 'string' &&
    digest(row.import_key) === hold.source.assignmentKeySha256 && digest(hold.witness) === hold.witnessSha256);
  let accepted;
  try {
    accepted = await readLateAcceptedSource({sessionToken, credentialRef:row.credential_ref,
      assignmentKey:row.import_key, witness:hold.witness, key:hold.key});
  } catch { throw holdFailure(); }
  need(accepted?.schema === 'neomorphic.opportunity-late-acceptance.v1' &&
    pilotDigest(accepted) === body.acceptanceReceiptSha256 && digest(accepted) === digest(row.response_json) &&
    same(accepted, allocation, ['obligationId','claimId','submissionId','requesterId','termsVersion','amountAtomic','reservationId']) &&
    accepted.operationId === hold.operationId && accepted.roundId === hold.source.roundId && accepted.roundKey === allocation.roundId &&
    accepted.credentialRef === hold.source.credentialRef && accepted.principalId === allocation.contributorId &&
    accepted.allocationOperationId === original.operationId && accepted.allocationReceiptSha256 === hold.receiptSha256 &&
    accepted.destination === allocation.recipient && accepted.destinationEvidenceSha256 === hold.destinationEvidenceSha256 &&
    accepted.artifact?.digestSha256 === allocation.artifactDigestSha256 && accepted.artifact.ref === allocation.artifactRef &&
    accepted.artifact.bytes === allocation.artifactBytes && accepted.artifact.mediaType === allocation.artifactMediaType &&
    accepted.paid === false && accepted.settled === false && accepted.transfer === null);
  const cutoff = Date.parse(original.deadline), received = Date.parse(accepted.receivedAt);
  const reaffirmed = Date.parse(accepted.reaffirmedAt), acceptedAt = Date.parse(accepted.acceptedAt);
  need(received > cutoff && reaffirmed > cutoff && received < acceptedAt && reaffirmed < acceptedAt && acceptedAt <= Date.now());
  return { family:'opportunity', claimId:allocation.claimId, submissionId:allocation.submissionId, verdictId:null,
    artifactDigestSha256:allocation.artifactDigestSha256, acceptedAt, receiptSha:digest({body,registry}) };
}
