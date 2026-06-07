// ==========================================
// IndexedDB Persistence Layer
// ==========================================
const DB_NAME = 'KidsRoutineDB';
const DB_VERSION = 1;

let db;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('routines')) db.createObjectStore('routines', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'id' });
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(); };
    request.onerror = (e) => reject(e);
  });
}

export function dbPut(storeName, data) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve();
  });
}

export function dbGetAll(storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

export function dbDelete(storeName, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
  });
}
