-- DESTRUCTIVE: export cells + vf02 receipts first; stop/unmount all VF02 writers.
-- Execute in the same explicitly selected schema as the up migration.
BEGIN;
DELETE FROM correspondence_idempotency WHERE scope LIKE 'vf02:cell:%';
DROP INDEX IF EXISTS correspondence_vf02_receipt_revision_idx;
DROP TABLE IF EXISTS correspondence_vf02_work_cells;
COMMIT;
