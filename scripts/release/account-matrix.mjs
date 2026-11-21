// Real Payment Element acceptance against the existing isolated Auth/PostgREST preview.
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {getOffer} from '../../server/pricing.js';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const base=process.env.SDS_ACCOUNT_PREVIEW_DIR;if(!base)throw Error('SDS_ACCOUNT_PREVIEW_DIR must name the isolated local Auth preview');
const cfg=JSON.parse(readFileSync(base+'/config.private.json')),run=JSON.parse(readFileSync(base+'/provider-run.json'));
const require=createRequire(execFileSync(process.execPath,[root+'/scripts/release/kit.mjs','path'],{encoding:'utf8'}).trim()+'/package.json'),puppeteer=require('puppeteer-core');
const key=readFileSync(process.env.STRIPE_TEST_KEY_FILE,'utf8').trim();if(!/^(sk|rk)_test_/.test(key))throw Error('test key required');
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(run.origin)||!/^http:\/\/127\.0\.0\.1:\d+$/.test(cfg.SUPABASE_URL)||new URL(cfg.SDS_LOCAL_DATABASE_URL).hostname!=='127.0.0.1')throw Error('Only isolated loopback previews are allowed');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==run.source||execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim())throw Error('Commit and start the exact clean preview source before provider tests');
const health=await fetch(run.origin+'/api/health');if(!health.ok||health.headers.get('x-sds-private-source')!==run.source)throw Error('Private preview source did not match');
const out=process.env.SDS_ACCOUNT_OUT||base+'/payments-'+run.run;mkdirSync(out,{recursive:true,mode:0o700});
const report={...run,records:[],authority:'real local Auth and PostgREST, real Stripe test API and browser Payment Element, no customer data'};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const api=async(path,params={})=>{const r=await fetch('https://api.stripe.com/v1/'+path+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok)throw Error('Stripe readback '+r.status);if(j.livemode===true)throw Error('Live mode refused');return j;};
const sql=q=>execFileSync('psql',['-X','-At','-v','ON_ERROR_STOP=1',cfg.SDS_LOCAL_DATABASE_URL,'-c',q],{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const quick=p=>Promise.race([p.catch(()=>null),sleep(2000).then(()=>null)]);
async function control(page,selector,timeout=30000){for(const end=Date.now()+timeout;Date.now()<end;await sleep(250)){
 for(const f of page.frames().filter(f=>f===page.mainFrame()||f.url().startsWith('https://js.stripe.com/v3/elements-inner'))){
  const h=await quick(f.evaluateHandle(sel=>[...document.querySelectorAll(sel)].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.disabled;}),selector));const e=h?.asElement();if(e)return e;await h?.dispose();
 }}throw Error('No visible '+selector);}
async function fill(page,sel,text,optional=false){let h;try{h=await control(page,sel,optional?2500:30000);}catch(e){if(optional)return;throw e;}await h.focus();await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await h.type(text,{delay:20});}
async function eventFor(pi){for(let i=0;i<35;i++){
 const list=await api('events',{type:'payment_intent.succeeded',limit:'50'});const e=list.data.find(e=>e.data.object.id===pi&&e.data.object.metadata?.release_run===run.run);
 if(e){for(let n=0;n<30;n++){let delivered;try{delivered=JSON.parse(readFileSync(base+'/provider-deliveries.json')).statuses[e.id];}catch{}if(delivered!==undefined)return{id:e.id,type:e.type,deliveredThroughListener:delivered};await sleep(500);}return{id:e.id,type:e.type,deliveredThroughListener:null};}await sleep(1000);
 }return{missing:true};}
