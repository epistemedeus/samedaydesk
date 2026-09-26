#!/usr/bin/env node
import { WorkCellStore } from '../../../services/correspondence/dist/visitor-work-cells/index.js';

if (process.argv[2] !== '--apply' || !process.env.CORRESPONDENCE_DATABASE_URL || !process.env.CORRESPONDENCE_PG_SCHEMA) {
  console.error('Requires --apply and explicit CORRESPONDENCE_DATABASE_URL/CORRESPONDENCE_PG_SCHEMA. Apply correspondence base migration first.');
  process.exitCode = 1;
} else {
  const cells = new WorkCellStore(process.env.CORRESPONDENCE_DATABASE_URL, {
    schema: process.env.CORRESPONDENCE_PG_SCHEMA, poolMax: 1,
  });
  try {
    await cells.migrate(); await cells.checkReady();
    console.log(`VF02 migration applied in schema ${cells.schema}; routes remain opt-in`);
  } catch {
    console.error('VF02 migration failed; inspect selected schema and base migration. No database URL logged.');
    process.exitCode = 1;
  } finally { await cells.close(); }
}
