/* ANUBIS — stockage local (IndexedDB). Tout reste sur l'iPhone. */
const DB = (() => {
  const NAME = 'anubis', VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('affaires')) db.createObjectStore('affaires', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('visites')) {
          const s = db.createObjectStore('visites', { keyPath: 'id' });
          s.createIndex('affaireId', 'affaireId');
        }
        if (!db.objectStoreNames.contains('media')) {
          const s = db.createObjectStore('media', { keyPath: 'id' });
          s.createIndex('visiteId', 'visiteId');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : r);
      t.onerror = () => reject(t.error);
    });
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  return {
    uid,
    put: (store, obj) => tx(store, 'readwrite', s => s.put(obj)),
    get: (store, id) => tx(store, 'readonly', s => s.get(id)),
    del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
    all: (store) => tx(store, 'readonly', s => s.getAll()),
    byIndex: (store, index, value) => tx(store, 'readonly', s => s.index(index).getAll(value)),
    clear: (store) => tx(store, 'readwrite', s => s.clear()),
    async getSetting(key, def) {
      const r = await this.get('settings', key);
      return r ? r.value : def;
    },
    setSetting(key, value) { return this.put('settings', { key, value }); },
  };
})();
