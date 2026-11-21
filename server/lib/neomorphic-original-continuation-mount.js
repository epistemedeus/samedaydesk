import express from 'express';
import {fileURLToPath} from 'node:url';
import {verifyContributorRuntime} from './contributor-artifact.js';

export const ORIGINAL_CONTINUATION_PREFIX='/api/neomorphic-original-continuation';
const root=new URL('../../vendor/neomorphic-contributor-journey/',import.meta.url);
/** Integration API only. No environment, host, account, credential or store discovery. Default is disabled. */
export function mountNeomorphicOriginalContinuation(app,options={}){
  const state={status:'disabled',reason:'disabled',service:null,closed:false};
  let router=express.Router();router.use((_req,res)=>res.status(503).json({error:{code:'disabled'}}));
  const ready=options.enabled===true?(async()=>{
    await options.journey?.ready?.();
    const runtime=options.journey?.state?.runtime;
    if(options.journey?.state?.status!=='ready'||!runtime?.installed)throw new Error('existing installed account contract required');
    if(runtime.config.mode==='live'&&(options.loadService||options.request))throw new Error('live authority injection refused');
    if(!options.loadService)await verifyContributorRuntime(fileURLToPath(root));
    const producer=options.loadService?await options.loadService():await import(new URL('services/contributor-journey/dist/index.js',root));
    const result=await producer.createInstalledOriginalContinuation(runtime,{enabled:true,canonicalOrigin:options.canonicalOrigin,
      roundKey:options.roundKey,provenance:options.provenance,request:options.request});
    if(!state.closed){router=result.router;state.service=result.service;state.status='ready';state.reason='ready';}
  })().catch(()=>{state.reason='unavailable';}):Promise.resolve();
  app.use(ORIGINAL_CONTINUATION_PREFIX,async(req,res,next)=>{
    res.set({'Cache-Control':'no-store, private','X-Robots-Tag':'noindex, nofollow'});await ready;
    if(state.status!=='ready')return res.status(503).json({error:{code:state.reason}});
    return router(req,res,next);
  });
  return {state,ready:()=>ready,close:async()=>{state.closed=true;await ready;state.service=null;state.status='disabled';state.reason='disabled';}};
}
