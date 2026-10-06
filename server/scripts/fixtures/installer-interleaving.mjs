// Disposable PG only: force the owning migration/receiving lock boundary.
// Split the two original migration files without changing their transaction.
import {PostgresStore} from '@neomorphic/correspondence';
import {openEntryFacade,closeEntryThenBase} from '../../foundry/compose.js';
import {receiveUnconsumed} from '../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/receive.mjs';

const databaseUrl=process.env.CORRESPONDENCE_DATABASE_URL,schema=process.env.CORRESPONDENCE_PG_SCHEMA;
if(new URL(databaseUrl).hostname!=='127.0.0.1'||!/^\/generation_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))throw new Error('disposable_database_required');
const config={databaseUrl,pgSchema:schema,adminToken:'fixture-does-not-serve',bodyLimitBytes:524288,
 rateLimitWindowMs:60000,rateLimitMax:100,corsOrigins:[],trustProxyHops:0,poolMax:1,port:0};
const owners=[];
try{
 for(let n=0;n<2;n++){
  const base=new PostgresStore(databaseUrl,{schema,poolMax:1});
  const {mounted}=await openEntryFacade({store:base,config,env:process.env});owners.push({base,mounted});
 }
 const [a,b]=owners;let bPid,locks;
 let start;const started=new Promise(resolve=>{start=resolve;});
 const bTx=b.mounted.entry.tx.bind(b.mounted.entry);
 b.mounted.entry.tx=(fn,options)=>bTx(async c=>{
  bPid=c.processID;const query=c.query.bind(c);
  c.query=async(sql,...args)=>{
   if(typeof sql==='string'&&sql.includes('ADD COLUMN IF NOT EXISTS active_profile')){
    const split=sql.indexOf('-- Explicit one-way contribution profile');
    if(split<0)throw new Error('migration_boundary_missing');
    await query(sql.slice(0,split));return query(sql.slice(split),...args);
   }
   return query(sql,...args);
  };
  try{return await fn(c);}finally{c.query=query;}
 },options);
 const aTx=a.mounted.entry.tx.bind(a.mounted.entry);
 a.mounted.entry.tx=(fn,options)=>aTx(async c=>{
  const query=c.query.bind(c);
  c.query=async(sql,...args)=>{
   const result=await query(sql,...args);
   if(sql==='SELECT * FROM correspondence_vf10_installation WHERE singleton FOR UPDATE'){
    start();const deadline=performance.now()+1000;
    while(performance.now()<deadline){
     const observed=await a.base.query(`SELECT
      bool_or(relation=to_regclass($2) AND mode='AccessExclusiveLock' AND NOT granted) AS waiting,
      bool_or(relation=to_regclass($3) AND mode='AccessExclusiveLock' AND granted) AS registrations
      FROM pg_locks WHERE pid=$1 AND locktype='relation'`,[bPid,`${schema}.correspondence_vf10_installation`,`${schema}.correspondence_vf10_registrations`]);
     if(observed.rows[0].waiting){locks={installationWait:true,registrationsHeld:observed.rows[0].registrations===true};break;}
     await new Promise(resolve=>setTimeout(resolve,5));
    }
    if(!locks)throw new Error('interleaving_not_established');
   }
   return result;
  };
  try{return await fn(c);}finally{c.query=query;}
 },options);
 const receive=receiveUnconsumed(a.mounted.entry,a.mounted.receiver,{
  expectedHostConfigId:process.env.FOUNDRY_RECEIVE_EXPECTED_HOST_CONFIG_ID,
  expectedEntryTermsHash:process.env.FOUNDRY_RECEIVE_EXPECTED_ENTRY_TERMS_HASH,
 });
 const migrate=started.then(()=>b.mounted.entry.migrate());
 const settled=await Promise.allSettled([receive,migrate]);
 const outcomes=settled.map(r=>r.status==='fulfilled'?{ok:true,...(r.value?.id?{receipt:r.value}: {})}:
  {ok:false,code:/^[A-Z0-9]{5}$/.test(r.reason?.code??'')?r.reason.code:'fixture_failed'});
 console.log(JSON.stringify({locks,outcomes}));
}finally{for(const {base,mounted} of owners)await closeEntryThenBase(mounted,base);}
