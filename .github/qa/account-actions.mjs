import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(process.cwd()+'/package.json'),{Pool}=require('pg');
const browserRequire=createRequire(process.env.SDS_BROWSER_MODULES+'/package.json'),puppeteer=browserRequire('puppeteer-core');
const base=process.env.SDS_PREVIEW_ORIGIN||'http://127.0.0.1:31861',dir=process.env.SDS_ACCOUNT_OUT||'/tmp/sds-account-acceptance';await mkdir(dir,{recursive:true});
const settings=JSON.parse(await readFile(process.env.SDS_LOCAL_AUTH_CONFIG));
const email='acceptance-'+randomUUID().slice(0,8)+'@example.test',password=randomUUID()+'Aa9!';
const created=await fetch(settings.SUPABASE_URL+'/auth/v1/signup',{method:'POST',headers:{'Content-Type':'application/json',apikey:settings.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({email,password})});
const user=(await created.json()).user;assert.ok(user?.id,'real local Auth signup must issue an account');
const pool=new Pool({connectionString:process.env.SDS_LOCAL_DATABASE_URL});
const chrome=await puppeteer.launch({headless:true,executablePath:'/usr/local/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const axe=await readFile(browserRequire.resolve('axe-core/axe.min.js'),'utf8');const report={auth:'real local Supabase Auth',rest:'real local PostgREST',records:'synthetic test data only',views:[],actions:[]};
async function shot(page,name,width,theme,expectedFailures=[]){
 await page.evaluate(async()=>document.fonts.ready);await page.addScriptTag({content:axe});
 const result=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {axe:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,text:document.querySelector('main')?.innerText};});
 const screenshot=name+'-'+width+'-'+theme+'.jpg';await page.screenshot({path:dir+'/'+screenshot,fullPage:true,type:'jpeg',quality:75});report.views.push({name,width,theme,screenshot,expectedFailures,...result});await writeFile(dir+'/report.json',JSON.stringify(report,null,2));
}
try{
for(const width of [390,768,1440])for(const theme of ['drafting','dark']){
 const context=await chrome.createBrowserContext(),page=await context.newPage();page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text());});page.on('requestfailed',r=>console.log('FAILED',new URL(r.url()).pathname,r.failure()?.errorText));page.on('request',r=>{if(r.method()==='OPTIONS')console.log('PREFLIGHT',new URL(r.url()).pathname,r.headers()['access-control-request-headers']);});await page.setViewport({width,height:900});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.evaluateOnNewDocument(t=>localStorage.setItem('sdd-theme',t),theme);
 await page.goto(base+'/login',{waitUntil:'networkidle0'});await page.locator('button[type=submit]').click();assert.equal(await page.$eval('input[type=email]',e=>e.validity.valueMissing),true);
 await shot(page,'login-validation',width,theme);
 await page.type('input[type=email]',email);await page.type('input[type=password]','invalid-password');await page.locator('button[type=submit]').click();await page.waitForSelector('[role=alert]');await shot(page,'login-refusal',width,theme,['Supabase Auth 400 invalid credentials']);
 await page.$eval('input[type=password]',(e,v)=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));},'');await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForFunction(()=>location.pathname==='/dashboard');await page.waitForFunction(()=>document.body.innerText.includes('No orders yet.')).catch(async e=>{console.log('DASHBOARD',await page.$eval('main',e=>e.innerText));throw e;});
 await shot(page,'dashboard-empty',width,theme);
 const statuses=['received','in_progress','delivered','refunded','intake_required'];
 for(const [i,status] of statuses.entries())await pool.query('insert into public.orders(id,user_id,offer,label,amount,status) values($1,$2,$3,$4,$5,$6) on conflict(id) do nothing',['order_legacy_'+user.id+'_'+i,user.id,'agent_front_door','Agent Front Door',24900,status]);
 await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.textContent.includes('intake needs review')).catch(async e=>{console.log('POPULATED',await page.$eval('main',e=>e.innerText));throw e;});await shot(page,'dashboard-legacy-orders',width,theme);
 // Real REST permission failure, followed by a successful retry against the same records.
 await pool.query('revoke select on public.orders from authenticated');
 try{await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('[role=alert]');await shot(page,'dashboard-recoverable-error',width,theme,['PostgREST 403 denied orders read']);}
 finally{await pool.query('grant select on public.orders to authenticated');}
 await page.locator('[role=alert] button').click();await page.waitForFunction(()=>document.body.textContent.includes('intake needs review'));assert.equal(await page.$('[role=alert]'),null);
 await page.goto(base+'/dashboard?paid=1',{waitUntil:'networkidle0'});assert.equal((await page.$eval('main',e=>e.innerText)).includes('Payment received.'),false);report.actions.push({name:'untrusted-return-does-not-confirm-payment',width,theme,passed:true});
 await page.locator('header button').click();await page.waitForFunction(()=>location.pathname==='/login');report.actions.push({name:'real-auth-sign-out',width,theme,passed:true});
 await pool.query('delete from public.orders where user_id=$1',[user.id]);await context.close();console.log('ACCOUNT',width,theme,'passed');
}
}finally{await pool.query('grant select on public.orders to authenticated');await pool.end();await chrome.close();await writeFile(dir+'/report.json',JSON.stringify(report,null,2));}
