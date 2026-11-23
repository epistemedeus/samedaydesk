import assert from 'node:assert/strict';

export const hostedLinks = Object.freeze({
  legacy_skill_audit:'6oUaEY0xA179899fYSeZ20f',legacy_skill_watch:'5kQ8wQ4NQ4jlahhh2WeZ20g',
  legacy_visibility_audit:'3cIbJ2gwy2bdgFFfYSeZ20u',legacy_visibility_fix:'3cI00kdkmeXZ6118wqeZ20v',
  legacy_visibility_sprint:'00w00k1BE9DF2OP282eZ20w',legacy_fix_pack:'28E5kE9465np2OPh2WeZ20e',
  legacy_med_spa_bundle:'fZuaEYdkm5np611cMGeZ20k',legacy_readiness_kit:'7sYbJ2946179611dQKeZ20i'
});
export async function readHostedTerms(stripe,offers,{links=hostedLinks,live=true}={}) {
  const wanted=new Map(Object.entries(links).map(([id,slug])=>['https://buy.stripe.com/'+slug,id]));
  const items={};let cursor,complete=false;
  for(let page=0;page<40;page++) {
    const batch=await stripe.paymentLinks.list({limit:100,...(cursor && {starting_after:cursor})});
    for(const link of batch.data) {
      const id=wanted.get(link.url);
      if(!id) continue;
      assert(!items[id] && link.livemode===live,'ambiguous live payment link');
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
