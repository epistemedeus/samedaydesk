import { pendingOrder } from "./order-key.js";
const card=document.querySelector("#card"), form=document.querySelector("#wallet"), status=document.querySelector("#state");
let busy=false;
async function open(method) {
  if(busy)return;
  busy=true;card.disabled=true;form.querySelector("button").disabled=true;
  try {
    const data=method==="card"?{}:Object.fromEntries(new FormData(form));
    const order=await pendingOrder(location.pathname);
    const res=await fetch(location.pathname+location.search,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...data,method,order}),redirect:"error"});
    const result=await res.json();if(!res.ok)throw Error(result.error);
    const url=new URL(method==="card"?result.url:result.paymentUrl+"/wallet");
    if (url.origin!==(method==="card"?"https://buy.stripe.com":"https://agents.samedaydesk.com") || url.username || url.password)throw Error("Check the payment link in your receipt.");
    location.assign(url.href);
  } catch(e){status.textContent=e.message || "Check the status of this order.";busy=false;card.disabled=false;form.querySelector("button").disabled=false;}
}
card.onclick=()=>open("card");
form.onsubmit=e=>{e.preventDefault();void open("base_usdc");};


const again=document.querySelector("#again"),previous=document.querySelector("#previous");
const methods=form.closest("details");
async function priorOrder(id) {
  const response=await fetch(location.pathname+"/status",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({order:id}),credentials:"same-origin",redirect:"error"});
  if(!response.ok)throw Error("Check the status of the original order.");
  return response.json();
}
async function showPrior() {
  if(!again)return;
  const id=await pendingOrder(location.pathname);
  const prior=await priorOrder(id);
  if(prior.wallet) {
    const wallet=new URL(prior.wallet);
    if(wallet.origin==="https://agents.samedaydesk.com") {previous.href=wallet.href;previous.hidden=false;}
  }
  if(!prior.canOrderAgain)return;
  card.hidden=true;methods.hidden=true;again.hidden=false;
  status.textContent=prior.state==="refunded"?"Your previous order was refunded.":"Your previous order was paid.";
  again.onclick=async()=>{
    again.disabled=true;
    try {
      if(!(await priorOrder(id)).canOrderAgain)throw Error("Check the original order before continuing.");
      await pendingOrder(location.pathname,id);location.reload();
    } catch(error){status.textContent=error.message;again.disabled=false;}
  };
}
void showPrior().catch(()=>{}); // The actual start route also checks the original order.
