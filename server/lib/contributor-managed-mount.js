import express from 'express';
import ipaddr from 'ipaddr.js';
import {mountNeomorphicContributorJourney} from './neomorphic-contributor-journey-mount.js';
import {loadContributorDeskAssets,DESK_PATH,JOURNEY_PREFIX} from './contributor-desk-assets.js';
import {createContributorIngress,secureProtocol} from './contributor-native-ingress.js';
import {loadContributorHttpsQualification} from './contributor-https-qualification.js';

const address=value=>{try{return ipaddr.process(value).toString();}catch{return null;}};
const prefixRequest=req=>req.path==='/contribute'||req.path.startsWith(DESK_PATH)||
  req.path===JOURNEY_PREFIX||req.path.startsWith(JOURNEY_PREFIX+'/');
const once=(req,name)=>req.rawHeaders.filter((_value,index)=>index%2===0&&req.rawHeaders[index].toLowerCase()===name).length<=1;

/** Explicit TCP, audited native TLS marker or qualified TLS-only deployment.
 * Client address stays conservative. Forwarded client values grant no authority. */
function edgeGuard(env,ingress,{directOnly=false,qualification=null}={}){
  if(!['staging','live'].includes(env.CONTRIBUTOR_JOURNEY_MODE)||env.CONTRIBUTOR_JOURNEY_INSTALLED!=='1'||
      !['0','1'].includes(env.CONTRIBUTOR_JOURNEY_PUBLIC_READS??'0')||(env.CONTRIBUTOR_JOURNEY_TRUST_PROXY??'0')!=='0')
    throw new Error('explicit installed managed profile required');
  if(env.CONTRIBUTOR_JOURNEY_PUBLIC_READS==='1'&&(env.CONTRIBUTOR_JOURNEY_MODE!=='live'||
      !/^review_[A-Za-z0-9_.:-]{8,120}$/.test(env.CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF??'')))
    throw new Error('reviewed public read composition required');
  const origin=env.CONTRIBUTOR_JOURNEY_MODE==='live'?env.CONTRIBUTOR_JOURNEY_ORIGIN:env.CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN;
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('exact HTTPS origin required');
  const peers=JSON.parse(env.CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS??'[]');
  const mode=directOnly?'trusted-tcp':env.CONTRIBUTOR_DESK_INGRESS_MODE??'trusted-tcp';
  if(!['trusted-tcp','passenger-native','litespeed-https-only'].includes(mode)||mode==='litespeed-https-only'&&!qualification)
    throw new Error('explicit supported qualified ingress mode required');
  if(!Array.isArray(peers)||mode==='trusted-tcp'&&!directOnly&&!peers.length||mode!=='trusted-tcp'&&peers.length||
      peers.length>16||peers.some(peer=>typeof peer!=='string'||!address(peer))||
      new Set(peers.map(address)).size!==peers.length)throw new Error('explicit concrete proxy IPs required');
  const trusted=new Set(peers.map(address));
  return (req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'same-origin'});
    if(!once(req,'host')||req.headers.host!==url.host){res.status(421).json({error:{code:'host_refused'}});return;}
    if(mode==='litespeed-https-only'){
      if(!qualification.current()){res.status(503).json({error:{code:'https_qualification_unavailable'}});return;}
      // HTTPS is enforced by the independently received deployment before Node,
      // not inferred from a request header or this pipe's local address.
      if(!ingress.litespeedRequest(req,qualification.loaderSha256)){
        res.status(426).json({error:{code:'qualified_unix_edge_required'}});return;
      }
    }else if(mode==='passenger-native'){
      if(!ingress.passengerRequest(req)||secureProtocol(req).protocol!=='https'){
        res.status(426).json({error:{code:'native_https_edge_required'}});return;
      }
    }else{
      if(req.rawHeaders.some((value,index)=>index%2===0&&value.toLowerCase().startsWith('!~'))){
        res.status(400).json({error:{code:'native_header_refused'}});return;
      }
      if(req.headers.forwarded||!once(req,'x-forwarded-host')||req.headers['x-forwarded-host']&&req.headers['x-forwarded-host']!==url.host||
          !once(req,'x-forwarded-proto')||req.headers['x-forwarded-proto']&&req.headers['x-forwarded-proto']!=='https'){
        res.status(400).json({error:{code:'proxy_refused'}});return;
      }
      if(!req.socket.encrypted&&(directOnly||!ingress.tcpRequest(req)||!trusted.has(address(req.socket.remoteAddress))||req.headers['x-forwarded-proto']!=='https')){
        res.status(426).json({error:{code:'https_edge_required'}});return;
      }
    }
    if(!once(req,'origin')||req.headers.origin!==undefined&&req.headers.origin!==origin){res.status(403).json({error:{code:'origin_refused'}});return;}
    // The installed app keeps trustProxy=false. Never reinterpret attacker-supplied
    // forwarding chains or mutate global SDS trust/CORS settings.
    for(const header of ['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-forwarded-ssl','front-end-https','x-real-ip','true-client-ip','cf-connecting-ip',
      ...Object.keys(req.headers).filter(name=>name.startsWith('!~'))])delete req.headers[header];
    next();
  };
}

