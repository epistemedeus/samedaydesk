// An IndexedDB read/write transaction elects one purchase key across browser tabs.
export function pendingOrder(key, replaceCompleted) {
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
        order = read.result && read.result !== replaceCompleted ? read.result : crypto.randomUUID();
        if (order !== read.result) store.put(order, key);
      };
      tx.oncomplete = () => { db.close(); resolve(order); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

export async function showPreviousOrder(key, endpoint) {
  const again = document.querySelector("#again");
  if (!again) return;
  const status = document.querySelector("#state");
  const read = async order => {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ order }), credentials: "same-origin", redirect: "error",
    });
    if (!response.ok) throw Error("Check the status of the original order.");
    return response.json();
  };
  try {
    const order = await pendingOrder(key);
    const prior = await read(order);
    if (prior.wallet) {
      const wallet = new URL(prior.wallet);
      if (wallet.origin === "https://agents.samedaydesk.com" && !wallet.username && !wallet.password) {
        const previous = document.querySelector("#previous");
        previous.href = wallet.href;
        previous.hidden = false;
      }
    }
    if (prior.canOrderAgain !== true) return;
    document.querySelector("#card").hidden = true;
    document.querySelector("#wallet").closest("details").hidden = true;
    again.hidden = false;
    status.textContent = prior.state === "refunded" ? "Your previous order was refunded." : "Your previous order was paid.";
    again.onclick = async () => {
      again.disabled = true;
      try {
        if ((await read(order)).canOrderAgain !== true) throw Error("Check the original order before continuing.");
        await pendingOrder(key, order);
        location.reload();
      } catch (error) {
        status.textContent = error.message;
        again.disabled = false;
      }
    };
  } catch (error) {
    status.textContent = error.message || "Check the status of this order.";
  }
}
