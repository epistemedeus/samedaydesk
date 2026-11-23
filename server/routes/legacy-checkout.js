import { Router, urlencoded } from "express";
import { CareError } from "../lib/care-contract.js";
import { legacyEnabled, legacyOffer, legacySlug, parseLegacyLicense } from "../lib/legacy-order.js";
import { generateCompleteFixPack } from "../lib/fixpack-artifact.js";

const router=Router();
const head=title=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | SameDayDesk</title><link rel="stylesheet" href="/checkout/payment.css"></head><body><main><a href="/">SameDayDesk</a><h1>${title}</h1>`;
router.use(["/hosted","/fix-pack"],(_req,res,next)=>{res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"});next();});
router.get("/hosted/:offer",(req,res)=>{
  const offer=legacyOffer(req.params.offer);
  if(!offer) return res.sendStatus(404);
  try {
    if(!legacyEnabled(offer.id,process.env)) return res.redirect(303,"https://buy.stripe.com/"+legacySlug(offer.id,process.env));
    const fields=["order","method","email",...(offer.target?["target"]:[]),...(offer.city?["city"]:[])];
    if(req.accepts(["html","json"])==="json")return res.json({offer:offer.id,cents:offer.cents,currency:"usd",methods:["card","base_usdc"],fields});
    const price=String(BigInt(offer.cents)/100n);
    return res.type("html").send(head(offer.title)+`<p>${price} USD once</p><button type="button" id="card">Pay by card</button>
      <details><summary>Pay with USDC on Base</summary><form id="wallet"><label>Receipt email <input name="email" type="email" maxlength="254" required></label>
      ${offer.target?`<label>${offer.target} <input name="target" type="url" maxlength="300" required></label>`:""}
      ${offer.city?'<label>City (optional) <input name="city" maxlength="120"></label>':""}
      <button type="submit">Pay ${price} USDC</button></form></details><p id="state" role="status"></p>
      <script type="module" src="/checkout/hosted-order.js"></script></main></body></html>`);
  } catch { return res.status(503).json({error:"The original checkout is unavailable."}); }
});
router.post("/hosted/:offer",async(req,res)=>{
  const care=req.app.get("sdsCare");
  if(!care || !legacyEnabled(req.params.offer,process.env)) return res.sendStatus(404);
  try { return res.status(201).json(await care.legacyStart({...req.body,offer:req.params.offer})); }
  catch(e) {return res.status(e instanceof CareError?e.status:503).json({error:e instanceof CareError?e.message:"Check the original order before continuing."});}
});
router.get("/fix-pack",(_req,res)=>res.type("html").send(head("Download your Fix Pack")+`<form method="post"><label>License from your receipt
  <input name="license" required autocomplete="off"></label><button>Download Fix Pack</button></form></main></body></html>`));
router.post("/fix-pack",urlencoded({extended:false,limit:"2kb"}),async(req,res)=>{
  const cap=parseLegacyLicense(req.body?.license);
  try {
    const delivery=cap && await req.app.get("sdsCare")?.legacyEntitlement(cap.id,cap.proof);
    if(delivery?.kind!=="fixpack")return res.status(403).send("A paid Fix Pack license is required.");
    const content=await generateCompleteFixPack(delivery.target);
    return res.attachment("ai-readiness-fix-pack.md").type("text/markdown").send(content);
  } catch {return res.status(503).send("Your Fix Pack could not be generated. Keep your receipt and try this download again.");}
});
export default router;
