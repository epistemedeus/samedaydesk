export const LEGACY_OBLIGATION_ID = 'obl_legacy23410001';
export const LEGACY_TASK_ID = 'continuity-234100-v1';
export const LEGACY_TERMS_VERSION = 'sha256:12ce54256fa4efcbc3756fe8a5026d1df6acf3dbc75921c911d1a03ce622893c';
export const FROZEN_MARKERS = ['221400', '234100', 'agent-opportunity-221400-v1', 'continuity-234100-v1'];
export const REFUSED_MIGRATION = '005_obligation_settlement_and_retention.sql';

/** Disposable fixture digest. Not an admission source. */
export const SYNTHETIC_FIXTURE_NAME_DIGEST = '2ee7bd57a68b3d5a485bd0537225f3fdf3b1cc332e650a983a63dd5099c15203';
/** keyNamesSha256 of the Root-held hosted readback names. Not a debt digest. The name list is not in this package. */
export const INSTALLED_READBACK_NAME_DIGEST = 'fbd70f8e66e0c3d6695a4368f2f439c39f32407152d9b6650c519e8d321c6a33';

export const OBLIGATION_COLUMNS = Object.freeze([
  'id', 'task_id', 'reservation_id', 'submission_id', 'contributor_public_id',
  'payout_destination', 'reward_amount', 'reward_asset', 'reward_network',
  'payout_state', 'terms_version', 'idempotency_key', 'adapter', 'verdict_id', 'created_at',
]);

export function frozenMarker(text) {
  return FROZEN_MARKERS.find(marker => String(text || '').includes(marker)) || null;
}
