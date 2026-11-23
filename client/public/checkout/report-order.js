import { pendingOrder, showPreviousOrder } from "./order-key.js";
const status = document.querySelector("#state");
const card = document.querySelector("#card");
const form = document.querySelector("#wallet");
const finding = new URL(location.href).searchParams.get("finding");
const key = "report/" + (finding || "");
let busy = false;

async function openPayment(method) {
  if (busy) return;
  busy = true; card.disabled = true; form.querySelector("button").disabled = true;
  try {
    const order = await pendingOrder(key);
    const body = { order, method, finding };
    if (method === "base_usdc") {
      const fields = new FormData(form);
      Object.assign(body, { email: fields.get("email"), publicOrigin: fields.get("publicOrigin"),
        getRoute: fields.get("getRoute"), authorized: fields.has("authorized") });
    }
    const response = await fetch("/api/checkout/seller-conformance/order",{ method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(body),redirect:"error" });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Check the status of this report order.");
    location.assign(method === "card" ? data.url : data.paymentUrl + "/wallet");
  } catch (error) {
    status.textContent = error.message || "Check the status of this report order.";
    busy = false; card.disabled = false; form.querySelector("button").disabled = false;
  }
}
card.onclick = () => openPayment("card");
form.onsubmit = event => { event.preventDefault(); void openPayment("base_usdc"); };

void showPreviousOrder(key, "/api/checkout/seller-conformance/order/status");
