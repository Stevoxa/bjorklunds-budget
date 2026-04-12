/* Lokala temaresurser (startbild, film, ikoner) i IndexedDB — oberoende av budget-vault. */
(function (global) {
  const DB_NAME = "bjorklunds_theme_assets";
  const DB_VER = 1;
  const STORE = "blobs";

  /** @type {string[]} */
  const KNOWN_KEYS = [
    "splashPng",
    "introMp4",
    "appleTouchIcon",
    "favicon32",
    "icon192",
    "icon512",
    "iconMaskable192",
    "iconMaskable512"
  ];

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
    });
  }

  /**
   * @param {string} key
   * @returns {Promise<Blob | undefined>}
   */
  async function getBlob(key) {
    if (typeof indexedDB === "undefined") return undefined;
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
    } catch {
      return undefined;
    }
  }

  /**
   * @param {string} key
   * @param {Blob} blob
   */
  async function putBlob(key, blob) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(blob, key);
    });
  }

  async function deleteKey(key) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(key);
    });
  }

  async function clearAll() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
  }

  /**
   * @param {Record<string, Blob>} map
   */
  async function putMany(map) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const os = tx.objectStore(STORE);
      for (const [k, v] of Object.entries(map)) {
        if (v instanceof Blob) os.put(v, k);
      }
    });
  }

  global.BjorkThemeAssets = {
    KNOWN_KEYS,
    getBlob,
    putBlob,
    putMany,
    deleteKey,
    clearAll
  };
})(typeof window !== "undefined" ? window : globalThis);