/** Existing managed Node ingress. Failure is contained to the owned prefixes. */
export function mountContributorManagedDesk(app,options={}){
  const env=options.env||process.env;
  const ingress=createContributorIngress(env);
  app.use((req,_res,next)=>{ingress.observeProbe(req);next();});
  if(env.CONTRIBUTOR_DESK_MANAGED_ENABLED!=='1'){
    // Preserve the existing verified direct-TLS receiving route. A plaintext
    // managed listener cannot expose an installed journey with the edge opt-in off.
    if(['staging','live'].includes(env.CONTRIBUTOR_JOURNEY_MODE)&&env.CONTRIBUTOR_JOURNEY_INSTALLED==='1'){
      let direct;
      try{direct=edgeGuard(env,ingress,{directOnly:true});}catch{}
      app.use(JOURNEY_PREFIX,(req,res,next)=>{
        if(!direct||!req.socket.encrypted){res.status(503).json({error:{code:'managed_ingress_disabled'},publicEnabled:false});return;}
        direct(req,res,next);
      });
    }
    const handle=mountNeomorphicContributorJourney(app,options);
    return {...handle,bindListener:ingress.bindListener,bindLifecycle:ingress.bindLifecycle,close:async()=>{ingress.close();await handle.close();}};
  }
  const state={status:'starting',reason:'starting',runtime:null,inFlight:null,closed:false};
  let journey=null,assets=null,guard=null;
  const unavailable=(_req,res)=>res.status(503).json({error:{code:state.reason},ready:false,publicEnabled:false,releaseAccepted:false});
  const inner=express();inner.disable('x-powered-by');
  state.inFlight=(async()=>{
    try{
      // No alternate service loader, ports, modules or artifact roots in this path.
      if(options.loadService||options.ports||options.modules)throw new Error('actual compiled managed composition required');
      const qualification=env.CONTRIBUTOR_DESK_INGRESS_MODE==='litespeed-https-only'?await loadContributorHttpsQualification(env):null;
      guard=edgeGuard(env,ingress,{qualification});
      assets=await loadContributorDeskAssets(env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT);
      if(state.closed)return;
      // The exact compiled producer remains the only app/service loader.
      // This optional server-owned read port carries no ledger write authority.
      journey=mountNeomorphicContributorJourney(inner,{env,canonicalReceiving:options.canonicalReceiving});await journey.ready();
      if(journey.state.status!=='ready')throw new Error('installed stores unavailable');
      if(state.closed){await journey.close();return;}
      state.runtime=journey.state.runtime;state.status='ready';state.reason='ready';
    }catch{
      await journey?.close();state.runtime=null;state.status='disabled';state.reason='unavailable';
    }
  })().finally(()=>{state.inFlight=null;});
  app.use(async(req,res,next)=>{
    if(!prefixRequest(req)){next();return;}
    if(state.inFlight)await state.inFlight;
    if(state.status!=='ready'){unavailable(req,res);return;}
    guard(req,res,()=>{
      if(req.path===JOURNEY_PREFIX||req.path.startsWith(JOURNEY_PREFIX+'/'))inner(req,res,next);
      else assets.router(req,res,()=>res.sendStatus(404));
    });
  });
  return {state,ready:()=>state.inFlight||Promise.resolve(),bindListener:ingress.bindListener,bindLifecycle:ingress.bindLifecycle,close:async()=>{
    ingress.close();
    state.closed=true;await state.inFlight;await journey?.close();
    state.runtime=null;state.status='disabled';state.reason='disabled';assets=null;
  }};
}
