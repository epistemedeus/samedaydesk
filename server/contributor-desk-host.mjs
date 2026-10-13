import express from 'express';
import {createServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createSdsApp} from './app.js';
import {loadContributorDeskAssets} from './lib/contributor-desk-assets.js';

const prefix='/api/neomorphic-contributor-journey';

/** Opt-in dedicated HTTPS host. The ordinary SDS entrypoint and both homepages are untouched. */
export async function createContributorDeskHost({env=process.env,port}={}){
  if(env.CONTRIBUTOR_DESK_HOST_ENABLED!=='1')throw new Error('desk host is disabled');
  if(!['staging','live'].includes(env.CONTRIBUTOR_JOURNEY_MODE))throw new Error('explicit installed profile required');
  if(env.CONTRIBUTOR_JOURNEY_MODE==='live'&&env.CONTRIBUTOR_JOURNEY_PUBLIC_READS==='1')throw new Error('private preparation host requires public reads off');
  const origin=env.CONTRIBUTOR_JOURNEY_MODE==='live'?env.CONTRIBUTOR_JOURNEY_ORIGIN:env.CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN;
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('canonical same-origin HTTPS host required');
  const expected=env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT;
  if(!/^[a-f0-9]{40}$/.test(expected??''))throw new Error('exact runtime/desk source commit required');
  const assets=await loadContributorDeskAssets(expected,{legacyAliases:true});
  const keyFile=env.CONTRIBUTOR_DESK_TLS_KEY_FILE,certFile=env.CONTRIBUTOR_DESK_TLS_CERT_FILE;
  if(!keyFile||!certFile||!path.isAbsolute(keyFile)||!path.isAbsolute(certFile))throw new Error('explicit TLS files required');
  const tls={key:await readFile(keyFile),cert:await readFile(certFile),minVersion:'TLSv1.2'};
  const app=express();app.disable('x-powered-by');
  // This socket is loopback TLS. Unverified forwarded headers cannot widen host/origin authority.
  app.use((req,res,next)=>{
    res.set({'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
      'Referrer-Policy':'same-origin'});
    if(req.headers.host!==url.host){res.status(421).end();return;}
    next();
  });
  const sds=createSdsApp({neomorphicContributorJourney:{env:{...env,CONTRIBUTOR_DESK_MANAGED_ENABLED:'0'}},neomorphicOpportunity:{env:{}},correspondence:{env:{}},hostedUsefulJourney:{env:{}},managedWatch:{env:{}}});
  const mount=sds.get('neoContributorJourney');
  try{
    await mount.ready();
    if(mount.state.status!=='ready')throw new Error('installed producer not ready');
    // Exact API passes through the SAME SDS mount. Other merchant/customer routes are not exposed by this runner.
    app.use(prefix,(req,res,next)=>{req.url=prefix+req.url;sds(req,res,next);});
    app.use(assets.router);
    app.use((_req,res)=>res.sendStatus(404));
    app.use((_err,_req,res,_next)=>res.sendStatus(404));
    const server=createServer(tls,app);
    server.headersTimeout=15000;server.requestTimeout=20000;
    const selected=port??Number(env.CONTRIBUTOR_DESK_PORT??(url.port||443));
    if(!Number.isInteger(selected)||selected<1||selected>65535)throw new Error('bounded TLS port required');
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(selected,'127.0.0.1',resolve);});
    return {app,server,mount,sourceCommit:expected,origin,close:async()=>{
      server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      for(const name of ['neoContributorJourney','s51Correspondence','neoOpportunity','s346HostedUsefulJourney','l12ManagedWatch'])await sds.get(name)?.close?.();
    }};
  }catch(error){for(const name of ['neoContributorJourney','s51Correspondence','neoOpportunity','s346HostedUsefulJourney','l12ManagedWatch'])await sds.get(name)?.close?.();throw error;}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    const host=await createContributorDeskHost();
    process.stdout.write(JSON.stringify({ready:true,profile:process.env.CONTRIBUTOR_JOURNEY_MODE,sourceCommit:host.sourceCommit,
      https:true,sameOrigin:true,publicEnabled:false,releaseAccepted:false})+'\n');
    let closing=false;
    const close=()=>{if(closing)return;closing=true;host.close().then(()=>process.exit(0),()=>process.exit(1));};
    process.on('SIGTERM',close);process.on('SIGINT',close);
  }catch{process.stderr.write('private contributor desk host refused; verify profile, artifact, TLS and enrollment\n');process.exitCode=1;}
}
