import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { databaseUrl, dropSchema, openStore, uniqueSchema } from './helpers.js';
import { quoteIdent } from '../src/config.js';

test('funnel migration inspects only its own retained table during unrelated schema DDL', {timeout:30000}, async()=>{
  const schema=uniqueSchema();const unrelated=uniqueSchema();const other=quoteIdent(unrelated);
  const client=new pg.Client({connectionString:databaseUrl()});await client.connect();
  const initial=await openStore({schema});await initial.store.close();
  try {
    await client.query(`CREATE SCHEMA ${other}`);
    const results=await Promise.allSettled([
      (async()=>{for(let i=0;i<250;i++) await client.query(`DROP TABLE IF EXISTS ${other}.opportunity_events; CREATE TABLE ${other}.opportunity_events(kind text CHECK(kind IN ('synthetic')))`);})(),
      (async()=>{for(let i=0;i<12;i++){const {store}=await openStore({schema});try{await store.checkReady();}finally{await store.close();}}})(),
    ]);
    for(const result of results) assert.equal(result.status,'fulfilled',result.status==='rejected'?String(result.reason):'');
  } finally {await client.end();await dropSchema(unrelated);await dropSchema(schema);}
});
