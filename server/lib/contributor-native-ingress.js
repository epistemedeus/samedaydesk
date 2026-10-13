import {Server as HttpServer,IncomingMessage} from 'node:http';
import {Server as NetServer,Socket} from 'node:net';
import {createRequire} from 'node:module';
import {readFileSync,statSync} from 'node:fs';
import {createHash,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {observeContributorHost} from './contributor-host-observation.js';

const require=createRequire(import.meta.url);
// Audited unchanged upstream Node hook, not a generated provider attestation.
// https://github.com/phusion/passenger/blob/c2fde75b26ced690978167e882d3da440188591f/src/helper-scripts/node-loader.js
const PASSENGER_LOADER_SHA256='8fa9ce29cc2b098d03d16027d8f923f10e1d78c26727b5b248138d093acb02d8';
export const rawHeaderValues=(req,name)=>{
  const values=[];
  for(let i=0;i<req.rawHeaders.length;i+=2)if(req.rawHeaders[i].toLowerCase()===name)values.push(req.rawHeaders[i+1]);
  return values;
};
export function secureProtocol(req){
  const values=rawHeaderValues(req,'!~passenger-proto');
  return {count:Math.min(values.length,2),protocol:values.length===0?'missing':values.length>1?'duplicate':
    values[0]==='https'?'https':values[0]==='http'?'http':'other'};
}

/** Evidence is tied to the single real entrypoint listener and native request.
 * A flag, global object, IP getter or secure-looking header is insufficient.
 * Passenger requires its audited hook. LiteSpeed requires a separately received
 * deployment qualification; its loader hash identifies that deployment, never
 * proves TLS. Neither establishes external provider filtering by itself. */
export function createContributorIngress(env){
  let listener=null,closed=false,loader=null,shutdown=null,passengerExit=null;
  function bindPassengerExit(){
    if(!shutdown||closed||passengerExit||runtime()!=='passenger-native-hook')return;
    const passenger=globalThis.PhusionPassenger,exit=()=>{void shutdown();};
    passenger.once('exit',exit);passengerExit={passenger,exit};
  }
  const bindListener=server=>{
    if(closed||!(server instanceof HttpServer)||listener&&listener!==server)return false;
    listener=server;
    server.once('listening',bindPassengerExit);return true;
  };
  const bindLifecycle=close=>{if(!closed&&typeof close==='function'){shutdown=close;bindPassengerExit();}};
  function runtime(){
    const passenger=globalThis.PhusionPassenger;
    if(!passenger)return 'node';
    const main=process.mainModule;
    if(!main?.loaded||main.isApplicationLoader!==true||path.basename(main.filename??'')!=='node-loader.js'||
        require.cache[main.filename]!==main||main.exports?.PhusionPassenger!==passenger)
      return 'passenger-hook-unqualified';
    if(loader!==main){
      try{
        const stat=statSync(main.filename);
        if(!stat.isFile()||stat.size>64*1024||createHash('sha256').update(readFileSync(main.filename)).digest('hex')!==PASSENGER_LOADER_SHA256)
          return 'passenger-hook-unqualified';
        loader=main;
      }catch{return 'passenger-hook-unqualified';}
    }
    if(!(listener instanceof HttpServer)||passenger._appInstalled!==true||passenger._server!==listener||
        typeof passenger.configure!=='function'||typeof HttpServer.prototype.listen!=='function'||
        listener.listen!==HttpServer.prototype.listen||listener.originalListen!==NetServer.prototype.listen)
      return 'passenger-hook-unqualified';
    const address=listener.address();
    return typeof address==='string'&&path.isAbsolute(address)&&passenger.options?.socket_path===address
      ?'passenger-native-hook':'passenger-hook-unqualified';
  }
  function listenerKind(req){
    if(closed||!listener?.listening)return 'unbound';
    if(!(req instanceof IncomingMessage)||!(req.socket instanceof Socket)||req.socket.server!==listener)return 'unmatched';
    const address=listener.address();
    return typeof address==='string'&&path.isAbsolute(address)?'unix-selected':address&&typeof address==='object'?'tcp-selected':'unbound';
  }
  const passengerRequest=req=>runtime()==='passenger-native-hook'&&listenerKind(req)==='unix-selected'&&!req.socket.encrypted;
  const tcpRequest=req=>listenerKind(req)==='tcp-selected';
  function litespeedRequest(req,expectedLoaderSha256){
    if(closed||!listener?.listening||!(req instanceof IncomingMessage)||!(req.socket instanceof Socket)||
        req.socket.server!==listener||req.socket.encrypted||globalThis.PhusionPassenger!==undefined||
        !(globalThis.LsNode instanceof EventEmitter)||! /^[a-f0-9]{64}$/.test(expectedLoaderSha256??''))return false;
    const main=process.mainModule;
    if(!main?.loaded||main.id!=='.'||main.parent!==null||main.isApplicationLoader!==true||
        path.basename(main.filename??'')!=='lsnode.js'||require.cache[main.filename]!==main||
        listener.listen!==HttpServer.prototype.listen||listener.listen===NetServer.prototype.listen||
        listener.realListen!==NetServer.prototype.listen)return false;
    try{
      const stat=statSync(main.filename);
      if(!stat.isFile()||stat.size>64*1024||createHash('sha256').update(readFileSync(main.filename)).digest('hex')!==expectedLoaderSha256)return false;
      // address() may be patched by the loader. The actual handle must be a pipe,
      // never a TCP listener hidden behind a Unix-looking address getter. An
      // inherited Unix descriptor can have no visible physical address in Node.
      const physical=NetServer.prototype.address.call(listener);
      return req.socket._handle?.constructor?.name==='Pipe'&&listener._handle?.constructor?.name==='Pipe'&&
        !(physical&&typeof physical==='object'&&['IPv4','IPv6'].includes(physical.family))&&listenerKind(req)==='unix-selected';
    }catch{return false;}
  }

  // One matching harmless health request per process, with an absolute <=10min
  // expiry. No response data, endpoint, timer, environment dump or raw headers.
  let probe=null,consumed=false;
  if(env.CONTRIBUTOR_DESK_NATIVE_PROBE==='1'&&env.CONTRIBUTOR_JOURNEY_MODE==='disabled'&&
      env.CONTRIBUTOR_DESK_MANAGED_ENABLED!=='1'&&env.CONTRIBUTOR_JOURNEY_PUBLIC_READS!=='1'){
    try{
      const nonce=env.CONTRIBUTOR_DESK_NATIVE_PROBE_NONCE,expiry=Date.parse(env.CONTRIBUTOR_DESK_NATIVE_PROBE_EXPIRES);
      const origin=env.CONTRIBUTOR_JOURNEY_ORIGIN,url=new URL(origin);
      const version=env.CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION??'1';
      if(/^[A-Za-z0-9_-]{32,128}$/.test(nonce??'')&&url.protocol==='https:'&&url.origin===origin&&
          !url.username&&!url.password&&Number.isFinite(expiry)&&expiry>Date.now()&&expiry-Date.now()<=600000&&
          ['1','2'].includes(version)&&(version!=='2'||env.CONTRIBUTOR_DESK_MANAGED_ENABLED==='0'&&env.CONTRIBUTOR_JOURNEY_PUBLIC_READS==='0')){
        probe={nonce:Buffer.from(nonce),expiry,host:url.host,origin,version,digest:createHash('sha256').update(nonce).digest('hex')};
      }
    }catch{}
  }
  function observeProbe(req){
    if(closed||!probe||consumed||Date.now()>=probe.expiry||req.method!=='GET'||req.originalUrl!=='/api/health')return;
    const values=rawHeaderValues(req,'x-contributor-native-probe');
    if(values.length!==1||typeof values[0]!=='string'||Buffer.byteLength(values[0])!==probe.nonce.length||
        !timingSafeEqual(Buffer.from(values[0]),probe.nonce))return;
    consumed=true;
    const secure=secureProtocol(req),hosts=rawHeaderValues(req,'host');
    const receipt={schema:'sds.contributor-native-ingress-probe.v1',
      controllerNonceSha256:probe.digest,runtime:runtime(),listener:listenerKind(req),
      secureProtocolHeaderCount:secure.count,secureProtocol:secure.protocol,hostMatches:hosts.length===1&&hosts[0]===probe.host};
    if(probe.version==='2'){
      receipt.schema='sds.contributor-native-ingress-probe.v2';
      receipt.observation=observeContributorHost({listener,req,headerValues:rawHeaderValues,origin:probe.origin});
    }
    // Hostinger's authenticated runtime-log reader requires these three JSON
    // envelope fields; a plain console prefix is skipped by that reader.
    console.log(JSON.stringify({timestamp:new Date().toISOString(),level:'INFO',message:'contributor_native_ingress_probe '+JSON.stringify(receipt)}));
    probe=null;
  }
  return Object.freeze({bindListener,bindLifecycle,passengerRequest,tcpRequest,litespeedRequest,observeProbe,close:()=>{
    closed=true;probe=null;
    if(passengerExit)passengerExit.passenger.removeListener('exit',passengerExit.exit);
    passengerExit=null;shutdown=null;listener=null;loader=null;
  }});
}
