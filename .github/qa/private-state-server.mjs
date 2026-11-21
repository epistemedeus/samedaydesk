// Private acceptance fixture driver. Real production app, PostgreSQL, service and
// signed webhook handler. Stripe objects below are fixtures, never provider receipts.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
if (process.env.SDS_PRIVATE_PREVIEW !== '1' || process.env.NODE_ENV !== 'production' ||
    process.env.STRIPE_SECRET_KEY !== 'sk_test_private_fixture' ||
    new URL(process.env.SDS_CARE_DATABASE_URL).hostname !== '127.0.0.1') throw new Error('isolated fixture configuration required');
const dir = process.env.SDS_ACCEPTANCE_OUT;
if (!dir || !isAbsolute(dir) || resolve(dir).startsWith(resolve('client')+'/')) throw new Error('private output path required');
await mkdir(dir,{recursive:true});
const { createSdsApp } = await import('../../server/app.js');
const { createCareService } = await import('../../server/lib/care-service.js');
const { openCareStore } = await import('../../server/lib/care-store.js');
const { careToken } = await import('../../server/lib/care-contract.js');
const { stripe: signer } = await import('../../server/lib/stripe.js');
const origin=process.env.SDS_PREVIEW_ORIGIN||'http://127.0.0.1:31861',secret='isolated care access secret sufficient length';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('isolated loopback preview required');
const store=openCareStore(),sessions=new Map(),charges=new Map();
const stripe={checkout:{sessions:{
 async create(args){const s={id:'cs_test_'+randomUUID().replaceAll('-',''),livemode:false,mode:args.mode,client_reference_id:args.client_reference_id,
  currency:'usd',amount_total:args.line_items[0].price_data.unit_amount,metadata:args.metadata,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_test_private_fixture'};sessions.set(s.id,s);return s;},
 async retrieve(id){if(!sessions.has(id))throw new Error('unknown fixture session');return sessions.get(id);},
}},paymentIntents:{async retrieve(id){return {id,livemode:false,metadata:{}};}},subscriptions:{async retrieve(id){return {id,livemode:false,customer:'cus_fixture',status:'active',cancel_at_period_end:false};}},
 billingPortal:{sessions:{async create(){return {livemode:false,url:'https://billing.stripe.com/p/session/test_private_fixture'};}}}};
signer.paymentIntents.create=async()=>{throw new Error('Hosted Stripe acceptance requires a claimed test sandbox');};
stripe.charges={async retrieve(id){return charges.get(id);}};
const care=createCareService({store,stripe,secret,origin,live:false,portalConfiguration:'bpc_fixture'});
const app=createSdsApp({care}),source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const server=http.createServer((req,res)=>{res.setHeader('X-SDS-Private-Source',source);app(req,res);}).listen(Number(new URL(origin).port),'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const links=[];
async function event(type,object){const payload=JSON.stringify({type,livemode:false,created:Math.floor(Date.now()/1000),data:{object}});
 const signature=signer.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
 const r=await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':signature},body:payload});
 if(!r.ok)throw new Error('fixture webhook refused');}
for(const [name,offer] of [['pending','agent_front_door'],['paid','agent_front_door'],['intake-received','agent_front_door'],['expired','agent_front_door'],['refunded','agent_front_door'],['review','agent_front_door'],['subscription','keep_it_working'],['paid-route','machine_payment_route'],['paid-storefront','agent_storefront'],...[390,768,1440].flatMap(w=>['drafting','dark'].map(t=>[`action-${w}-${t}`,'agent_front_door']))]){
 const id=randomUUID();await care.start(offer,id);const order=await store.order(id);const session=sessions.get(order.session_id);
 if(name!=='pending'&&name!=='expired'){
  Object.assign(session,{status:'complete',payment_status:'paid',payment_intent:'pi_'+id.replaceAll('-',''),customer:'cus_fixture',customer_details:{email:'buyer@example.test'},...(offer==='keep_it_working'?{subscription:'sub_fixture_'+id.replaceAll('-','')}:{})});
  await event('checkout.session.completed',session);await event('checkout.session.completed',session);
 }
 if(name==='expired'){session.status='expired';await event('checkout.session.expired',session);}
 if(name==='refunded')await event('charge.refunded',{id:'ch_fixture',livemode:false,payment_intent:session.payment_intent,customer:'cus_fixture',refunded:true,amount_refunded:24900});
 if(name==='review'){const charge={id:'ch_risk',livemode:false,payment_intent:session.payment_intent,customer:'cus_fixture'};charges.set(charge.id,charge);await event('charge.dispute.created',{id:'dp_fixture',charge:charge.id});}
 if(name==='intake-received')await care.submit(id,careToken(secret,id,'intake'),{surface:'The booking workflow',outcome:'An assistant can book the requested appointment.',releaseChannel:'Public release page'});
 const path='/care/intake#'+new URLSearchParams({order:id,key:careToken(secret,id,'intake')});links.push({name,path,expected:(await care.read(id,careToken(secret,id,'intake'))).state});
 if(name==='subscription')links.push({name:'manage-renewal',path:'/care/subscription#'+new URLSearchParams({order:id,key:careToken(secret,id,'cancel')})});
}
await writeFile(dir+'/state-links.private.json',JSON.stringify(links),{mode:0o600});
await writeFile(dir+'/server.pid',String(process.pid));
console.log(JSON.stringify({ready:true,states:links.map(({name,expected})=>({name,expected})),paymentAuthority:'signed synthetic fixtures only'}));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(async()=>{await care.close();process.exit(0);}));
