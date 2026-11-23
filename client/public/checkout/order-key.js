// An IndexedDB read/write transaction elects one purchase key across browser tabs.
export function pendingOrder(key) {
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
