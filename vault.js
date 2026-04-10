/**
 * Lokal vault: IndexedDB + Web Crypto (PBKDF2-SHA256 → AES-256-GCM).
 * Nyckel hålls endast i minnet under upplåst session (non-extractable CryptoKey).
 */
(function (global) {
  "use strict";

  const DB_NAME = "bjorklunds-vault-v1";
  const DB_VERSION = 1;
  const STORE = "vault";
  const ROW_KEY = "singleton";

  const FORMAT = "bjorklunds-budget-vault";
  const FORMAT_VERSION = 1;
  const PAYLOAD_SCHEMA_VERSION = 1;
  const PBKDF2_ITERATIONS = 350000;

  /** @type {CryptoKey | null} */
  let sessionCryptoKey = null;
  /** @type {Uint8Array | null} */
  let sessionSalt = null;
  /** PBKDF2-iterationer för nuvarande vault (måste följa med i varje sparad envelope). */
  let sessionIterations = PBKDF2_ITERATIONS;

  function b64encode(buf) {
    const bytes =
      buf instanceof ArrayBuffer
        ? new Uint8Array(buf)
        : buf instanceof Uint8Array
          ? buf
          : new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64decode(s) {
    const bin = atob(String(s));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function randomBytes(n) {
    const u = new Uint8Array(n);
    crypto.getRandomValues(u);
    return u;
  }

  /**
   * @param {string} passphrase
   * @param {Uint8Array} salt
   * @param {number} iterations
   */
  async function pbkdf2Derive(passphrase, salt, iterations) {
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function buildEnvelope(salt, iv, ciphertextBuf, iterationsUsed) {
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      crypto: {
        kdf: "PBKDF2",
        hash: "SHA-256",
        iterations: iterationsUsed,
        saltB64: b64encode(salt)
      },
      cipher: { alg: "AES-GCM", ivB64: b64encode(iv), ciphertextB64: b64encode(ciphertextBuf) },
      payloadSchemaVersion: PAYLOAD_SCHEMA_VERSION
    };
  }

  function validateEnvelope(e) {
    const it = Number(e?.crypto?.iterations);
    return (
      e &&
      typeof e === "object" &&
      e.format === FORMAT &&
      Number(e.formatVersion) === FORMAT_VERSION &&
      e.cipher &&
      e.cipher.alg === "AES-GCM" &&
      typeof e.cipher.ivB64 === "string" &&
      typeof e.cipher.ciphertextB64 === "string" &&
      e.crypto &&
      typeof e.crypto.saltB64 === "string" &&
      Number.isFinite(it) &&
      it >= 100000
    );
  }

  /**
   * @param {CryptoKey} key
   * @param {Uint8Array} salt
   * @param {object} obj
   */
  async function encryptObject(key, salt, obj, iterationsUsed) {
    const iv = randomBytes(12);
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    return buildEnvelope(salt, iv, ct, iterationsUsed);
  }

  /**
   * @param {CryptoKey} key
   * @param {object} env
   */
  async function decryptObject(key, env) {
    const iv = b64decode(env.cipher.ivB64);
    const ct = b64decode(env.cipher.ciphertextB64);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  function openDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onerror = () => rej(r.error);
      r.onsuccess = () => res(r.result);
      r.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
    });
  }

  async function idbGet() {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const q = tx.objectStore(STORE).get(ROW_KEY);
      q.onsuccess = () => res(q.result ?? null);
      q.onerror = () => rej(q.error);
    });
  }

  async function idbPutEnvelope(envelope) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.objectStore(STORE).put({ envelope, updatedAt: new Date().toISOString() }, ROW_KEY);
    });
  }

  const BjorkVault = {
    FORMAT,
    FORMAT_VERSION,
    PAYLOAD_SCHEMA_VERSION,
    PBKDF2_ITERATIONS,

    isUnlocked() {
      return !!sessionCryptoKey;
    },

    isEnvelope(e) {
      return validateEnvelope(e);
    },

    lock() {
      sessionCryptoKey = null;
      sessionSalt = null;
      sessionIterations = PBKDF2_ITERATIONS;
    },

    validateUnlockedPayload(inner) {
      return (
        inner &&
        typeof inner === "object" &&
        Number(inner.schemaVersion) === PAYLOAD_SCHEMA_VERSION &&
        inner.state &&
        typeof inner.state === "object"
      );
    },

    async hasVault() {
      const row = await idbGet();
      return !!(row && validateEnvelope(row.envelope));
    },

    /**
     * @param {string} passphrase
     */
    async unlock(passphrase) {
      const row = await idbGet();
      if (!row?.envelope) return { ok: false, error: "no-vault" };
      const env = row.envelope;
      if (!validateEnvelope(env)) return { ok: false, error: "bad-envelope" };
      const salt = b64decode(env.crypto.saltB64);
      const iterations = Number(env.crypto.iterations);
      try {
        const key = await pbkdf2Derive(passphrase, salt, iterations);
        const data = await decryptObject(key, env);
        if (!BjorkVault.validateUnlockedPayload(data)) return { ok: false, error: "schema" };
        sessionCryptoKey = key;
        sessionSalt = salt;
        sessionIterations = iterations;
        return { ok: true, data };
      } catch {
        return { ok: false, error: "decrypt-fail" };
      }
    },

    /**
     * @param {string} passphrase
     * @param {object} defaultStatePayload redan normaliserat app-state
     */
    async createVault(passphrase, defaultStatePayload) {
      const salt = randomBytes(16);
      try {
        const key = await pbkdf2Derive(passphrase, salt, PBKDF2_ITERATIONS);
        const inner = { schemaVersion: PAYLOAD_SCHEMA_VERSION, state: defaultStatePayload };
        const env = await encryptObject(key, salt, inner, PBKDF2_ITERATIONS);
        await idbPutEnvelope(env);
        sessionCryptoKey = key;
        sessionSalt = salt;
        sessionIterations = PBKDF2_ITERATIONS;
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    },

    /** Sparar hela app-state som krypterad blob (samma salt som vid unlock). */
    async persistEncryptedState(stateObject) {
      if (!sessionCryptoKey || !sessionSalt) return { ok: false, error: "locked" };
      const inner = { schemaVersion: PAYLOAD_SCHEMA_VERSION, state: stateObject };
      const env = await encryptObject(sessionCryptoKey, sessionSalt, inner, sessionIterations);
      await idbPutEnvelope(env);
      return { ok: true };
    },

    async exportEnvelopeJson(stateObject) {
      if (!sessionCryptoKey || !sessionSalt) return null;
      const inner = { schemaVersion: PAYLOAD_SCHEMA_VERSION, state: stateObject };
      return encryptObject(sessionCryptoKey, sessionSalt, inner, sessionIterations);
    },

    /**
     * Ersätter vault med filens envelope efter lyckad decrypt.
     * @param {string} passphrase
     * @param {object} envelopeJson
     */
    async importReplaceVault(passphrase, envelopeJson) {
      if (!validateEnvelope(envelopeJson)) return { ok: false, error: "bad-file" };
      const salt = b64decode(envelopeJson.crypto.saltB64);
      const iterations = Number(envelopeJson.crypto.iterations);
      try {
        const key = await pbkdf2Derive(passphrase, salt, iterations);
        const data = await decryptObject(key, envelopeJson);
        if (!BjorkVault.validateUnlockedPayload(data)) return { ok: false, error: "schema" };
        sessionCryptoKey = key;
        sessionSalt = salt;
        sessionIterations = Number(envelopeJson.crypto.iterations);
        await idbPutEnvelope(envelopeJson);
        return { ok: true, data: data.state };
      } catch {
        return { ok: false, error: "decrypt-fail" };
      }
    }
  };

  global.BjorkVault = BjorkVault;
})(typeof window !== "undefined" ? window : globalThis);
