import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyContributorArtifact,verifyContributorRuntime} from './contributor-artifact.js';

export const DESK_PATH='/contribute/';
export const DESK_ASSET_PREFIX='/contribute/_assets';
export const JOURNEY_PREFIX='/api/neomorphic-contributor-journey';
const runtimeRoot=fileURLToPath(new URL('../../vendor/neomorphic-contributor-journey/',import.meta.url));
const deskRoot=fileURLToPath(new URL('../../vendor/neomorphic-contributor-desk/',import.meta.url));

/** Verified immutable resource bytes shared by the managed ingress and TLS receiver. */
export async function loadContributorDeskAssets(expectedCommit,{legacyAliases=false}={}){
  if(!/^[a-f0-9]{40}$/.test(expectedCommit??''))throw new Error('exact source required');
  await verifyContributorRuntime(runtimeRoot,expectedCommit);
  const manifest=await verifyContributorArtifact(deskRoot,'neomorphic.contributor-desk.assets.v1',expectedCommit);
  if(manifest.apiPath!==JOURNEY_PREFIX||manifest.previewOnly!==true||manifest.publicEnabled!==false||
      manifest.placement?.schema!=='neomorphic.contributor-desk.placement.v1'||
      manifest.placement.deskPath!==DESK_PATH||manifest.placement.assetPrefix!==DESK_ASSET_PREFIX)
    throw new Error('exact private desk placement required');
  const members=new Map();let total=0;
  for(const entry of manifest.files){
    const page=/^contribute\/(?:[a-z-]+\/)?index\.html$/.test(entry.path);
    const url=page?'/'+entry.path.slice(0,-'index.html'.length):DESK_ASSET_PREFIX+'/'+entry.path;
    if(entry.url!==url||!(/^(?:_astro|styles|fonts)\//.test(entry.path)||
        page||['scripts/office.js','favicon.svg','apple-touch-icon.png'].includes(entry.path)))
      throw new Error('desk resource placement refused');
    total+=entry.bytes;if(total>32*1024*1024)throw new Error('bounded desk assets required');
    const bytes=await readFile(path.join(deskRoot,entry.path));
    // Retain checked bytes, rather than serving a changed file after verification.
    if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)
      throw new Error('desk resource changed');
    const member={bytes,type:path.extname(entry.path)};members.set(url,member);
    // Original loopback receiver compatibility only. Managed ingress never maps
    // these aliases over the SDS root styles, fonts, scripts, bundles or icons.
    if(legacyAliases)members.set('/'+entry.path,member);
  }
  if(!members.has(DESK_PATH))throw new Error('compiled desk absent');
  const router=express.Router();
  router.use((req,res,next)=>{
    let pathname;
    try{pathname=decodeURIComponent(req.path);}catch{res.sendStatus(404);return;}
    if(pathname==='/contribute'&&(req.method==='GET'||req.method==='HEAD')){res.redirect(308,DESK_PATH);return;}
    const member=members.get(pathname);
    if(!member){next();return;}
    if(!['GET','HEAD'].includes(req.method)){res.sendStatus(405);return;}
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'same-origin'});
    res.type(member.type).send(member.bytes);
  });
  return {manifest,router};
}
