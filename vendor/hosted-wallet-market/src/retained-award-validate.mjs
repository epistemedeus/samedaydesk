// Pure checks for one retained award. No signer, broadcast, or chain client.
import assert from 'node:assert/strict';

export const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

export function integer(value) {
  if (typeof value === 'bigint') return value;
  assert(typeof value === 'string' && /^\d+$/.test(value));
  return BigInt(value);
}

// JSON-RPC quantities are 0x-hex strings. Fee and block values may exceed the safe integer ceiling.
export function parseReceiptQuantity(value, code = 'receipt_quantity_invalid') {
  if (typeof value === 'bigint') {
    assert(value >= 0n, code);
    return value;
  }
  if (typeof value === 'number') {
    assert(Number.isSafeInteger(value) && value >= 0, code);
    return BigInt(value);
  }
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/i.test(value)) return BigInt(value);
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) return BigInt(value);
  assert(false, code);
}

// Log identity is a safe integer. Hex, decimal, number, and bigint forms of one index are the same index.
export function normalizeLogIndex(value) {
  const quantity = parseReceiptQuantity(value, 'transfer_log_index_required');
  assert(quantity <= BigInt(Number.MAX_SAFE_INTEGER), 'transfer_log_index_required');
  return Number(quantity);
}

export function receiptSucceeded(status) {
  if (status === 'success') return true;
  return typeof status === 'string' && /^0x[0-9a-fA-F]+$/i.test(status) && BigInt(status) === 1n;
}

export function decimalUsdc(value) {
  assert(typeof value === 'string' && /^\d+\.\d{1,6}$/.test(value));
  const [whole, part] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(part.padEnd(6, '0'));
}

export function normalizeAddress(value) {
  assert(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value), 'invalid_address');
  return value.toLowerCase();
}

export function otherReservedAtomic(ledger, amountAtomic) {
  const amount = integer(amountAtomic);
  const remainingPrincipal = integer(ledger.principalReserveAtomicUsdc)
    - integer(ledger.principalPaidAtomicUsdc);
  assert(remainingPrincipal >= amount, 'other_reserve_exceeds_principal');
  return remainingPrincipal - amount + decimalUsdc(ledger.separateKnownOldCommitmentsUsdc);
}

export function assertPreflightBalances({
  balanceAtomic,
  amountAtomic,
  otherReservedAtomic: reserved,
  ethWei,
  conservativeFeeWei,
  remainingGasWei,
}) {
  const balance = integer(balanceAtomic);
  const amount = integer(amountAtomic);
  const other = integer(reserved);
  const eth = integer(ethWei);
  const fee = integer(conservativeFeeWei);
  const gas = integer(remainingGasWei);
  assert(balance >= amount + other, 'preserve other commitments');
  assert(fee <= gas && eth >= fee, 'fee envelope exceeds balance or allocated cap');
}

export function transferMatches(transfers, intent) {
  const amount = integer(intent.amountAtomic);
  const token = normalizeAddress(intent.token);
  const source = normalizeAddress(intent.source);
  const recipient = normalizeAddress(intent.recipient);
  return (transfers ?? []).some((item) => normalizeAddress(item.token) === token
    && normalizeAddress(item.from) === source
    && normalizeAddress(item.to) === recipient
    && integer(item.value) === amount);
}

export function assessReceipt(receipt, intent) {
  assert(receiptSucceeded(receipt?.status), 'no canonical successful receipt; reconcile hash, never resend');
  assert(transferMatches(receipt.transfers, intent), 'canonical receipt does not prove exact award');
  assert(integer(receipt.knownFeeWei) <= integer(receipt.remainingGasBudgetWei));
  assert(integer(receipt.sourceUsdcAtomic) >= integer(intent.otherReservedPrincipalAtomic));
}

function modeOf(mode) {
  const value = typeof mode === 'string' && mode.startsWith('--') ? mode.slice(2) : mode;
  assert(value === 'preflight' || value === 'execute' || value === 'receive', 'explicit intent and mode required');
  return value;
}

function nonempty(value, name) {
  assert(typeof value === 'string' && value.trim().length > 0, `${name}_required`);
  return value;
}

