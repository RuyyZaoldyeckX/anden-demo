import {
  initial,
  createDraft,
  quote,
  confirm,
  verifyStock,
} from "./demo-domain.mjs";
let pending;
function open() {
  if (!pending)
    pending = new Promise((resolve, reject) => {
      const r = indexedDB.open("anden-demo-publica-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("desk");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  return pending;
}
async function transaction(write, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("desk", write ? "readwrite" : "readonly"),
      store = tx.objectStore("desk"),
      read = store.get(1);
    let value, domainError;
    read.onsuccess = () => {
      try {
        const state = read.result ?? initial();
        value = fn(state);
        if (write) store.put(state, 1);
      } catch (e) {
        domainError = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(value);
    tx.onabort = () =>
      reject(domainError ?? tx.error ?? Error("Operación cancelada."));
  });
}
export const demo = {
  state: () => transaction(false, (s) => s),
  create: (data) =>
    transaction(true, (s) => createDraft(s, data, crypto.randomUUID())),
  quote: (id) => transaction(false, (s) => quote(s, id)),
  confirm: (id, slot) => transaction(true, (s) => confirm(s, id, slot)),
  verifyStock: (id) => transaction(true, (s) => verifyStock(s, id)),
  reset: () => transaction(true, (s) => Object.assign(s, initial())),
};