const identityFile=process.env.SDS_ACCOUNT_IDENTITY_FILE;let identity=null;
if(identityFile){const stat=lstatSync(identityFile);if(!stat.isFile()||(stat.mode&0o077)||stat.uid!==process.getuid())throw Error('A private owned account fixture is required');identity=JSON.parse(readFileSync(identityFile,'utf8'));if(identity.email!=='contact@samedaydesk.com'||!identity.password)throw Error('Only the existing owned brand mailbox may receive the account receipt proof');}
const email=identity?.email||'account-'+randomUUID().slice(0,8)+'@example.test',password=identity?.password||randomUUID()+'Aa9!';
if(!identity){const signup=await fetch(cfg.SUPABASE_URL+'/auth/v1/signup',{method:'POST',headers:{'content-type':'application/json',apikey:cfg.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({email,password})});if(!(await signup.json()).user?.id)throw Error('Actual local signup failed');}
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/google-chrome',headless:true,args:['--disable-dev-shm-usage','--disable-features=IsolateOrigins,site-per-process','--disable-site-isolation-trials']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1100});await page.goto(run.origin+(identity?.signup?'/signup':'/login'),{waitUntil:'networkidle2'});await page.type('input[type=email]',email);await page.type('input[type=password]',password);await page.click('button[type=submit]');await page.waitForFunction(()=>location.pathname==='/dashboard');report.accountEntry=identity?.signup?'real UI signup':'real UI login';report.receiptToOwnedMailbox=Boolean(identity);
 for(const offer of ['agent_workflow','agent_mcp_server','machine_payment_route','agent_storefront']){
  const cents=getOffer(offer).amount;
  const row={offer,state:'running'};report.records.push(row);save();
  try{
   const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/checkout/create-payment-intent',{timeout:30000});await page.goto(run.origin+'/checkout?offer='+offer,{waitUntil:'networkidle2'});const r=await response,j=await r.json();if(!r.ok()||!j.paymentIntentId)throw Error('Create PaymentIntent '+r.status());
   row.shown={cents:await page.$eval('main aside',e=>{const m=e.innerText.match(/Build total\s+([\d,]+)\s+USD/);return m?Number(m[1].replaceAll(',',''))*100:null;})};
   const before=await api('payment_intents/'+j.paymentIntentId);row.readback={id:before.id,amount:before.amount,currency:before.currency,livemode:before.livemode,release_run:before.metadata?.release_run};
   if(row.shown.cents!==cents||before.amount!==cents||before.currency!=='usd'||before.metadata?.release_run!==run.run)throw Error('Shown price or run did not match provider');
   await page.type('textarea','A release validation task for '+offer+'. Acceptance: the requested tool workflow completes.');
   await fill(page,'#Field-numberInput, #payment-numberInput, input[name=number]','4242424242424242');await fill(page,'#Field-expiryInput, #payment-expiryInput, input[name=expiry]','1234');await fill(page,'#Field-cvcInput, #payment-cvcInput, input[name=cvc]','123');
   await fill(page,'#Field-postalCodeInput, #payment-postalCodeInput, input[name=postalCode]','10001',true);
   await page.screenshot({path:out+'/'+offer+'-before.png',fullPage:true});
   const submit=await page.$('main button[type=submit]');if(!submit||await submit.evaluate(e=>e.disabled))throw Error('Pay action disabled');await submit.focus();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>location.pathname==='/dashboard',{timeout:60000});await sleep(1000);
   const paid=await api('payment_intents/'+j.paymentIntentId);row.stripe={id:paid.id,status:paid.status,amount:paid.amount,currency:paid.currency,livemode:paid.livemode,release_run:paid.metadata?.release_run};row.webhook=await eventFor(paid.id);
   row.stored=JSON.parse(sql(`select row_to_json(x) from (select id,offer,amount,currency,status,stripe_payment_intent,meta->'intake' as intake from orders where stripe_payment_intent='${paid.id}') x`)||'null');
   row.buyer={path:'/dashboard?paid=1',text:(await page.$eval('main',e=>e.innerText)).slice(0,2000),screenshot:offer+'-paid.png'};await page.screenshot({path:out+'/'+offer+'-paid.png',fullPage:true});
   if(paid.status!=='succeeded'||row.webhook.deliveredThroughListener!==200||row.stored?.status!=='received'||row.stored.amount!==cents||!row.stored.intake?.details?.includes(offer))throw Error('Paid provider, webhook or stored delivery did not agree');
   row.state='passed';
  }catch(e){row.state='failed';row.why=e.message.slice(0,250);row.path=page.url().replace(/[?#].*/,'?<redacted>');row.frames=page.frames().map(f=>{try{const u=new URL(f.url());return u.origin+u.pathname;}catch{return'unknown';}});await page.screenshot({path:out+'/'+offer+'-failed.png',fullPage:true}).catch(()=>{});}
  save();console.log(JSON.stringify({offer:row.offer,state:row.state,why:row.why}));
 }
}finally{await browser.close();report.sourceUnchanged=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()===run.source&&!execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();save();}
console.log(JSON.stringify({output:out,passed:report.records.filter(r=>r.state==='passed').length,failed:report.records.filter(r=>r.state==='failed').length,sourceUnchanged:report.sourceUnchanged}));process.exit(report.records.some(r=>r.state!=='passed')||!report.sourceUnchanged?1:0);
