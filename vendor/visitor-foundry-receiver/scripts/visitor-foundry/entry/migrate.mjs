import { readFile } from 'node:fs/promises';
import { PostgresStore } from '../../../services/correspondence/dist/store/postgres.js';
import { EntryStore } from './src/store.mjs';
// Existing base migration must have run. This command touches only entry tables.
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!process.env.VF10_DATABASE_URL || !config.schema || !config.profile) throw new Error('explicit database/schema/profile required');
const correspondence = new PostgresStore(process.env.VF10_DATABASE_URL, { schema: config.schema, poolMax: 1 });
const entry = new EntryStore({ databaseUrl: process.env.VF10_DATABASE_URL, schema: config.schema, correspondence, poolMax: 1 });
try { await entry.migrate(); await entry.install(config.profile); console.log(JSON.stringify({ installed: true, receiver: 'disabled' })); }
finally { await entry.close(); await correspondence.close(); }
