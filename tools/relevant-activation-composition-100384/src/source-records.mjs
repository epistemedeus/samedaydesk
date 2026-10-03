/** SPDX-License-Identifier: MIT. Read only the caller-selected receiving record. No writer or signer. */
import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { sha256Json } from '../vendor/ein-activation-continuation/src/catalog.mjs';
import { only, bounded } from './input.mjs';
import { fail } from './budget.mjs';

export const SOURCE_RECORD_SCHEMA = 'samedaydesk.caller-source-records.v1';

export function readSourceRecords(task, env) {
  // This path comes from the invoking caller, outside the model's task JSON.
  // Matching arbitrary source/authority labels in task JSON alone is insufficient.
  const file = env.SDS_ACTIVATION_SOURCE_RECORDS_FILE;
  if (typeof file !== 'string' || !file) throw fail('source_records_required');
  let fd;
  let record;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 32768 || (stat.mode & 0o077) !== 0
        || (process.getuid && stat.uid !== process.getuid())) throw fail('source_record_permissions');
    const raw = Buffer.alloc(stat.size);
    const read = readSync(fd, raw, 0, raw.length, 0);
    record = JSON.parse(raw.subarray(0, read).toString('utf8'));
  } catch (error) {
    if (['source_record_permissions'].includes(error.code)) throw error;
    throw fail('source_record_unreadable');
  } finally { if (fd !== undefined) closeSync(fd); }
  bounded(record);
  only(record, ['schema', 'taskId', 'recipientId', 'goal', 'facts']);
  if (record.schema !== SOURCE_RECORD_SCHEMA || record.taskId !== task.taskId
      || record.recipientId !== task.recipientId) throw fail('source_record_scope_mismatch');
  if (sha256Json(record.goal) !== sha256Json(task.goal) || sha256Json(record.facts) !== sha256Json(task.facts)) throw fail('source_record_mismatch');
  return sha256Json(record);
}
