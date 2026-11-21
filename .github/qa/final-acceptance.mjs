import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const require=createRequire(resolve(process.env.SDS_BROWSER_MODULES || 'node_modules','package.json'));
const puppeteer=require('puppeteer-core');
const origin=process.argv[2] || 'http://127.0.0.1:31861';
const out=resolve(process.argv[3] || '/tmp/sds-final-acceptance');
await mkdir(join(out,'screenshots'),{recursive:true});
const sitemap=await (await fetch(origin+'/sitemap.xml')).text();
const paths=new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]).pathname));
async function walk(dir, prefix='') {for(const ent of await readdir(dir,{withFileTypes:true})) {if(ent.name.startsWith('.')||['assets','route-shells'].includes(ent.name))continue; const p=prefix+'/'+ent.name;if(ent.isDirectory())await walk(join(dir,ent.name),p);else if(ent.name.endsWith('.html'))paths.add(p==='/index.html'?'/':p);}}
await walk('client/dist');
const {RECEIPT_SHELLS}=await import(process.cwd()+'/client/src/data/receiptPages.mjs');
const receiptPaths=RECEIPT_SHELLS.map(e=>e.path);
receiptPaths.forEach(p=>paths.add(p));
['/receipts','/login','/signup','/care/buy?offer=agent_front_door','/care/buy?offer=machine_payment_route','/care/buy?offer=agent_storefront','/care/buy?offer=keep_it_working','/care/intake','/care/subscription'].forEach(p=>paths.add(p));
const all=process.env.SDS_AUDIT_PATHS?JSON.parse(process.env.SDS_AUDIT_PATHS):[...paths].sort();
const shard=Number(process.env.SDS_AUDIT_SHARD||0),shards=Number(process.env.SDS_AUDIT_SHARDS||1);
const selected=all.filter((_,i)=>i%shards===shard);
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()!=='',browser:await browser.version(),origin,paths:[...paths].sort(),machine:[],views:[],links:[],errors:[]};
const axe=await readFile(require.resolve('axe-core/axe.min.js'),'utf8');
try {
for(const path of selected) {
 const probe=await fetch(origin+path); const type=probe.headers.get('content-type');
 if(!type?.includes('text/html')) {report.machine.push({path,status:probe.status,type});continue;}
 for(const width of JSON.parse(process.env.SDS_AUDIT_WIDTHS||'[390,768,1440]')) for(const theme of JSON.parse(process.env.SDS_AUDIT_THEMES||'["drafting","dark"]')) {
  const viewStarted=Date.now();
  const context=await browser.createBrowserContext();const page=await context.newPage();
  await page.setViewport({width,height:900,deviceScaleFactor:1});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(t=>{localStorage.setItem('sdd-theme',t);localStorage.setItem('sourcey-theme',t==='dark'?'dark':'light');},theme);
  const row={path,width,theme,console:[],requests:[],axe:[],incomplete:[]};
  await page.setRequestInterception(true);page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame()&&new URL(r.url()).origin!==origin){row.externalHandoff=r.url();void r.abort('aborted');}else void r.continue();});
  page.on('pageerror',e=>row.console.push(e.message));
  page.on('console',m=>{if(m.type()==='error')row.console.push(m.text());});
  page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')row.requests.push({url:r.url().replace(origin,''),error:r.failure()?.errorText});});
  page.on('response',r=>{if(r.status()>=400)row.requests.push({url:r.url().replace(origin,''),status:r.status()});});
  try {
   const response=await page.goto(origin+path,{waitUntil:'networkidle2',timeout:30000});row.status=response?.status() ?? probe.status;
   await page.evaluate(async()=>{await document.fonts.ready;for(let y=0;y<document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>requestAnimationFrame(r));}window.scrollTo(0,0);});
   await new Promise(r=>setTimeout(r,140));
   row.layout=await page.evaluate(()=>{
    const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&r.height&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';};
    const scrollParent=e=>{let p=e.parentElement;while(p){const s=getComputedStyle(p);if(['auto','scroll'].includes(s.overflowX)&&p.scrollWidth>p.clientWidth)return true;p=p.parentElement;}return false;};
    const bad=[...document.querySelectorAll('h1,h2,h3,p,a,button,input,textarea,pre,table,code')].filter(e=>visible(e)&&!scrollParent(e)).filter(e=>{const r=e.getBoundingClientRect();return r.left < -2||r.right>innerWidth+2;}).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,90),left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right)}));
    const motion=document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations===Infinity).map(a=>({name:a.animationName,element:a.effect?.target?.tagName}));
    const position={left:scrollX,top:scrollY};window.scrollTo({left:1000000,top:scrollY,behavior:'instant'});const maxScrollX=scrollX;window.scrollTo({...position,behavior:'instant'});
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,maxScrollX,outside:bad,motion,theme:document.documentElement.dataset.theme,heading:document.querySelector('h1')?.textContent};
   });
   const links=await page.$$eval('a[href]',els=>els.map(e=>({href:e.getAttribute('href'),text:e.textContent.trim().slice(0,100)})));links.forEach(l=>report.links.push({path,...l}));
   await page.addScriptTag({content:axe});
   const ar=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});const cut=v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html.slice(0,300)}))});return {violations:r.violations.map(cut),incomplete:r.incomplete.map(cut)};});
   row.axe=ar.violations;row.incomplete=ar.incomplete;
   row.ariaReferences=await page.$$eval('[aria-controls]',es=>es.map(e=>({id:e.id,controls:e.getAttribute('aria-controls'),exists:e.getAttribute('aria-controls').split(/\s+/).every(id=>Boolean(document.getElementById(id)))})));
   await page.keyboard.press('Tab');
   row.focus=await page.evaluate(()=>{
    const elements=[...document.querySelectorAll('a[href],button,input,textarea,select,summary,[tabindex="0"]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})&&!e.disabled&&e.tabIndex>=0);
    return elements.map(e=>{const initiallyFocused=document.activeElement===e;if(initiallyFocused)e.blur();const priorBorder=getComputedStyle(e).borderColor;const strip=e.closest('[class*="stripWindow"]');strip?e.focus():e.focus({preventScroll:true});const s=getComputedStyle(e),r=e.getBoundingClientRect();const card=e.closest('article')||e.closest('[class*="card"]');const outer=card?getComputedStyle(card):null;const viewport=strip?.getBoundingClientRect();const nativeScroll=strip?{overflow:getComputedStyle(strip).overflowX,targetWidth:r.width,viewportWidth:viewport.width,visibleWidth:Math.max(0,Math.min(r.right,viewport.right,innerWidth)-Math.max(r.left,viewport.left,0)),scrollLeft:strip.scrollLeft}:null;
      // The separate receipt-strip keyboard check verifies arrow-key reveal of clipped text.
      return {tag:e.tagName,label:(e.getAttribute('aria-label')||e.labels?.[0]?.textContent||e.textContent||e.getAttribute('name')||'').trim().slice(0,80),id:e.id,tabIndex:e.tabIndex,initiallyFocused,focused:document.activeElement===e,outline:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0,shadow:s.boxShadow!=='none',outerFocus:Boolean(outer&&outer.outlineStyle!=='none'),borderFocus:s.borderColor!==priorBorder,visible:r.width>0&&r.height>0&&((r.left>=-2&&r.right<=innerWidth+2)||(nativeScroll?.overflow==='auto'&&nativeScroll.visibleWidth>1)),nativeScroll,x:Math.round(r.x),y:Math.round(r.y)};});
   });
   await page.evaluate(()=>{document.activeElement?.blur();document.querySelectorAll('[class*="stripWindow"]').forEach(e=>e.scrollLeft=0);window.scrollTo(0,0);});
   row.screenshot='screenshots/'+String(report.views.length+1).padStart(4,'0')+'-'+width+'-'+theme+'.jpg';
   const height=await page.evaluate(()=>document.documentElement.scrollHeight);
   if(height>15000){row.screenshots=[];for(let y=0;y<height;y+=12000){const name=row.screenshot.replace('.jpg','-part-'+Math.floor(y/12000)+'.jpg');await page.screenshot({path:join(out,name),clip:{x:0,y,width,height:Math.min(12000,height-y)},captureBeyondViewport:true,type:'jpeg',quality:72});row.screenshots.push(name);}delete row.screenshot;}else await page.screenshot({path:join(out,row.screenshot),fullPage:true,type:'jpeg',quality:72});
  } catch(e) {row.error=e.message;}
  report.views.push(row);await context.close();
  // Four full-route workers share one anonymous event rate limit.
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,2200-(Date.now()-viewStarted))));
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({view:report.views.length,path,width,theme,status:row.status,axe:row.axe.map(x=>x.id),outside:row.layout?.outside.length,errors:row.console.length+row.requests.length,error:row.error}));
 }
}
} finally {await browser.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
