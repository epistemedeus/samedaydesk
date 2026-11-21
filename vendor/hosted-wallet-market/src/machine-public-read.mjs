import {createHash} from 'node:crypto';

// One discovery row per task, UTC day and admitted source hash. A repeated page
// view refreshes that bucket; it does not allocate a new primary key.
export function publicDiscoveryEventId(taskId, sourceSha256, nowMs) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return createHash('sha256').update(String(taskId) + '\0' + day + '\0' + String(sourceSha256)).digest('hex');
}

export async function recordPublicDiscovery(store, {tenant, rows, sourceSha256, nowMs, payload}) {
  for (const row of rows) {
    await store.measure(tenant, row.id, 'discovery', publicDiscoveryEventId(row.id, sourceSha256, nowMs), 'anonymous', payload);
  }
}
