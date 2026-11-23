// Controller read-only snapshot of the existing public Payment Links. List and
// retrieve catalog terms only. Never enumerate sessions, customers or payments.
import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

export const hostedLinks = Object.freeze({
  legacy_skill_audit:'6oUaEY0xA179899fYSeZ20f',legacy_skill_watch:'5kQ8wQ4NQ4jlahhh2WeZ20g',
  legacy_visibility_audit:'3cIbJ2gwy2bdgFFfYSeZ20u',legacy_visibility_fix:'3cI00kdkmeXZ6118wqeZ20v',
  legacy_visibility_sprint:'00w00k1BE9DF2OP282eZ20w',legacy_fix_pack:'28E5kE9465np2OPh2WeZ20e',
  legacy_med_spa_bundle:'fZuaEYdkm5np611cMGeZ20k',legacy_readiness_kit:'7sYbJ2946179611dQKeZ20i'
});
export async function readHostedTerms(stripe,offers) {
  const wanted=new Map(Object.entries(hostedLinks).map(([id,slug])=>['https://buy.stripe.com/'+slug,id]));
  const items={};let cursor,complete=false;
  for(let page=0;page<40;page++) {
    const batch=await stripe.paymentLinks.list({limit:100,...(cursor && {starting_after:cursor})});
    for(const link of batch.data) {
      const id=wanted.get(link.url);
      if(!id) continue;
      assert(!items[id] && link.livemode===true,'ambiguous live payment link');
      const lines=await stripe.paymentLinks.listLineItems(link.id,{limit:3,expand:['data.price.product']});
      const p=lines.data[0]?.price,offer=offers.find(x=>x.id===id);
      assert(offer && !lines.has_more && lines.data.length===1 && lines.data[0].quantity===1 && p?.currency==='usd' &&
        p.unit_amount===offer.cents && (p.recurring?.interval ?? null)===(offer.interval ?? null) &&
        (!p.recurring || p.recurring.interval_count===1),'stored offer price or billing interval differs');
      // Keep delivery links in the protected output. A redirect may be a delivery capability.
      items[id]={active:link.active && p.active && p.product?.active===true,linkId:link.id,priceId:p.id,
        productId:p.product.id,cents:p.unit_amount,interval:p.recurring?.interval ?? null,
        afterCompletion:link.after_completion,customFields:link.custom_fields,productName:p.product.name};
    }
    if(Object.keys(items).length===wanted.size || !batch.has_more) {complete=true;break;}
    cursor=batch.data.at(-1)?.id;assert(cursor,'missing Stripe pagination cursor');
  }
  assert(complete,'catalog read limit reached');
  return {schema:'sds.hosted-offer-readback.v1',observedAt:new Date().toISOString(),items,
    missing:[...wanted.values()].filter(id=>!items[id])};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [out]=process.argv.slice(2);
  assert(out && process.env.STRIPE_READ_KEY_FILE,'expected private output path and enrolled read key file');
  const key=(await readFile(process.env.STRIPE_READ_KEY_FILE,'utf8')).trim();
  assert(/^(sk|rk)_live_/.test(key),'expected enrolled live catalog reader');
  const stripe=new Stripe(key,{apiVersion:'2026-11-18.endive',timeout:10000,maxNetworkRetries:0});
  const offers=JSON.parse(await readFile(new URL('../../release/offers.json',import.meta.url),'utf8')).notInHarnessYet;
  const snapshot=await readHostedTerms(stripe,offers);
  const fd=await open(out,'wx',0o600);
  try {await fd.writeFile(JSON.stringify(snapshot,null,2)+'\n');await fd.sync();} finally {await fd.close();}
  console.log(JSON.stringify({found:Object.keys(snapshot.items),missing:snapshot.missing,providerWrites:0}));
}
