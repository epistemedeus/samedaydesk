// Root-only finite post-deploy receiving. Uses the ordinary public checker, never the provider.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequestBudget } from '../../server/lib/agent-readiness/request-budget.js';
export const TARGETS = ['https://linear.app/', 'https://excalidraw.com/', 'https://stripe.com/',
  'https://vercel.com/', 'https://samedaydesk.com/', 'https://ein.llc/', 'https://neomorphic.io/',
  'https://github.com/', 'https://www.notion.com/', 'https://www.allbirds.com/'];
export function summarize(rows) {
  const measured = rows.flatMap(row => row.measurement?.providerRequests === 1 && Number.isFinite(row.measurement.browserMsUsed) ? [row.measurement.browserMsUsed] : []).sort((a,b)=>a-b);
  const median = measured.length ? (measured[Math.floor((measured.length-1)/2)]+measured[Math.floor(measured.length/2)])/2 : null;
  return { siteChecks: rows.length, actualProviderRequests: rows.reduce((n,r)=>n+(r.measurement?.providerRequests||0),0),
    positiveCacheHits: rows.filter(r=>r.measurement?.cache==='hit').length,
    htmlSkipped: rows.filter(r=>['initial-html-sufficient','no-empty-app-shell'].includes(r.measurement?.reason)).length,
    notVerified: rows.filter(r=>r.renderedStatus==='unknown').length, browserMsSamples: measured.length,
    medianBrowserMs: median, theoreticalCacheMissChecksFromFull600000Ms: median>0 ? Math.floor(600000/median) : null,
    accountRemainingKnown: false, notes: 'Process observations exclude other callers, prior manual calls and restarts. Capacity is an estimate from a full daily allowance, not remaining account quota.' };
}
export async function main(args=process.argv.slice(2)) {
  const value=flag=>args[args.indexOf(flag)+1], source=value('--source'),build=value('--build'),out=value('--out');
  if(!/^[a-f0-9]{40}$/.test(source||'') || !/^[a-f0-9-]{36}$/.test(build||'') || !out || !args.includes('--source') || !args.includes('--build') || !args.includes('--out')) throw Error('Required: --source <exact SHA> --build <Root-completed build UUID> --out <private directory> and --check or --run.');
  const local=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(local!==source)throw Error('Local source does not match the exact qualified source.');
  if(args.includes('--check')&&!args.includes('--run')) { console.log(JSON.stringify({ready:true,source,rootCompletedBuild:build,targets:TARGETS,providerBypass:false,requestsMade:0}));return; }
  if(!args.includes('--run')) throw Error('No request made. Use --check, or Root uses --run after receiving completed deployment.');
  const dir=resolve(out);await mkdir(dir,{mode:0o700,recursive:false});const rows=[],startedAt=new Date().toISOString();let lastStart=-Infinity;
  for(let i=0;i<TARGETS.length;i++) {
    const wait=Math.max(0,lastStart+10000-performance.now());if(wait)await new Promise(r=>setTimeout(r,wait));lastStart=performance.now();const url=TARGETS[i],row={url,at:new Date().toISOString()};
    const lifetime=createRequestBudget(25000);
    try { const endpoint=new URL('https://samedaydesk.com/api/tools/ai-readiness');endpoint.searchParams.set('version','2');endpoint.searchParams.set('url',url);
      const response=await fetch(endpoint,{signal:lifetime.signal,headers:{'user-agent':'SameDayDeskReleaseReceiving/1.0'}});row.status=response.status;
      const report=await response.json();await writeFile(resolve(dir,`${i+1}.json`),JSON.stringify(report,null,2)+'\n',{mode:0o600});
      row.version=report.version;row.renderedStatus=report.checks?.find(r=>r.id==='rendered')?.status||null;row.measurement=report.measurements?.rendered||null;row.initialWords=report.summary?.wordsOnHomepage??null;row.valid=Boolean(response.ok&&report.version===2&&Array.isArray(report.checks));
    } catch { row.valid=false;row.error='Public check could not be received; no retry.'; } finally { lifetime.dispose(); }
    rows.push(row);console.log(JSON.stringify(row));
  }
  const receipt={source,rootAttestedCompletedBuild:build,startedAt,completedAt:new Date().toISOString(),rows,summary:summarize(rows),allTenReceived:rows.length===10&&rows.every(r=>r.valid),providerCallsNotAssumed:true};
  await writeFile(resolve(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt.summary));if(!receipt.allTenReceived)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Receiving refused or failed; no credentials or raw error are printed.');process.exitCode=1});
