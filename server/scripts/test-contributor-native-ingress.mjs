import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer,request} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createContributorIngress} from '../lib/contributor-native-ingress.js';

const nonce='owner_QA_opaque_native_probe_nonce_229500';
const env=()=>({CONTRIBUTOR_JOURNEY_MODE:'disabled',CONTRIBUTOR_DESK_MANAGED_ENABLED:'0',CONTRIBUTOR_JOURNEY_PUBLIC_READS:'0',
  CONTRIBUTOR_JOURNEY_ORIGIN:'https://desk.invalid',CONTRIBUTOR_DESK_NATIVE_PROBE:'1',CONTRIBUTOR_DESK_NATIVE_PROBE_NONCE:nonce,
  CONTRIBUTOR_DESK_NATIVE_PROBE_EXPIRES:new Date(Date.now()+120000).toISOString()});
async function replay(config,run,{unix=false}={}){
  const directory=await mkdtemp(path.join(tmpdir(),'sds-native-probe-')),ingress=createContributorIngress(config),logs=[];
  const original=console.log;console.log=(...args)=>{logs.push(args.join(' '));};
  let lastAuthority=false;
  const server=createServer((req,res)=>{
    req.originalUrl=req.url;lastAuthority=ingress.passengerRequest(req);ingress.observeProbe(req);
    res.setHeader('Content-Type','application/json');res.end('{"ok":true}');
  });
  try{
    assert.equal(ingress.bindListener({address:()=>'/fabricated.sock'}),false);
    await new Promise((resolve,reject)=>{server.once('error',reject);unix?server.listen(path.join(directory,'node.sock'),resolve):server.listen(0,'127.0.0.1',resolve);});
    assert.equal(ingress.bindListener(server),true);
    const call=(headers={},url='/api/health',method='GET')=>new Promise((resolve,reject)=>{
      const req=request({...unix?{socketPath:server.address()}:{host:'127.0.0.1',port:server.address().port},
        path:url,method,headers:{host:'desk.invalid',connection:'close',...headers},agent:false},res=>{
        let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>{assert.equal(body,'{"ok":true}');resolve(res.statusCode);});
      });req.on('error',reject);req.end();
    });
    const receipts=()=>logs.map(line=>{
      const entry=JSON.parse(line);assert.deepEqual(Object.keys(entry),['timestamp','level','message']);
      assert.equal(new Date(entry.timestamp).toISOString(),entry.timestamp);assert.equal(entry.level,'INFO');
      assert.ok(entry.message.startsWith('contributor_native_ingress_probe '));return JSON.parse(entry.message.slice('contributor_native_ingress_probe '.length));
    });
    await run({call,receipts,authority:()=>lastAuthority,ingress,logs});
  }finally{
    ingress.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    console.log=original;await rm(directory,{recursive:true,force:true});
  }
}

test('private health probe records finite actual TCP facts without a response echo or raw authority',async()=>{
  await replay(env(),async f=>{
    await f.call();await f.call({'x-contributor-native-probe':'wrong'});assert.equal(f.receipts().length,0);
    await f.call({'x-contributor-native-probe':nonce,'!~passenger-proto':'https',cookie:'DO_NOT_LOG',authorization:'DO_NOT_LOG','x-forwarded-for':'DO_NOT_LOG'});
    assert.deepEqual(f.receipts(),[{schema:'sds.contributor-native-ingress-probe.v1',controllerNonceSha256:createHash('sha256').update(nonce).digest('hex'),
      runtime:'node',listener:'tcp-selected',secureProtocolHeaderCount:1,secureProtocol:'https',hostMatches:true}]);
    assert.equal(f.authority(),false,'one secure-looking TCP header is not provider authority');
    assert.ok(!f.logs.join('').includes('DO_NOT_LOG'));assert.ok(!f.logs.join('').includes(nonce));
    await f.call({'x-contributor-native-probe':nonce});assert.equal(f.receipts().length,1);
  });
});

