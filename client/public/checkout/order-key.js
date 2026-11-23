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
        order = read.result && read.result!==replaceCompleted ? read.result : crypto.randomUUID();
        if (order!==read.result) store.put(order,key);
      };
      tx.oncomplete = () => { db.close(); resolve(order); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