function destinationMessage(report) {
  if (!Object.hasOwn(report, 'receivingAddressEvidence')) return report.messageId;
  const evidence = report.receivingAddressEvidence;
  assert(evidence && typeof evidence === 'object' && !Array.isArray(evidence), 'destination_evidence_required');
  assert.equal(evidence.verified, true, 'destination_evidence_unverified');
  assert.equal(evidence.threadId, report.threadId, 'destination_thread_mismatch');
  assert.equal(nonempty(evidence.sender, 'destination_sender').toLowerCase(),
    nonempty(report.sender, 'report_sender').toLowerCase(), 'destination_sender_mismatch');
  assert.equal(evidence.network, report.network, 'destination_network_mismatch');
  assert.equal(normalizeAddress(evidence.address), normalizeAddress(report.receivingAddress), 'destination_address_mismatch');
  return nonempty(evidence.messageId, 'destination_message');
}

// Project an existing role, never create a contact or another reservation.
export function originalObligation(contacts, obligationId) {
  nonempty(obligationId, 'obligation_id');
  assert(Array.isArray(contacts), 'original_contacts_required');
  const matches = contacts.flatMap((contact) => {
    assert(contact && typeof contact === 'object' && !Array.isArray(contact), 'invalid_contact');
    const roles = [];
    if (contact.slotId === obligationId) roles.push({ contact, role: 'discovery' });
    if (contact.workflowSlot === obligationId) roles.push({ contact, role: 'workflow' });
    return roles;
  });
  assert.equal(matches.length, 1, 'one original reservation required');
  const { contact, role } = matches[0];
  if (role === 'discovery') return { role, contact: { ...contact } };
  return {
    role,
    contact: {
      slotId: contact.workflowSlot,
      rewardAtomicUsdc: contact.workflowRewardAtomicUsdc,
      status: contact.workflowStatus,
      acceptedReportId: contact.workflowAcceptedReportId,
      acceptedReportPath: contact.workflowAcceptedReportPath,
      paidPrincipalAtomicUsdc: contact.workflowPaidPrincipalAtomicUsdc,
      // The original contact can bind both roles to one recipient/thread.
      // Explicit workflow bindings, when supplied, must win even if invalid.
      to: Object.hasOwn(contact, 'workflowTo') ? contact.workflowTo : contact.to,
      threadId: Object.hasOwn(contact, 'workflowThreadId') ? contact.workflowThreadId : contact.threadId,
      sentVerified: contact.workflowSentVerified,
      sentMessageId: contact.workflowSentMessageId,
      sentAt: contact.workflowSentAt,
    },
  };
}

function assertIdentity(intent, ledger, report) {
  assert.equal(intent.schema, 'pilot.retained-award.intent.v1');
  assert.equal(intent.network, 'eip155:8453');
  assert.equal(intent.customerRevenue, false);
  assert.equal(intent.noAutomaticReplay, true);
  for (const key of ['roundId', 'obligationId', 'reportId', 'acceptedReport', 'recipientBindingThreadId', 'recipientBindingMessageId']) {
    nonempty(intent[key], key);
  }
  assert.equal(normalizeAddress(intent.token), BASE_USDC);
  assert.notEqual(normalizeAddress(intent.recipient), normalizeAddress(intent.source));
  assert.equal(ledger.roundId, intent.roundId);
  assert.equal(report.roundId, intent.roundId);
  assert.equal(report.slotId, intent.obligationId);
  assert.equal(report.reportId, intent.reportId);
  assert.equal(report.ownerAccepted, true);
  assert.equal(report.threadId, intent.recipientBindingThreadId);
  nonempty(report.messageId, 'original_report_message');
  assert.equal(destinationMessage(report), intent.recipientBindingMessageId);
  assert.equal(normalizeAddress(report.receivingAddress), normalizeAddress(intent.recipient));
  assert.equal(report.network, intent.network);
  assert.equal(report.rewardAtomicUsdc, intent.amountAtomic);
  const { contact, role } = originalObligation(ledger.contacts, intent.obligationId);
  assert.equal(contact.sentVerified, true);
  if (role === 'workflow') nonempty(contact.sentMessageId, 'workflow_sent_message_id');
  assert.equal(contact.threadId, report.threadId);
  assert.equal(nonempty(contact.to, 'original_sender').toLowerCase(), nonempty(report.sender, 'report_sender').toLowerCase());
  assert.equal(contact.rewardAtomicUsdc, intent.amountAtomic);
  assert.equal(contact.acceptedReportId, report.reportId);
  assert.equal(contact.acceptedReportPath, intent.acceptedReport);
  assert.equal(BigInt(intent.aggregateGasCapWei), BigInt(ledger.gasCapWei));
  const amount = integer(intent.amountAtomic);
  assert(amount > 0n);
  return { contact, role, amount };
}

