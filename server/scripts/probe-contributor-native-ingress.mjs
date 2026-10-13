import {request} from 'node:https';
import {createHash} from 'node:crypto';

// Exactly one certificate-verified harmless request. This reads no credentials,
// sends no cookie/body, follows no redirect and never updates the provider.
try{
  const env=process.env,nonce=env.CONTRIBUTOR_DESK_NATIVE_PROBE_NONCE,url=new URL(env.CONTRIBUTOR_JOURNEY_ORIGIN);
  const expiry=Date.parse(env.CONTRIBUTOR_DESK_NATIVE_PROBE_EXPIRES);
  if(env.CONTRIBUTOR_JOURNEY_MODE!=='disabled'||env.CONTRIBUTOR_DESK_MANAGED_ENABLED!=='0'||env.CONTRIBUTOR_JOURNEY_PUBLIC_READS!=='0'||
      env.CONTRIBUTOR_DESK_NATIVE_PROBE!=='1'||! /^[A-Za-z0-9_-]{32,128}$/.test(nonce??'')||
      url.protocol!=='https:'||url.origin!==env.CONTRIBUTOR_JOURNEY_ORIGIN||url.username||url.password||
      !Number.isFinite(expiry)||expiry<=Date.now()||expiry-Date.now()>600000)throw new Error('probe scope refused');
  const ok=await new Promise((resolve,reject)=>{
    const req=request(new URL('/api/health',url),{method:'GET',headers:{'x-contributor-native-probe':nonce,connection:'close'},
      rejectUnauthorized:true,agent:false,timeout:8000},res=>{
      let bytes=0,body='';res.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192)req.destroy(new Error('bounded health response'));else body+=chunk;});
      res.on('error',reject);res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{reject(new Error('health JSON refused'));}});
    });
    const deadline=setTimeout(()=>req.destroy(new Error('bounded probe deadline')),10000);
    req.once('close',()=>clearTimeout(deadline));req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('probe timeout')));req.end();
  });
  if(!ok)throw new Error('health request refused');
  console.log(JSON.stringify({schema:'sds.contributor-native-probe-request.v1',
    controllerNonceSha256:createHash('sha256').update(nonce).digest('hex'),certificateVerified:true,healthOk:true,
    nativeIngressAccepted:false,logReadbackRequired:true}));
}catch{
  console.error('contributor native probe request refused; verify disabled scope, exact origin, nonce expiry and trusted certificate');
  process.exitCode=1;
}
