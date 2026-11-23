// Controller read-only snapshot of the existing public Payment Links. List and
// retrieve catalog terms only. Never enumerate sessions, customers or payments.
import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

import { readHostedTerms } from '../lib/hosted-offer-catalog.js';
export { hostedLinks, readHostedTerms } from '../lib/hosted-offer-catalog.js';

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
