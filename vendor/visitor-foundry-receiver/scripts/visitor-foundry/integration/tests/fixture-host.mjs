import {supervise} from '../src/supervisor.mjs';
// TEST ONLY: trusted IPC control is never an HTTP administration surface.
import { createApp } from '../../../../services/correspondence/dist/app.js';
import { createPostgresStore } from '../../../../services/correspondence/dist/store/postgres.js';
import { prepareFoundryHost } from '../../../../services/correspondence/dist/visitor-foundry/host.js';
import { createFoundryExtension } from '../src/extension.mjs';
const databaseUrl = process.env.VF04_TEST_DATABASE_URL, schema = process.env.VF04_TEST_SCHEMA;
if (!databaseUrl || !schema?.startsWith('vf04_')) throw new Error('disposable VF04 database required');
const base = await createPostgresStore(databaseUrl, { schema, poolMax: 1 });
const extension = await createFoundryExtension({enabled:true,databaseUrl,schema,poolMax:2,participationKey:'vf09-existing-owner-qa-host-key-32-bytes'});
const {integration,cells}=extension;
const metrics=[];if(process.env.VF09_BENCH)integration.onMetric=m=>{if(metrics.length<20000)metrics.push(m);};
await cells.migrate(); await integration.migrate();
let crashPoint;
integration.onInvocationReserved=async()=>{if(crashPoint==='invocation:reserved'){process.kill(process.pid,'SIGKILL');await new Promise(()=>{});}};
const childWrite=integration.portableChild.bind(integration);
integration.portableChild=async(...args)=>{const r=await childWrite(...args);const update=args[5];const phase=update.planned?'planned':update.identity?'identity':'sample';if(crashPoint===`child:${phase}`||crashPoint===`child:last-sample`&&phase==='sample'&&args[4]==='case:unsupported-prose'){process.kill(process.pid,'SIGKILL');await new Promise(()=>{});}return r;};
for (const name of ['admit', 'reserve', 'reconcile', 'publish','requestRevalidation','configureVerification','participate','uploadComponent','invokePortable']) {
  const original = integration[name].bind(integration);
  integration[name] = async (...args) => {
    const value = await original(...args);
    if (crashPoint === name) { process.send?.({ crashCommitted: name }); process.kill(process.pid, 'SIGKILL'); await new Promise(() => {}); }
    return value;
  };
}
const lifecycle = await prepareFoundryHost(base, { enabled: true, create: async () => extension });
const app = createApp(base, { port: 0, adminToken: 'vf04-owner-qa-bootstrap', databaseUrl, store: 'postgres', bodyLimitBytes: 524288,
  rateLimitWindowMs: 60000, rateLimitMax: 30000, corsOrigins: [], trustProxyHops: 0, pgSchema: schema, poolMax: 1 });
lifecycle.mount(app);
const server = app.listen(0, '127.0.0.1', () => process.send?.({ ready: true, baseUrl: `http://127.0.0.1:${server.address().port}`, pid: process.pid }));
process.on('message', async message => {
  try {
    let result;
    if(message.op==='metrics')result=metrics.splice(0);
    else if(message.op==='supervise')result=await supervise(integration,...message.args);
    else if (message.op === 'armCrash') { crashPoint = message.args[0]; result = true; }
    else if (['enrollPortable','configureParticipation','enroll','reserve','reconcile','publish','markUnknown','invalidate','requestRevalidation','configureVerification'].includes(message.op)) result = await integration[message.op](...message.args);
    else throw new Error('unsupported fixture control');
    process.send?.({ id: message.id, result });
  } catch (error) { process.send?.({ id: message.id, error: error.code ?? error.message }); }
});
let stopping = false;
async function stop() { if (stopping) return; stopping = true; clearTimeout(lifetime); server.closeAllConnections(); await new Promise(r => server.close(r)); await base.close(); process.exit(0); }
const lifetime = setTimeout(stop, 240000);
process.on('disconnect', stop); process.on('SIGTERM', stop); process.on('SIGINT', stop);