test('a real Unix listener and fabricated global cannot establish native Passenger authority',async()=>{
  const previous=globalThis.PhusionPassenger;
  globalThis.PhusionPassenger={configure(){},_appInstalled:true,options:{socket_path:'/invented.sock'}};
  try{await replay(env(),async f=>{
    await f.call({'x-contributor-native-probe':nonce,'!~passenger-proto':'https','x-forwarded-proto':'https'});
    assert.equal(f.authority(),false);assert.equal(f.receipts()[0].runtime,'passenger-hook-unqualified');assert.equal(f.receipts()[0].listener,'unix-selected');
  },{unix:true});}finally{previous===undefined?delete globalThis.PhusionPassenger:globalThis.PhusionPassenger=previous;}
});

test('probe refuses invalid/expired scope and never promotes a serving profile',async()=>{
  for(const override of [{CONTRIBUTOR_DESK_NATIVE_PROBE:'0'},{CONTRIBUTOR_JOURNEY_MODE:'live'},{CONTRIBUTOR_DESK_MANAGED_ENABLED:'1'},
    {CONTRIBUTOR_JOURNEY_PUBLIC_READS:'1'},{CONTRIBUTOR_DESK_NATIVE_PROBE_NONCE:'short'},
    {CONTRIBUTOR_DESK_NATIVE_PROBE_EXPIRES:new Date(Date.now()-1000).toISOString()},
    {CONTRIBUTOR_DESK_NATIVE_PROBE_EXPIRES:new Date(Date.now()+3600000).toISOString()},
    {CONTRIBUTOR_JOURNEY_ORIGIN:'http://desk.invalid'},{CONTRIBUTOR_JOURNEY_ORIGIN:'https://desk.invalid/path'}]){
    await replay({...env(),...override},async f=>{await f.call({'x-contributor-native-probe':nonce});assert.equal(f.receipts().length,0);assert.equal(f.authority(),false);});
  }
});

test('exact method/path/nonce matching and malformed Host/secure protocol have bounded negative output',async()=>{
  await replay(env(),async f=>{
    const headers={'x-contributor-native-probe':nonce};
    await f.call(headers,'/api/health?x=1');await f.call(headers,'/api/health','POST');
    await f.call({'x-contributor-native-probe':[nonce,nonce]});assert.equal(f.receipts().length,0);
    await f.call({...headers,host:'foreign.invalid','!~passenger-proto':['https','https','http']});
    assert.equal(f.receipts()[0].hostMatches,false);assert.equal(f.receipts()[0].secureProtocolHeaderCount,2);
    assert.equal(f.receipts()[0].secureProtocol,'duplicate');assert.ok(!f.logs.join('').includes('foreign.invalid'));
  });
  for(const [value,expected] of [[undefined,'missing'],['http','http'],['https,http','other']])await replay(env(),async f=>{
    await f.call({'x-contributor-native-probe':nonce,...value===undefined?{}:{'!~passenger-proto':value}});
    assert.equal(f.receipts()[0].secureProtocol,expected);
  });
});

test('closing the probe restores normal harmless health behavior',async()=>{
  await replay(env(),async f=>{f.ingress.close();assert.equal(await f.call({'x-contributor-native-probe':nonce}),200);assert.equal(f.receipts().length,0);});
});

test('v2 receives the observed Unix/node/missing-native-marker negative without treating standard claims as authority',async()=>{
  await replay({...env(),CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION:'2'},async f=>{
    await f.call({'x-contributor-native-probe':nonce,origin:'https://desk.invalid','x-forwarded-proto':'https',
      forwarded:'for=DO_NOT_LOG;proto=https;host=DO_NOT_LOG',cookie:'DO_NOT_LOG','x-real-ip':'DO_NOT_LOG'});
    const r=f.receipts()[0];assert.equal(r.schema,'sds.contributor-native-ingress-probe.v2');assert.equal(r.runtime,'node');
    assert.equal(r.listener,'unix-selected');assert.equal(r.secureProtocolHeaderCount,0);assert.equal(r.secureProtocol,'missing');assert.equal(r.hostMatches,true);
    assert.deepEqual(r.observation.selectedServer,{bound:true,requestMatches:true,physicalAddressKind:'unix',nativeHandleKind:'pipe'});
    assert.equal(r.observation.authorityAccepted,false);assert.equal(f.authority(),false);
    assert.deepEqual(r.observation.indicators.xForwardedProto,{headerCount:1,protocol:'https'});
    assert.deepEqual(r.observation.indicators.forwarded,{headerCount:1,protocolCount:1,protocol:'https'});
    assert.deepEqual(r.observation.origin,{configuredHttps:true,headerPresent:true,headerMatches:true});
    assert.match(r.observation.hooks.listenFunctionSha256,/^[a-f0-9]{64}$/);
    assert.ok(!f.logs.join('').includes('DO_NOT_LOG'));
    assert.ok(!f.logs.join('').includes('/tmp/'));assert.ok(!f.logs.join('').includes('desk.invalid'));
    await f.call({'x-contributor-native-probe':nonce});assert.equal(f.receipts().length,1);
  },{unix:true});
});

