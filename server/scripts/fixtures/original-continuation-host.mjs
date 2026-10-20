import express from 'express';
import {createServer,request as httpsRequest} from 'node:https';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createSdsApp} from '../../app.js';
import {mountNeomorphicOriginalContinuation} from '../../lib/neomorphic-original-continuation-mount.js';

/** Synthetic configuration + verified loopback TLS. All account/original authority and records are actual installed PG services. */
export async function originalContinuationHost(settings){
  const ca=await readFile(settings.certFile);
  let drop=null;
  const sends=[];
  const transport=async(url,options={})=>new Promise((resolve,reject)=>{
    const req=httpsRequest(url,{method:options.method??'GET',headers:options.headers,ca,signal:options.signal},res=>{
      const chunks=[];res.on('error',reject);res.on('aborted',()=>reject(new Error('canonical response aborted')));
      res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });req.on('error',reject);req.end(options.body);
  });
  const producer=settings.entry?()=>import(pathToFileURL(settings.entry).href):undefined;
  const sds=createSdsApp({neomorphicContributorJourney:{env:settings.env,loadService:producer},neomorphicOpportunity:{env:settings.originalEnv},
    correspondence:{env:{}},hostedUsefulJourney:{env:{}},managedWatch:{env:{}}});
  const journey=sds.get('neoContributorJourney'),original=sds.get('neoOpportunity');
  await journey.ready();await original.ready();
  if(journey.state.status!=='ready'||original.state.status!=='ready'){
    await journey.close();await original.close();throw new Error('installed stores unavailable');
  }
  const outer=express();outer.disable('x-powered-by');
  const bridge=mountNeomorphicOriginalContinuation(outer,{enabled:true,journey,canonicalOrigin:settings.origin,roundKey:settings.roundKey,
    provenance:'fixture',request:transport,loadService:producer});
  await bridge.ready();if(bridge.state.status!=='ready'){await journey.close();await original.close();throw new Error('continuation unavailable');}
  outer.use(sds);
  const server=createServer({key:await readFile(settings.keyFile),cert:ca},(req,res)=>{
    const canonicalWrite=req.url?.startsWith('/api/neomorphic-opportunity/')&&req.method==='POST'&&req.url.endsWith('/continuation/submissions');
    if(canonicalWrite){sends.push({path:req.url,key:req.headers['idempotency-key']});
      if(drop==='before'){drop=null;res.destroy();return;}
      if(drop==='after'){drop=null;res.end=()=>{res.flushHeaders();res.write('{');setImmediate(()=>res.destroy());return res;};}
      if(drop==='refusal-after'){drop=null;const finish=res.end;res.end=function(...args){res.statusCode=409;return finish.apply(this,args);};}
      if(drop==='revoke-after'){
        drop=null;const finish=res.end,hash=createHash('sha256').update(String(req.headers.authorization).slice(7)).digest('hex');
        res.end=function(...args){
          original.state.store.withOpportunityClient(async client=>{await client.query('UPDATE earned_work_contributor_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=$1',[hash]);},'none')
            .then(()=>{res.statusCode=401;finish.apply(this,args);},()=>res.destroy());
          return res;
        };
      }
    }
    outer(req,res);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(settings.port,'127.0.0.1',resolve);});
  return {runtime:journey.state.runtime,original,sends,bridge,dropNext:kind=>{drop=kind;},close:async()=>{
    server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await bridge.close();for(const name of ['neoContributorJourney','s51Correspondence','neoOpportunity','s346HostedUsefulJourney','l12ManagedWatch'])await sds.get(name)?.close?.();
  }};
}
if(process.argv[2]){
  const host=await originalContinuationHost(JSON.parse(await readFile(process.argv[2],'utf8')));
  process.stdout.write(JSON.stringify({ready:true,pid:process.pid,compiled:true,syntheticOnly:true})+'\n');let closing=false;
  process.on('SIGTERM',()=>{if(closing)return;closing=true;host.close().then(()=>process.exit(0),()=>process.exit(1));});
}
