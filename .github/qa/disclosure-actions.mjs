// Open the real nested receipt and Rust disclosures with the keyboard. Closed
// descendants are absent from the tab order; opening them must expose controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const require=createRequire(process.env.SDS_BROWSER_MODULES+'/package.json');
const origin=process.env.SDS_PREVIEW_ORIGIN||'http://127.0.0.1:31861',out=process.env.SDS_DISCLOSURE_OUT;
await mkdir(out,{recursive:true});
const browser=await require('puppeteer-core').launch({executablePath:'/usr/local/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const axe=await readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),views:[],actions:[]};
try{for(const path of ['/receipts','/docs/rust-itertools/pkg-itertools-itertools.html'])for(const width of [390,768,1440])for(const theme of ['drafting','dark']){
 const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push({path:new URL(r.url()).pathname,status:r.status()})});
 await page.setViewport({width,height:900});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.evaluateOnNewDocument(t=>{localStorage.setItem('sdd-theme',t);localStorage.setItem('sourcey-theme',t==='dark'?'dark':'light')},theme);
 await page.goto(origin+path,{waitUntil:'networkidle0'});let opened=0;
 for(;;){const next=await page.evaluate(()=>{const s=[...document.querySelectorAll('details:not([open]) > summary')].find(e=>e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true}));if(!s)return false;s.focus();return true});if(!next)break;assert.ok(++opened<1000);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.closest('details').open),true)}
 assert.ok(opened>0);assert.equal(await page.$$eval('details:not([open])',es=>es.length),0);
 const focus=await page.evaluate(()=>[...document.querySelectorAll('a[href],button,input,textarea,select,summary,[tabindex="0"]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})&&!e.disabled&&e.tabIndex>=0).map(e=>{const before=getComputedStyle(e).borderColor;e.focus();const s=getComputedStyle(e),r=e.getBoundingClientRect(),parent=e.closest('article')||e.closest('[class*="card"]'),outer=parent&&getComputedStyle(parent);return{tag:e.tagName,label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,80),focused:document.activeElement===e,visible:r.width>0&&r.height>0&&r.left>=-2&&r.right<=innerWidth+2,indicator:s.outlineStyle!=='none'||s.boxShadow!=='none'||s.borderColor!==before||Boolean(outer&&outer.outlineStyle!=='none')}}));
 assert.deepEqual(focus.filter(x=>!x.focused||!x.visible||!x.indicator),[]);
 await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0)});await page.addScriptTag({content:axe});const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
 assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);const screenshots=[],height=await page.evaluate(()=>document.documentElement.scrollHeight),prefix=(path==='/receipts'?'receipts':'rust')+'-expanded-'+width+'-'+theme;
 for(let y=0;y<height;y+=12000){const name=prefix+'-part-'+Math.floor(y/12000)+'.jpg';await page.screenshot({path:out+'/'+name,clip:{x:0,y,width,height:Math.min(12000,height-y)},captureBeyondViewport:true,type:'jpeg',quality:72});screenshots.push(name)}
 report.views.push({path,width,theme,state:'all disclosures opened through keyboard',opened,focus,axe:violations,errors,screenshots});report.actions.push({path,width,theme,opened,allChildrenKeyboardReachable:true});await writeFile(out+'/report.json',JSON.stringify(report,null,2));await context.close();console.log('DISCLOSURES',path,width,theme,opened);
}}finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2))}