test('v2 protocol observations retain duplicate/malformed/ordinary claims as non-authoritative enums',async()=>{
  const cases=[
    {headers:{'x-forwarded-proto':['https','https']},xfp:{headerCount:2,protocol:'duplicate'}},
    {headers:{'x-forwarded-proto':'http, https'},xfp:{headerCount:1,protocol:'mixed'}},
    {headers:{'x-forwarded-proto':'https, https'},xfp:{headerCount:1,protocol:'https-list'}},
    {headers:{'x-forwarded-proto':'https, DO_NOT_LOG'},xfp:{headerCount:1,protocol:'malformed'}},
    {headers:{'x-forwarded-proto':'DO_NOT_LOG'},xfp:{headerCount:1,protocol:'other'}},
  ];
  for(const c of cases)await replay({...env(),CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION:'2'},async f=>{
    await f.call({'x-contributor-native-probe':nonce,...c.headers,'!~passenger-proto':'https',
      'x-forwarded-ssl':['on','off'],'front-end-https':'off',origin:'https://foreign.invalid'});
    const r=f.receipts()[0];assert.deepEqual(r.observation.indicators.xForwardedProto,c.xfp);
    assert.deepEqual(r.observation.indicators.xForwardedSsl,{headerCount:2,protocol:'duplicate'});
    assert.deepEqual(r.observation.indicators.frontEndHttps,{headerCount:1,protocol:'http'});
    assert.equal(r.observation.origin.headerMatches,false);assert.equal(r.observation.authorityAccepted,false);assert.equal(f.authority(),false);
    assert.ok(!f.logs.join('').includes('DO_NOT_LOG'));assert.ok(!f.logs.join('').includes('foreign.invalid'));
  });
  for(const [value,expected] of [['for="DO_NOT_LOG;proto=https";proto=http',{headerCount:1,protocolCount:1,protocol:'http'}],
    ['for=DO_NOT_LOG;proto="https"',{headerCount:1,protocolCount:1,protocol:'https'}],
    ['for="DO_NOT_LOG;proto=https',{headerCount:1,protocolCount:0,protocol:'malformed'}]]){
    await replay({...env(),CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION:'2'},async f=>{
      await f.call({'x-contributor-native-probe':nonce,forwarded:value});
      assert.deepEqual(f.receipts()[0].observation.indicators.forwarded,expected);assert.ok(!f.logs.join('').includes('DO_NOT_LOG'));
    });
  }
});

test('v2 requires all explicit off flags and refuses unknown diagnostic versions',async()=>{
  for(const override of [{CONTRIBUTOR_JOURNEY_PUBLIC_READS:undefined},{CONTRIBUTOR_DESK_MANAGED_ENABLED:undefined},
    {CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION:'3'}])await replay({...env(),CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION:'2',...override},async f=>{
    await f.call({'x-contributor-native-probe':nonce});assert.equal(f.receipts().length,0);
  });
});

test('v2 fabricated helper globals and fingerprints cannot change the selected native admission',async()=>{
  const old=globalThis.LsNode;globalThis.LsNode={listenDone:true,options:{HTTPS:'on'}};
  try{await replay({...env(),CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION:'2'},async f=>{
    await f.call({'x-contributor-native-probe':nonce,'!~passenger-proto':'https','x-forwarded-proto':'https'});
    const r=f.receipts()[0];assert.equal(r.observation.loader.litespeedGlobalPresent,true);
    assert.equal(r.observation.authorityAccepted,false);assert.equal(f.authority(),false);assert.equal(r.runtime,'node');
  },{unix:true});}finally{old===undefined?delete globalThis.LsNode:globalThis.LsNode=old;}
});
