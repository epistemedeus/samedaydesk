import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const SCHEMA = 'cc0.query-key-caller.v4';

export function observeDiscovery(directory, manifest) {
  const rows = manifest.map((entry) => {
    const body = readFileSync(join(directory, entry.file));
    const text = body.toString('utf8');
    return {
      url: entry.url,
      status: entry.status,
      observedAt: entry.observedAt,
      file: entry.file,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      schemaPresent: text.includes(SCHEMA),
    };
  });
  const linked = rows.some((row) => row.schemaPresent);
  return {result: linked ? 'schema_linked' : 'schema_unlinked', rows};
}

export function readDiscovery(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const names = new Set(readdirSync(directory).filter((name) => name !== 'manifest.json'));
  for (const entry of manifest) {
    if (!names.has(entry.file)) throw new Error('discovery_file_missing:' + entry.file);
  }
  return observeDiscovery(directory, manifest);
}
