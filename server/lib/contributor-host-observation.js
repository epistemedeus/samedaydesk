import {Server as NetServer} from 'node:net';
import {Server as HttpServer} from 'node:http';
import {createRequire} from 'node:module';
import {openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const require=createRequire(import.meta.url),MAX_BYTES=64*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const kind=file=>path.basename(file??'')==='lsnode.js'?'litespeed-helper':
  path.basename(file??'')==='node-loader.js'?'passenger-helper':path.basename(file??'')==='index.js'?'application-entry':file?'other':'absent';
function fingerprint(file){
  if(!file)return {state:'absent',sha256:null};
  let fd;
  try{
    fd=openSync(file,constants.O_RDONLY|constants.O_NONBLOCK);const stat=fstatSync(fd);
    if(!stat.isFile())return {state:'not-regular',sha256:null};
    if(stat.size>MAX_BYTES)return {state:'too-large',sha256:null};
    const bytes=Buffer.alloc(MAX_BYTES+1);let length=0,read;
    do{read=readSync(fd,bytes,length,bytes.length-length,null);length+=read;}while(read&&length<bytes.length);
    return length>MAX_BYTES?{state:'too-large',sha256:null}:{state:'read',sha256:digest(bytes.subarray(0,length))};
  }catch{return {state:'unreadable',sha256:null};}finally{if(fd!==undefined)closeSync(fd);}
}
function functionFingerprint(fn){
  if(typeof fn!=='function')return null;
  const source=Function.prototype.toString.call(fn);return Buffer.byteLength(source)>MAX_BYTES?null:digest(source);
}
const count=n=>Math.min(n,2); // 2 always means multiple, not an exact population.
function protocol(values){
  if(!values.length)return 'missing';if(values.length>1)return 'duplicate';
  const value=values[0];if(value.length>8192)return 'malformed';
  if(value==='https'||value==='http')return value;
  if(value.includes(',')){
    const list=value.split(',').map(x=>x.trim());
    if(list.some(x=>!['https','http'].includes(x)))return 'malformed';
    return new Set(list).size>1?'mixed':list[0]==='https'?'https-list':'http-list';
  }
  return 'other';
}
function forwarded(values){
  if(values.some(value=>value.length>8192))return {headerCount:count(values.length),protocolCount:0,protocol:'malformed'};
  const protocols=[];let malformed=false;
  for(const value of values){
    // Delimiters in quoted for/host values are data, never proto directives.
    const parts=[];let start=0,quoted=false,escaped=false;
    for(let i=0;i<value.length;i++){
      const char=value[i];if(escaped){escaped=false;continue;}
      if(quoted&&char==='\\'){escaped=true;continue;}
      if(char==='"'){quoted=!quoted;continue;}
      if(!quoted&&(char===';'||char===',')){parts.push(value.slice(start,i).trim());start=i+1;}
    }
    parts.push(value.slice(start).trim());if(quoted||escaped)malformed=true;
    for(const part of parts){
      const match=/^([a-z][a-z0-9_-]*)\s*=\s*("(?:[^"\\\r\n]|\\[^\r\n])*"|[a-z0-9!#$%&'*+.^_`|~:-]+)$/i.exec(part);
      if(!match){malformed=true;continue;}
      if(match[1].toLowerCase()==='proto')protocols.push(match[2].startsWith('"')?match[2].slice(1,-1):match[2]);
    }
  }
  const enumValue=protocols.length>1?protocol([protocols.join(',')]):protocol(protocols);
  return {headerCount:count(values.length),protocolCount:count(protocols.length),protocol:malformed?'malformed':values.length>1?'duplicate':enumValue};
}
function ssl(values){
  return {headerCount:count(values.length),protocol:!values.length?'missing':values.length>1?'duplicate':
    values[0]==='on'?'https':values[0]==='off'?'http':'other'};
}

/** Read-only observations, never a new admission predicate. Fingerprints identify
 * source to audit; globals, filename labels and forwarding values are claims.
 * No raw source/path/request/env data is returned. No provider lookup or timer. */
export function observeContributorHost({listener,req,headerValues,origin}){
  const main=process.mainModule;
  const helpers=Object.values(require.cache).filter(module=>['litespeed-helper','passenger-helper'].includes(kind(module?.filename))).slice(0,8);
  let nativeAddress;try{nativeAddress=listener instanceof HttpServer?NetServer.prototype.address.call(listener):null;}catch{}
  const physicalKind=typeof nativeAddress==='string'?'unix':nativeAddress&&['IPv4','IPv6'].includes(nativeAddress.family)?'tcp':'unknown';
  const handle=listener?._handle?.constructor?.name;
  const origins=headerValues(req,'origin');
  return {
    authorityAccepted:false,
    selectedServer:{bound:listener instanceof HttpServer&&listener.listening===true,requestMatches:req.socket.server===listener,
      physicalAddressKind:physicalKind,nativeHandleKind:handle==='Pipe'?'pipe':handle==='TCP'?'tcp':handle?'other':'absent'},
    loader:{mainPresent:!!main,mainLoaded:main?.loaded===true,applicationLoaderMarker:main?.isApplicationLoader===true,
      mainKind:kind(main?.filename),mainContent:fingerprint(main?.filename),
      helpers:helpers.map(module=>({kind:kind(module.filename),loaded:module.loaded===true,content:fingerprint(module.filename)})),
      passengerGlobalPresent:globalThis.PhusionPassenger!==undefined,litespeedGlobalPresent:globalThis.LsNode!==undefined},
    hooks:{listenIsNative:listener?.listen===NetServer.prototype.listen,addressIsNative:listener?.address===NetServer.prototype.address,
      originalListenIsNative:listener?.originalListen===NetServer.prototype.listen,realListenIsNative:listener?.realListen===NetServer.prototype.listen,
      listenFunctionSha256:functionFingerprint(listener?.listen),addressFunctionSha256:functionFingerprint(listener?.address)},
    indicators:{xForwardedProto:{headerCount:count(headerValues(req,'x-forwarded-proto').length),protocol:protocol(headerValues(req,'x-forwarded-proto'))},
      forwarded:forwarded(headerValues(req,'forwarded')),xForwardedSsl:ssl(headerValues(req,'x-forwarded-ssl')),
      frontEndHttps:ssl(headerValues(req,'front-end-https'))},
    origin:{configuredHttps:new URL(origin).protocol==='https:',headerPresent:origins.length>0,headerMatches:origins.length===1&&origins[0]===origin},
  };
}