function assertReceiveJournal(journal, intent) {
  assert(journal && typeof journal === 'object', 'execution journal required');
  assert.equal(journal.obligationId, intent.obligationId);
  assert.equal(journal.reportId, intent.reportId);
  assert.equal(journal.amountAtomic, intent.amountAtomic);
  assert.equal(typeof journal.transactionHash, 'string');
  assert(/^0x[0-9a-fA-F]{64}$/.test(journal.transactionHash), 'known hash required');
}

// Identity checks stay ahead of replay, unpaid, reserve, gas, and source checks.
// Execute and preflight stop on an existing journal before a signer or a chain call.
function prepareOriginalAward({ mode, intent, ledger, report, journal = null, walletPublic = null }) {
  const selected = modeOf(mode);
  const { contact, role, amount } = assertIdentity(intent, ledger, report);
  if (selected === 'receive') {
    assertReceiveJournal(journal, intent);
    return {
      action: 'receive',
      needsSigner: false,
      transactionHash: journal.transactionHash,
      contact,
      role,
      amount,
    };
  }
  if (journal !== null) {
    if (journal.state === 'broadcast_attempted_unknown') throw new Error('unknown_outcome_no_automatic_replay');
    throw new Error('execution already attempted; receive the known hash instead of replaying');
  }
  assert.equal(contact.status, 'accepted_owed', 'accepted_owed');
  assert.equal(report.status, 'accepted_owed', 'accepted_owed');
  assert.equal(report.paidPrincipalAtomicUsdc, '0');
  // Historical discovery rows may have no paid column. Never inherit their
  // paid amount into a workflow; its own explicit zero is required.
  if (role === 'workflow' || Object.hasOwn(contact, 'paidPrincipalAtomicUsdc')) {
    assert.equal(contact.paidPrincipalAtomicUsdc, '0', 'original_role_already_paid_or_unknown');
  }
  const reserved = otherReservedAtomic(ledger, intent.amountAtomic);
  assert.equal(integer(intent.otherReservedPrincipalAtomic), reserved);
  assert.equal(integer(intent.gasAlreadyAllocatedWei), integer(ledger.gasAllocatedEnvelopeWei ?? '0'));
  const remainingGasWei = integer(intent.aggregateGasCapWei) - integer(intent.gasAlreadyAllocatedWei);
  assert(remainingGasWei > 0n, 'gas_budget_exhausted');
  assert(walletPublic && typeof walletPublic.address === 'string', 'source_wallet_required');
  assert.equal(normalizeAddress(walletPublic.address), normalizeAddress(intent.source), 'source_mismatch');
  return {
    action: selected,
    needsSigner: true,
    contact,
    role,
    amount,
    otherReservedAtomic: reserved,
    remainingGasWei,
  };
}

export const NATIVE_INTENT_SCHEMA = 'pilot.native-obligation.intent.v1';
export const NATIVE_SOURCE_SCHEMA = 'pilot.native-obligation.source.v1';
export const NATIVE_DESTINATION_SCHEMA = 'pilot.native-obligation.destination.v1';
export const NATIVE_RESERVATION_SCHEMA = 'pilot.native-obligation.reservation.v1';

const NATIVE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
// Kernel task ids keep their owning colon grammar, for example round:name.
const KERNEL_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TERMS_VERSION = /^sha256:[0-9a-f]{64}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// In-process test seam only. The production command never forwards it from a file, flag, or intent field.
export const NONPRODUCTION_TEST_SEAM = 'nonproduction_test_seam';

function same(actual, expected, code) {
  assert(actual === expected, code);
}

function unsafeOpaque(value) {
  return typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || CONTROL_CHARS.test(value)
    || value.includes('/')
    || value.includes('\\')
    || value.includes('..');
}

function nativeId(value, code) {
  assert(!unsafeOpaque(value) && NATIVE_ID.test(value), code);
  return value;
}

function taskIdentifier(value, code) {
  assert(!unsafeOpaque(value), code);
  assert(NATIVE_ID.test(value) || KERNEL_TASK_ID.test(value), code);
  return value;
}

function objectOf(value, code) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code);
  return value;
}

function positiveAtomic(value, code) {
  let amount;
  try {
    amount = integer(value);
  } catch {
    assert(false, code);
  }
  assert(amount > 0n, code);
  return amount;
}

