const status = document.querySelector("#state");
const card = document.querySelector("#card");
const form = document.querySelector("#wallet");
const finding = new URL(location.href).searchParams.get("finding");
const key = "report/" + (finding || "");
let busy = false;

// An IndexedDB read/write transaction elects one purchase key across browser tabs.
function pendingOrder() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sds-report-checkout", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("orders");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("orders", "readwrite");
      const store = tx.objectStore("orders"), read = store.get(key);
      let order;
      read.onsuccess = () => {
        order = read.result || crypto.randomUUID();
        if (!read.result) store.add(order, key);
      };
      tx.oncomplete = () => { db.close(); resolve(order); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

async function openPayment(method) {
  if (busy) return;
  busy = true; card.disabled = true; form.querySelector("button").disabled = true;
  try {
    const order = await pendingOrder();
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
