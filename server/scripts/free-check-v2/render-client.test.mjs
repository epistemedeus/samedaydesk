import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRenderer, createRenderState, RENDER_CACHE_MS } from '../../lib/free-check-v2/render-client.js';
import { createRequestBudget } from '../../lib/agent-readiness/request-budget.js';
import { runFreeCheck, TOTAL_MS } from '../../lib/free-check-v2/probe.js';
import { setTransportForTests } from '../../lib/agent-readiness/bounded-fetch.js';
const account='718093524570bf468ddcd030df87562a', token='fixture-only-private-token', target='https://public.example/';
const text='Useful product information for business teams. '.repeat(50);
const payload=value=>({success:true,result:[{selector:'body',results:[{text:value}]}]});
const response=(value=payload(text),status=200,usage='1234')=>({ok:status<400,status,headers:new Headers(usage===null?{}:{'X-Browser-Ms-Used':usage}),json:async()=>value});
const config=(fetchImpl,state=createRenderState())=>({cfAccountId:account,cfToken:token,fetchImpl,state});
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve()};
function clock(t){t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.UTC(2026,10,23,12)});return createRenderState({monotonic:()=>Date.now()})}

test('CF wire uses the admitted URL, one body selector, query cacheTTL, resource exclusions and no target credentials',async()=>{
 const calls=[],render=createRemoteRenderer(config(async(url,init)=>{calls.push({url,init});return response()}));
 const budget=createRequestBudget(4000);try{const result=await render({url:'https://user:password@public.example/#fragment',initialWords:3,budget});assert.equal(result.words,300);assert.equal(result.extraWords,297);assert.equal(result.measurement.browserMsUsed,1234);assert.equal(result.measurement.observedDailyBrowserMs,1234);assert.equal(result.measurement.accountTotalKnown,false);assert.equal(result.measurement.counterScope,'process');assert.equal(calls[0].url,`https://api.cloudflare.com/client/v4/accounts/${account}/browser-run/scrape?cacheTTL=0`);const sent=JSON.parse(calls[0].init.body);assert.equal(sent.url,target);assert.deepEqual(sent.elements,[{selector:'body'}]);assert.deepEqual(sent.rejectResourceTypes,['image','media','font']);assert.equal(sent.gotoOptions.waitUntil,'networkidle2');assert.ok(sent.gotoOptions.timeout<=4000);assert.deepEqual(Object.keys(sent).sort(),['elements','gotoOptions','rejectResourceTypes','url']);assert.equal(calls[0].init.headers.authorization,'Bearer '+token);assert.equal(JSON.stringify(result).includes(token),false);assert.equal(JSON.stringify(result).includes('Useful product'),false)}finally{budget.dispose()}
});
test('CF takes precedence only with both inputs; incomplete config preserves the old worker or null',async()=>{
 for(const cf of [{cfAccountId:'',cfToken:''},{cfAccountId:account,cfToken:''},{cfAccountId:'',cfToken:token}]){
  assert.equal(createRemoteRenderer({url:'',token:'',...cf}),null);
  let endpoint;const render=createRemoteRenderer({url:'https://worker.example',token:'old',...cf,fetchImpl:async u=>{endpoint=String(u);return response({words:3,extraWords:1})}});assert.deepEqual(await render({url:target}),{words:3,extraWords:1});assert.equal(endpoint,'https://worker.example/render');
 }
 let called;const render=createRemoteRenderer({...config(async u=>{called=String(u);return response()}),url:'https://worker.example',token:'old'});await render({url:target});assert.match(called,/\/browser-run\/scrape\?cacheTTL=0$/);
});
test('initial HTML with enough words and a short non-app page each skip the provider',async()=>{
 let calls=0;const render=createRemoteRenderer(config(async()=>{calls++;return response()}));
 assert.equal((await render({url:target,initialWords:80})).measurement.reason,'initial-html-sufficient');assert.equal((await render({url:target,initialWords:7,emptyAppShell:false})).measurement.reason,'no-empty-app-shell');assert.equal(calls,0);
});
test('challenge, empty, unavailable and raw secret-bearing errors are unverified and never cached',async()=>{
 for(const [reply,reason]of [[response(payload('Just a moment... checking your browser')),'challenge'],[response(payload('  ')),'empty'],[response({success:false,errors:[{message:token}]},500),'provider-unavailable'],[response({success:true,result:[]}), 'empty']]){
  const state=createRenderState(),render=createRemoteRenderer(config(async()=>reply,state)),result=await render({url:target});assert.equal(result.words,undefined);assert.equal(result.measurement.reason,reason);assert.equal(state.cache.size,0);assert.equal(JSON.stringify(result).includes(token),false);
 }
});
test('positive final-URL cache reuses counts for 24 hours and recalculates the delta',async t=>{
 const state=clock(t);let calls=0;const render=createRemoteRenderer(config(async()=>{calls++;return response()},state));
 await render({url:target,initialWords:1});t.mock.timers.tick(RENDER_CACHE_MS-1);const hit=await render({url:target,initialWords:10});assert.equal(hit.extraWords,290);assert.equal(hit.measurement.cache,'hit');assert.equal(hit.measurement.providerRequests,0);assert.equal(hit.measurement.browserMsUsed,null);assert.equal(calls,1);t.mock.timers.tick(1);await render({url:target});assert.equal(calls,2);assert.equal(state.pending,0);
});
test('documented daily quota 429 stops requests until the next UTC day; rate 429 does not',async t=>{
 const state=clock(t);let calls=0;const render=createRemoteRenderer(config(async()=>{calls++;return calls===1?response({errors:[{message:'Error processing the request: Browser time limit exceeded for today'}]},429):response()},state));
 assert.equal((await render({url:target})).measurement.reason,'daily-quota');assert.equal((await render({url:target+'other'})).measurement.providerRequests,0);assert.equal(calls,1);t.mock.timers.tick(12*60*60*1000);assert.equal((await render({url:target})).measurement.status,'measured');assert.equal(calls,2);assert.equal(state.calls,1);
});
test('ordinary rate 429 stays distinct and the next spaced call is admitted',async t=>{
 const state=clock(t);let calls=0;const render=createRemoteRenderer(config(async()=>{calls++;return calls===1?response({errors:[{message:'Too many requests'}]},429):response()},state));
 assert.equal((await render({url:target})).measurement.reason,'rate-limit');assert.equal(state.dailyStopped,false);t.mock.timers.tick(10000);assert.equal((await render({url:target+'two'})).measurement.status,'measured');assert.equal(calls,2);
});
test('calls serialize and starts remain 10 seconds apart even across independent callers',async t=>{
 const state=clock(t),starts=[];let finish,active=0,max=0;const fetcher=async()=>{starts.push(Date.now());active++;max=Math.max(max,active);if(starts.length===1)await new Promise(r=>{finish=r});active--;return response()};
 const one=createRemoteRenderer(config(fetcher,state)),two=createRemoteRenderer(config(fetcher,state));const a=one({url:target}),b=two({url:target+'two'});await flush();assert.equal(starts.length,1);t.mock.timers.tick(3000);finish();await flush();t.mock.timers.tick(6999);await flush();assert.equal(starts.length,1);t.mock.timers.tick(1);await flush();await Promise.all([a,b]);assert.equal(max,1);assert.equal(starts[1]-starts[0],10000);assert.equal(state.pending,0);
});
test('a canceled queued waiter cannot release a successor past the active request',async t=>{
 const state=clock(t);let finish,calls=0;const fetcher=async()=>{calls++;if(calls===1)await new Promise(r=>{finish=r});return response()};const render=createRemoteRenderer(config(fetcher,state)),ctrl=new AbortController();const a=render({url:target}),b=render({url:target+'two',signal:ctrl.signal}),c=render({url:target+'three'});await flush();ctrl.abort();await b;await flush();assert.equal(calls,1);finish();await flush();t.mock.timers.tick(10000);await flush();await Promise.all([a,c]);assert.equal(calls,2);assert.equal(state.pending,0);
});
test('queued work waits at most 12 seconds with a bounded queue, without clock arithmetic overflow',async t=>{
 const state=clock(t);state.tail=new Promise(()=>{});const render=createRemoteRenderer(config(async()=>{throw Error('must not call')},state));const calls=Array.from({length:5},(_,i)=>render({url:target+i}));await flush();t.mock.timers.tick(12000);await flush();const results=await Promise.all(calls);assert.equal(results.filter(r=>r.measurement.reason==='queue-full').length,1);assert.equal(results.filter(r=>r.measurement.reason==='queue-timeout').length,4);assert.equal(state.pending,0);
});
test('provider ignoring abort is bounded by the original total deadline and leaves no waiter',async t=>{
 const state=clock(t),render=createRemoteRenderer({...config(async()=>new Promise(()=>{}),state),timeoutMs:30000}),budget=createRequestBudget(TOTAL_MS);const pending=render({url:target,signal:budget.signal,budget});await flush();t.mock.timers.tick(TOTAL_MS);await flush();const result=await pending;assert.equal(result.measurement.reason,'deadline');assert.equal(result.words,undefined);assert.equal(state.pending,0);budget.dispose();
});
test('unknown usage headers remain null, not fabricated zero usage',async()=>{
 for(const usage of [null,'NaN','-2','Infinity']){const result=await createRemoteRenderer(config(async()=>response(payload(text),200,usage)))({url:target});assert.equal(result.measurement.browserMsUsed,null)}
});
const thin='<!doctype html><html><head><script defer src="/app.js"></script></head><body><div id="root"></div></body></html>';
const page=(body,url)=>({ok:true,status:200,body,finalUrl:url,headers:{},contentType:'text/html',redirects:[]});
test('normal thin-app caller compares script text and exposes safe receiving metadata',async()=>{
 const render=createRemoteRenderer(config(async()=>response()));const report=await runFreeCheck(target,{renderer:render,cruxKey:null,fetcher:async u=>page(thin,u)});const rendered=report.checks.find(r=>r.id==='rendered');assert.equal(rendered.status,'problem');assert.equal(report.measurements.rendered.providerRequests,1);assert.equal(report.measurements.rendered.browserMsUsed,1234);assert.equal(JSON.stringify(report).includes(token),false);assert.equal(JSON.stringify(report).includes('Useful product information'),false);
});
test('normal provider failure stays Not verified, with no invented rendered Problem',async()=>{
 const render=createRemoteRenderer(config(async()=>response({errors:[{message:token}]},500)));const report=await runFreeCheck(target,{renderer:render,cruxKey:null,fetcher:async u=>page(thin,u)});assert.equal(report.checks.find(r=>r.id==='rendered').status,'unknown');assert.equal(report.measurements.rendered.reason,'provider-unavailable');assert.equal(JSON.stringify(report).includes(token),false);
});
test('normal caller DNS-private admission makes zero CF requests',async()=>{
 let cfCalls=0;const render=createRemoteRenderer(config(async()=>{cfCalls++;return response()}));setTransportForTests(async()=>{throw Error('private DNS must never reach transport')});try{const report=await runFreeCheck('https://private.example/',{renderer:render,cruxKey:null,lookup:async()=>[{address:'10.0.0.1',family:4}]});assert.equal(report.checks.find(r=>r.id==='rendered').status,'unknown');assert.equal(cfCalls,0)}finally{setTransportForTests()}
});