function countOf(value, code) {
  if (typeof value === 'number') {
    assert(Number.isSafeInteger(value) && value > 0, code);
    return BigInt(value);
  }
  return positiveAtomic(value, code);
}

function authorityClass(doc) {
  objectOf(doc, 'authority_class_required');
  assert(!Array.isArray(doc.authorityClass), 'authority_ambiguous');
  assert(doc.authorityClass !== 'worker_asserted', 'worker_asserted_binding');
  assert(doc.authorityClass === 'root_received' || doc.authorityClass === 'synthetic_fixture', 'authority_class_required');
  const synthetic = doc.authorityClass === 'synthetic_fixture';
  assert(doc.liveAuthorityValidated === false, synthetic ? 'synthetic_cannot_claim_live_authority' : 'live_authority_claim_refused');
  assert(doc.claimsLiveAcceptance === false, synthetic ? 'synthetic_cannot_claim_live_authority' : 'live_authority_claim_refused');
  return doc.authorityClass;
}

function refuseEmbeddedLegacy(source) {
  const banned = [
    ['contacts', 'legacy_slot_refused'],
    ['slotId', 'legacy_slot_refused'],
    ['workflowSlot', 'legacy_slot_refused'],
    ['legacySlot', 'legacy_slot_refused'],
    ['iou', 'legacy_slot_refused'],
    ['emailObservation', 'email_observation_not_settlement'],
    ['fundingAllocation', 'funding_must_be_separate'],
    ['reservation', 'funding_must_be_separate'],
    ['obligations', 'ambiguous_source'],
    ['verdicts', 'ambiguous_source'],
    ['termsHistory', 'terms_not_immutable'],
  ];
  for (const [key, code] of banned) assert(!Object.hasOwn(source, key), code);
}

function boundHash(record) {
  assert(record && typeof record === 'object' && !Array.isArray(record), 'known hash required');
  assert(typeof record.transactionHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(record.transactionHash), 'known hash required');
  return record.transactionHash;
}

export function nativeEnvelope(intent, authorityClass) {
  return {
    obligationId: intent.obligationId,
    reservationId: intent.reservationId,
    taskId: intent.taskId,
    claimId: intent.claimId,
    submissionId: intent.submissionId,
    verdictId: intent.verdictId,
    requesterId: intent.requesterId,
    contributorId: intent.contributorId,
    termsVersion: intent.termsVersion,
    artifactDigestSha256: intent.artifactDigestSha256,
    artifactBytes: intent.artifactBytes,
    artifactMediaType: intent.artifactMediaType,
    artifactRef: intent.artifactRef,
    roundId: intent.roundId,
    network: intent.network,
    token: normalizeAddress(intent.token),
    source: normalizeAddress(intent.source),
    recipient: normalizeAddress(intent.recipient),
    amountAtomic: intent.amountAtomic,
    otherReservedPrincipalAtomic: intent.otherReservedPrincipalAtomic,
    aggregateGasCapWei: intent.aggregateGasCapWei,
    gasAlreadyAllocatedWei: intent.gasAlreadyAllocatedWei,
    authorityClass,
  };
}

export function assertNativeEnvelope(record, intent, authorityClass) {
  const expected = nativeEnvelope(intent, authorityClass);
  for (const [key, value] of Object.entries(expected)) {
    assert(record && String(record[key]) === String(value), 'envelope_mismatch');
  }
}

function assertNativeReplay(intent, journal, obligationClaim, reservationClaim, mode, authority) {
  const records = [journal, obligationClaim, reservationClaim].filter((item) => item !== null && item !== undefined);
  if (mode === 'receive') {
    assert(journal != null || obligationClaim != null, 'known hash required');
    const hashes = records.map((record) => boundHash(record));
    assert(hashes.every((item) => item === hashes[0]), 'claim_journal_mismatch');
    for (const record of records) {
      assert(record.obligationId === intent.obligationId, 'claim_journal_mismatch');
      assertNativeEnvelope(record, intent, authority);
    }
    return hashes[0];
  }
  if (reservationClaim && reservationClaim.obligationId !== intent.obligationId) {
    throw new Error('reservation_already_claimed');
  }
  if (records.length > 0) {
    const record = obligationClaim ?? reservationClaim ?? journal;
    const state = record && typeof record === 'object' && !Array.isArray(record) ? record.state : undefined;
    if (state === 'broadcast_attempted_unknown') throw new Error('unknown_outcome_no_automatic_replay');
    throw new Error('execution already attempted; receive the known hash instead of replaying');
  }
  return null;
}

