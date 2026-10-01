#!/usr/bin/env node
import { IntegrationStore } from './src/store.mjs';
if(process.argv[2]!=='--apply' || !process.env.CORRESPONDENCE_DATABASE_URL || !process.env.CORRESPONDENCE_PG_SCHEMA)
  throw new Error('explicit --apply and correspondence database/schema required; base and VF02 must already exist');
const store=new IntegrationStore(process.env.CORRESPONDENCE_DATABASE_URL,{schema:process.env.CORRESPONDENCE_PG_SCHEMA,poolMax:1});
try{await store.migrate();await store.checkReady();console.log('VF04 additive migration applied to the selected namespace');}finally{await store.close();}
