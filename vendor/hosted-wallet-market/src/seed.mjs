import {createHash} from 'node:crypto';
import {
  LEGACY_OBLIGATION_ID,
  LEGACY_TASK_ID,
  LEGACY_TERMS_VERSION,
} from './preserve.mjs';

const LEGACY_AT = new Date('2026-10-14T08:19:30.261Z');
const TOKEN_ID = 'tok_legacy23410001';
const RESERVATION_ID = 'rsv_legacy23410001';
const SUBMISSION_ID = 'sub_legacy23410001';
const VERDICT_ID = 'ver_legacy23410001';
const EVENT_ID = 'evt_legacy23410001';
const EVIDENCE = Buffer.from('staging-stand-in-continuity');

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function seedStaging(client) {
  await client.query('BEGIN');
  try {
    await seedLegacy(client);
    await client.query(
      'INSERT INTO hosted_wallet_market_guard.preserved_obligation_ids (id) VALUES ($1)',
      [LEGACY_OBLIGATION_ID],
    );
    await client.query(
      'INSERT INTO hosted_wallet_market_guard.obligation_guard_seal (id, sealed_at) VALUES (TRUE, $1)',
      [LEGACY_AT],
    );
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw error;
  }
}

export async function seedLegacy(client) {
  const digest = digestBytes(EVIDENCE);
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_tasks (
      id, title, summary, provenance, lifecycle, funding_state, payout_state,
      current_terms_version, terms_revision, schema_version, correction_max_revisions,
      budget_amount, budget_asset, budget_network, created_at, updated_at
    ) VALUES (
      $1, 'Continuity stand-in', 'Staging stand-in row. Not a copy of live debt.',
      'production', 'accepted', 'reserved', 'owed', $2, 1, 1, 1,
      '100000', 'USDC', 'eip155:8453', $3, $3
    )`,
    [LEGACY_TASK_ID, LEGACY_TERMS_VERSION, LEGACY_AT],
  );
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_terms (
      task_id, version, terms_revision, schema_version, summary, reward_amount,
      reward_asset, reward_network, claim_ttl_seconds, max_artifact_bytes,
      allowed_media_types, slot_limit, created_at
    ) VALUES (
      $1, $2, 1, 1, 'Staging stand-in terms. Not a copy of live terms.', '100000',
      'USDC', 'eip155:8453', 7200, 16384, ARRAY['text/plain']::text[], 1, $3
    )`,
    [LEGACY_TASK_ID, LEGACY_TERMS_VERSION, LEGACY_AT],
  );
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_contributor_tokens (
      id, public_id, token_hash, payout_destination, task_scope, provenance, created_at
    ) VALUES ($1, 'legacy-public-234100', $2, $3, $4, 'production', $5)`,
    [TOKEN_ID, digest, '0x' + '11'.repeat(20), LEGACY_TASK_ID, LEGACY_AT],
  );
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_reservations (
      id, task_id, terms_version, contributor_public_id, contributor_token_id,
      status, expires_at, created_at
    ) VALUES ($1, $2, $3, 'legacy-public-234100', $4, 'completed', $5, $5)`,
    [RESERVATION_ID, LEGACY_TASK_ID, LEGACY_TERMS_VERSION, TOKEN_ID, LEGACY_AT],
  );
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_submissions (
      id, task_id, reservation_id, terms_version, artifact_ref, artifact_digest_sha256,
      artifact_media_type, artifact_bytes, evidence_bytes, created_at
    ) VALUES ($1, $2, $3, $4, 'staging-stand-in:legacy', $5, 'text/plain', $6, $7, $8)`,
    [SUBMISSION_ID, LEGACY_TASK_ID, RESERVATION_ID, LEGACY_TERMS_VERSION, digest, EVIDENCE.length, EVIDENCE, LEGACY_AT],
  );
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_verdicts (
      id, task_id, reservation_id, submission_id, terms_version, artifact_digest_sha256,
      verifier_version, outcome, reasons, ordinal, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'staging-stand-in', 'pass', $7::jsonb, 1, $8)`,
    [VERDICT_ID, LEGACY_TASK_ID, RESERVATION_ID, SUBMISSION_ID, LEGACY_TERMS_VERSION, digest, JSON.stringify({outcome: 'pass'}), LEGACY_AT],
  );
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_obligations (
      id, task_id, reservation_id, submission_id, contributor_public_id, payout_destination,
      reward_amount, reward_asset, reward_network, payout_state, terms_version,
      idempotency_key, adapter, verdict_id, created_at
    ) VALUES (
      $1, $2, $3, $4, 'legacy-public-234100', $5,
      '100000', 'USDC', 'eip155:8453', 'owed', $6,
      'legacy-234100-obligation', 'staging-representation', $7, $8
    )`,
    [LEGACY_OBLIGATION_ID, LEGACY_TASK_ID, RESERVATION_ID, SUBMISSION_ID, '0x' + '11'.repeat(20), LEGACY_TERMS_VERSION, VERDICT_ID, LEGACY_AT],
  );
  await client.query(
    `INSERT INTO cj227_earned_work.earned_work_events (
      id, task_id, sequence, kind, payload, created_at
    ) VALUES ($1, $2, 1, 'accept', $3::jsonb, $4)`,
    [EVENT_ID, LEGACY_TASK_ID, JSON.stringify({standIn: true}), LEGACY_AT],
  );
}

export const LEGACY_IDS = Object.freeze({
  taskId: LEGACY_TASK_ID,
  obligationId: LEGACY_OBLIGATION_ID,
  tokenId: TOKEN_ID,
  reservationId: RESERVATION_ID,
  submissionId: SUBMISSION_ID,
  verdictId: VERDICT_ID,
  eventId: EVENT_ID,
});