test('inline script-only shells and short static pages use distinct normal-caller paths', async () => {
  let calls = 0;
  const shell = thin.replace('<script defer src="/app.js"></script>', '<script>document.querySelector("#root").textContent="Loaded"</script>');
  const report = await runFreeCheck(target, { renderer: createRemoteRenderer(config(async () => { calls++; return response(); })), cruxKey: null, fetcher: async u => page(shell, u) });
  assert.equal(calls, 1); assert.equal(report.measurements.rendered.status, 'measured');
  const staticReport = await runFreeCheck(target, { renderer: createRemoteRenderer(config(async () => { throw Error('No browser for short static HTML'); })), cruxKey: null, fetcher: async u => page('<html><body><h1>A short real static page</h1></body></html>', u) });
  assert.equal(staticReport.measurements.rendered.reason, 'no-empty-app-shell');
  assert.equal(staticReport.checks.find(r => r.id === 'rendered').status, 'unknown');
});

test('ten-site receiver keeps skips/cache distinct from actual measured provider calls',async()=>{
 const{TARGETS,summarize}=await import('../../../scripts/free-check-v2/receive-rendering.mjs');assert.equal(TARGETS.length,10);assert.ok(TARGETS.includes('https://linear.app/'));assert.ok(TARGETS.includes('https://excalidraw.com/'));
 const result=summarize([{measurement:{providerRequests:1,browserMsUsed:1000}},{measurement:{providerRequests:1,browserMsUsed:3000}},{measurement:{providerRequests:0,cache:'hit'}},{measurement:{providerRequests:0,reason:'initial-html-sufficient'},renderedStatus:'unknown'}]);assert.equal(result.actualProviderRequests,2);assert.equal(result.positiveCacheHits,1);assert.equal(result.htmlSkipped,1);assert.equal(result.medianBrowserMs,2000);assert.equal(result.theoreticalCacheMissChecksFromFull600000Ms,300);assert.equal(result.accountRemainingKnown,false);assert.equal(summarize([]).medianBrowserMs,null);
});

test('ordinary independent factory instances reuse the same account cache in this process',async()=>{
 let calls=0;const options={cfAccountId:'11111111111111111111111111111111',cfToken:token,fetchImpl:async()=>{calls++;return response()}};
 await createRemoteRenderer(options)({url:target});
 const cached=await createRemoteRenderer(options)({url:target,initialWords:5});
 assert.equal(calls,1);assert.equal(cached.measurement.cache,'hit');assert.equal(cached.extraWords,295);
});