function assertNativeIdentity(intent, source, destination, reservation) {
  objectOf(intent, 'native_intent_required');
  objectOf(source, 'native_source_required');
  objectOf(destination, 'destination_evidence_required');
  objectOf(reservation, 'reservation_required');
  same(intent.schema, NATIVE_INTENT_SCHEMA, 'schema_mismatch');
  same(source.schema, NATIVE_SOURCE_SCHEMA, 'schema_mismatch');
  same(destination.schema, NATIVE_DESTINATION_SCHEMA, 'schema_mismatch');
  same(reservation.schema, NATIVE_RESERVATION_SCHEMA, 'schema_mismatch');
  same(intent.customerRevenue, false, 'customer_revenue_forbidden');
  same(intent.noAutomaticReplay, true, 'replay_forbidden');
  assert(intent.testSeam == null && intent.nonproduction == null && intent.allowSynthetic == null, 'synthetic_production_forbidden');
  refuseEmbeddedLegacy(source);
  assert(!Object.hasOwn(reservation, 'allocations'), 'ambiguous_reservation');
  assert(!Object.hasOwn(reservation, 'contacts'), 'legacy_slot_refused');
  const authority = authorityClass(source);
  same(authorityClass(destination), authority, 'authority_ambiguous');
  same(authorityClass(reservation), authority, 'authority_ambiguous');

  objectOf(source.task, 'task_required');
  objectOf(source.claim, 'claim_required');
  objectOf(source.submission, 'submission_required');
  objectOf(source.submission.artifact, 'artifact_required');
  objectOf(source.terms, 'terms_required');
  objectOf(source.verdict, 'verdict_required');
  objectOf(source.obligation, 'obligation_required');
  assert(source.obligation.kind !== 'iou' && source.obligation.kind !== 'legacy_slot', 'legacy_slot_refused');

  const obligationId = nativeId(intent.obligationId, 'obligation_id_required');
  same(nativeId(source.obligation.id, 'obligation_id_required'), obligationId, 'obligation_mismatch');
  same(nativeId(destination.obligationId, 'obligation_id_required'), obligationId, 'obligation_mismatch');
  same(nativeId(reservation.obligationId, 'obligation_id_required'), obligationId, 'obligation_mismatch');
  const taskId = taskIdentifier(intent.taskId, 'task_id_required');
  for (const value of [source.task.id, source.claim.taskId, source.submission.taskId, source.verdict.taskId, source.obligation.taskId, destination.taskId, reservation.taskId]) {
    same(taskIdentifier(value, 'task_id_required'), taskId, 'task_mismatch');
  }
  const claimId = nativeId(intent.claimId, 'claim_id_required');
  for (const value of [source.claim.id, source.submission.claimId, source.verdict.claimId, source.obligation.claimId]) {
    same(nativeId(value, 'claim_id_required'), claimId, 'claim_mismatch');
  }
  const submissionId = nativeId(intent.submissionId, 'submission_id_required');
  for (const value of [source.submission.id, source.verdict.submissionId, source.obligation.submissionId]) {
    same(nativeId(value, 'submission_id_required'), submissionId, 'submission_mismatch');
  }
  const verdictId = nativeId(intent.verdictId, 'verdict_id_required');
  same(nativeId(source.verdict.id, 'verdict_id_required'), verdictId, 'verdict_mismatch');
  same(nativeId(source.obligation.verdictId, 'verdict_id_required'), verdictId, 'verdict_mismatch');
  const reservationId = nativeId(intent.reservationId, 'reservation_id_required');
  same(nativeId(reservation.reservationId, 'reservation_id_required'), reservationId, 'reservation_mismatch');
  assert(reservationId !== obligationId, 'reservation_must_be_separate');
  const requesterId = nativeId(intent.requesterId, 'requester_required');
  for (const value of [source.requesterId, source.task.requesterId, source.obligation.requesterId]) {
    same(nativeId(value, 'requester_required'), requesterId, 'requester_mismatch');
  }
  const contributorId = nativeId(intent.contributorId, 'contributor_required');
  for (const value of [source.contributorId, source.task.contributorId, source.claim.contributorId, source.obligation.contributorId, destination.contributorId]) {
    same(nativeId(value, 'contributor_required'), contributorId, 'contributor_mismatch');
  }
  assert(typeof intent.termsVersion === 'string' && TERMS_VERSION.test(intent.termsVersion), 'terms_mismatch');
  for (const value of [source.terms.version, source.task.termsVersion, source.claim.termsVersion, source.submission.termsVersion, source.verdict.termsVersion, source.obligation.termsVersion, reservation.termsVersion]) {
    same(value, intent.termsVersion, 'terms_mismatch');
  }
  assert(source.terms.immutable === true, 'terms_not_immutable');
  assert(source.terms.superseded !== true, 'terms_not_immutable');
  assert(typeof intent.artifactDigestSha256 === 'string' && DIGEST.test(intent.artifactDigestSha256), 'artifact_mismatch');
  same(source.submission.artifact.digestSha256, intent.artifactDigestSha256, 'artifact_mismatch');
  same(source.verdict.artifactDigestSha256, intent.artifactDigestSha256, 'artifact_mismatch');
  const bytes = countOf(intent.artifactBytes, 'artifact_mismatch');
  same(countOf(source.submission.artifact.bytes, 'artifact_mismatch'), bytes, 'artifact_mismatch');
  assert(typeof source.submission.artifact.mediaType === 'string' && source.submission.artifact.mediaType.trim().length > 0, 'artifact_mismatch');
  assert(typeof source.submission.artifact.ref === 'string' && source.submission.artifact.ref.trim().length > 0, 'artifact_mismatch');
  same(intent.artifactMediaType, source.submission.artifact.mediaType, 'artifact_mismatch');
  same(intent.artifactRef, source.submission.artifact.ref, 'artifact_mismatch');

  const amount = positiveAtomic(intent.amountAtomic, 'amount_must_be_positive');
  same(positiveAtomic(source.obligation.amountAtomic, 'amount_mismatch'), amount, 'amount_mismatch');
  same(positiveAtomic(source.terms.rewardAtomic, 'amount_mismatch'), amount, 'amount_mismatch');
  same(positiveAtomic(reservation.principalAtomic, 'reserve_mismatch'), amount, 'reserve_mismatch');
  let other;
  try {
    other = integer(reservation.otherPrincipalAtomic);
  } catch {
    assert(false, 'reserve_mismatch');
  }
  assert(other >= 0n, 'reserve_mismatch');
  same(integer(intent.otherReservedPrincipalAtomic), other, 'reserve_mismatch');
  nativeId(intent.roundId, 'round_required');
  same(reservation.roundId, intent.roundId, 'cross_round_allocation');
  if (Object.hasOwn(reservation, 'fundingRoundId')) same(reservation.fundingRoundId, intent.roundId, 'cross_round_allocation');
  const cap = positiveAtomic(reservation.gasCapWei, 'gas_cap_mismatch');
  same(positiveAtomic(intent.aggregateGasCapWei, 'gas_cap_mismatch'), cap, 'gas_cap_mismatch');
  let allocated;
  try {
    allocated = integer(reservation.gasAllocatedWei);
    same(integer(intent.gasAlreadyAllocatedWei), allocated, 'gas_allocation_mismatch');
  } catch (error) {
    if (error.message === 'gas_allocation_mismatch') throw error;
    throw new Error('gas_allocation_mismatch');
  }
  const remainingGasWei = cap - allocated;
  assert(remainingGasWei > 0n, 'gas_budget_exhausted');

  same(intent.network, 'eip155:8453', 'network_mismatch');
  same(destination.network, intent.network, 'network_mismatch');
  same(reservation.network, intent.network, 'network_mismatch');
  same(source.terms.network, intent.network, 'network_mismatch');
  same(normalizeAddress(intent.token), BASE_USDC, 'token_mismatch');
  same(normalizeAddress(destination.token), BASE_USDC, 'token_mismatch');
  same(normalizeAddress(reservation.token), BASE_USDC, 'token_mismatch');
  same(source.terms.asset, 'USDC', 'token_mismatch');
  same(reservation.asset, 'USDC', 'token_mismatch');
  const recipient = normalizeAddress(intent.recipient);
  const sourceAddress = normalizeAddress(intent.source);
  assert(recipient !== sourceAddress, 'source_equals_recipient');
  same(normalizeAddress(destination.address), recipient, 'recipient_mismatch');
  if (source.obligation.payoutDestination != null) {
    same(normalizeAddress(source.obligation.payoutDestination), recipient, 'recipient_mismatch');
  }
  assert(destination.bindingClass !== 'worker_asserted', 'worker_asserted_binding');
  assert(destination.bindingClass !== 'email_observation', 'email_observation_not_settlement');
  assert(destination.bindingClass !== 'legacy_slot' && destination.bindingClass !== 'discovery' && destination.bindingClass !== 'workflow', 'legacy_slot_refused');
  assert(destination.bindingClass === 'root_received_destination', 'destination_binding_required');
  for (const key of ['threadId', 'sender', 'messageId']) assert(!Object.hasOwn(destination, key), 'email_observation_not_settlement');
  for (const key of ['slotId', 'workflowSlot']) assert(!Object.hasOwn(destination, key), 'legacy_slot_refused');
  assert(typeof destination.evidenceRef === 'string' && destination.evidenceRef.trim().length > 0 && destination.evidenceRef.length <= 200, 'destination_evidence_required');

  assert(source.obligation.paid === false, 'paid_source');
  assert(source.obligation.transfer === null, 'paid_source');
  assert(source.obligation.status !== 'paid' && source.obligation.fulfillment !== 'paid', 'paid_source');
  if (Object.hasOwn(source.obligation, 'payoutState')) assert(source.obligation.payoutState === 'owed', 'paid_source');
  assert(reservation.paid === false && reservation.transfer === null, 'paid_source');
  assert(reservation.status === 'reserved', 'reserve_mismatch');
  assert(source.obligation.revoked === false && source.revoked !== true && source.claim.revoked === false && source.claim.status !== 'revoked' && source.obligation.status !== 'revoked', 'revoked_source');
  // The actual opportunity store advances an accepted claim to owed.
  // Its pass verdict, accepted-unpaid obligation and reserved principal still bind.
  assert(['submitted', 'accepted', 'owed'].includes(source.claim.status), 'unaccepted_source');
  assert(source.verdict.outcome === 'pass' && source.verdict.accepted === true, 'unaccepted_source');
  assert(source.obligation.status === 'accepted_unpaid', 'unaccepted_source');
  assert(source.obligation.fulfillment === 'not_observed', 'unaccepted_source');

  return {
    amount, other, remainingGasWei, authority, obligationId, reservationId, taskId, claimId, submissionId, verdictId, sourceAddress,
  };
}

