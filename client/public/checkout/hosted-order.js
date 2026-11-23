import { pendingOrder, showPreviousOrder } from "./order-key.js";
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

void showPreviousOrder(location.pathname, location.pathname + "/status");
