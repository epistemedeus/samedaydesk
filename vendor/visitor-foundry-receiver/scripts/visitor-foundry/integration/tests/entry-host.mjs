// Disposable host. IPC is private test/installation control, never HTTP authority.
import {createPostgresStore} from '../../../../services/correspondence/dist/store/postgres.js';
import {createEntryReuseMount} from '../entry/mount.mjs';
import {express} from '../../entry/src/deps.mjs';
import {supervise} from '../src/supervisor.mjs';
const databaseUrl=process.env.VF04_TEST_DATABASE_URL,schema=process.env.VF12_SCHEMA;
if(!databaseUrl||!/^vf04_entry_[a-z0-9_]+$/.test(schema))throw new Error('disposable entry database required');
const base=await createPostgresStore(databaseUrl,{schema,poolMax:1});
const config={port:0,adminToken:'vf12-fixture-only-never-issued',databaseUrl,store:'postgres',bodyLimitBytes:524288,rateLimitWindowMs:60000,rateLimitMax:30000,corsOrigins:[],trustProxyHops:0,pgSchema:schema,poolMax:1};
const mount=await createEntryReuseMount({enabled:true,databaseUrl,schema,correspondence:base,config,hostProfile:JSON.parse(process.env.VF12_HOST),participationKey:'vf12-test-host-private-purpose-key-32',poolMax:2});
const {entry,receiver,extension:{integration,cells}}=mount;
await cells.migrate();await integration.migrate();await entry.migrate();await receiver.migrate();
entry.receiver=null;const prior=await entry.install(JSON.parse(process.env.VF12_PRIVATE));
async function enable(){entry.receiver=receiver;return entry.enableContribution({expectedTerms:prior.termsHash,id:'vf10:contribution-v2',binding:receiver.binding()});}
if(process.env.VF12_PRIVATE_ONLY!=='1')await enable();
let crashPoint;
const crash=point=>{if(crashPoint===point){process.kill(process.pid,'SIGKILL');return new Promise(()=>{});}};
entry.afterReservation=()=>crash('entry:reserved');entry.afterReceiverMarker=(_r,d)=>d.begin?crash('receiver:marker'):undefined;
receiver.afterReservation=()=>crash('receiver:reserved');receiver.afterCompletion=()=>crash('receiver:completed');
for(const method of ['createProject','createGrant']){const fn=base[method].bind(base);base[method]=async(...args)=>{const value=await fn(...args);if(method==='createProject'||args[0].role==='writer')await crash(method);return value;};}
const register=entry.register.bind(entry);entry.register=async(...args)=>{await crash('entry:before');const value=await register(...args);await crash('entry:reply');return value;};
for(const method of ['participate','invokePortable']){const fn=integration[method].bind(integration);integration[method]=async(...args)=>{const value=await fn(...args);await crash(method);if(method==='participate')await crash(`participate:${args[1].operation}`);return value;};}
integration.onInvocationReserved=()=>crash('invocation:reserved');
const childWrite=integration.portableChild.bind(integration);integration.portableChild=async(...args)=>{const value=await childWrite(...args);if(args[5].identity)await crash('child:identity');return value;};
const root=express();root.use('/api/correspondence',mount.app);
const server=root.listen(Number(process.env.VF12_PORT??0),'127.0.0.1',()=>process.send({ready:true,baseUrl:`http://127.0.0.1:${server.address().port}/api/correspondence`,pid:process.pid}));
process.on('message',async m=>{try{let result;
 if(m.op==='arm')result=(crashPoint=m.args[0],true);
 else if(m.op==='enable')result=await enable();
 else if(m.op==='install')result=await entry.install(...m.args);
 else if(m.op==='enableAs')result=await entry.enableContribution(...m.args);
 else if(['recover','read','begin','status'].includes(m.op))result=await receiver[m.op](...m.args);
 else if(m.op==='supervise')result=await supervise(integration,...m.args);
 else if(['reserve','reconcile','publish','requestRevalidation','configureVerification','configureParticipation'].includes(m.op))result=await integration[m.op](...m.args);
 else throw new Error('unsupported_private_control');
 process.send?.({id:m.id,result});
 }catch(e){process.send?.({id:m.id,error:e.code??e.message});}});
let stopped=false;async function stop(){if(stopped)return;stopped=true;clearTimeout(timer);server.closeAllConnections();await new Promise(r=>server.close(r));await mount.close();await base.close();process.exit(0);}
const timer=setTimeout(stop,300000);process.on('disconnect',stop);process.on('SIGTERM',stop);