// Tagged native obligation. No fabricated contact and no second sender.
// synthetic_fixture reaches a signer only through NONPRODUCTION_TEST_SEAM, never through an intent flag.
export function prepareNativeObligation({
  mode, intent, journal = null, walletPublic = null, nativeInputs = null,
  obligationClaim = null, reservationClaim = null, testSeam = null,
}) {
  const selected = modeOf(mode);
  assert(nativeInputs && typeof nativeInputs === 'object', 'native_inputs_required');
  const identity = assertNativeIdentity(intent, nativeInputs.source, nativeInputs.destination, nativeInputs.reservation);
  if (identity.authority === 'synthetic_fixture' && testSeam !== NONPRODUCTION_TEST_SEAM) {
    throw new Error('synthetic_production_forbidden');
  }
  const transactionHash = assertNativeReplay(intent, journal, obligationClaim, reservationClaim, selected, identity.authority);
  if (selected === 'receive') {
    return {
      action: 'receive',
      needsSigner: false,
      role: 'native_obligation',
      transactionHash,
      amount: identity.amount,
      otherReservedAtomic: identity.other,
      remainingGasWei: identity.remainingGasWei,
      authorityClass: identity.authority,
      obligationId: identity.obligationId,
      reservationId: identity.reservationId,
      taskId: identity.taskId,
    };
  }
  assert(walletPublic && typeof walletPublic.address === 'string', 'source_wallet_required');
  assert(normalizeAddress(walletPublic.address) === identity.sourceAddress, 'source_mismatch');
  return {
    action: selected,
    needsSigner: true,
    role: 'native_obligation',
    amount: identity.amount,
    otherReservedAtomic: identity.other,
    remainingGasWei: identity.remainingGasWei,
    authorityClass: identity.authority,
    obligationId: identity.obligationId,
    reservationId: identity.reservationId,
    taskId: identity.taskId,
  };
}

export function prepareAward(input) {
  if (input?.intent?.schema === NATIVE_INTENT_SCHEMA) return prepareNativeObligation(input);
  return prepareOriginalAward(input);
}
