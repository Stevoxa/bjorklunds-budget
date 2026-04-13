/**
 * Lokal vault: IndexedDB + Web Crypto (PBKDF2-SHA256 → AES-256-GCM).
 * Sessionsnyckel hålls i minnet. Nyckeln är extractable så att valfri
 * WebAuthn PRF-baserad “snabb upplåsning” kan kryptera en kopia av rånyckeln
 * (endast på enheten; lösenfras förblir alltid giltig).
 *
 * Biometrik: WebAuthn med PRF-tillägget — kräver säker kontext (HTTPS/localhost)
 * och webbläsare som exponerar prf (t.ex. nyare Chrome; iOS varierar).
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

  const WEBAUTHN_BLOB_VERSION = 1;
  const HKDF_BIO_INFO = new TextEncoder().encode("bjork-vault-bio-wrap-v1");

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
   * Extractable: krävs för att packa in samma AES-nyckel med PRF-nyckel vid aktivering av biometrik.
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
      true,
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

  function validateWebAuthnBlob(w) {
    return (
      w &&
      typeof w === "object" &&
      Number(w.v) === WEBAUTHN_BLOB_VERSION &&
      typeof w.credentialIdB64 === "string" &&
      typeof w.prfSaltB64 === "string" &&
      w.wrap &&
      typeof w.wrap.ivB64 === "string" &&
      typeof w.wrap.ctB64 === "string"
    );
  }

  /**
   * @param {ArrayBuffer | ArrayBufferView} prfOutput
   */
  async function deriveBioAesFromPrf(prfOutput) {
    const u8 = prfOutput instanceof ArrayBuffer ? new Uint8Array(prfOutput) : new Uint8Array(prfOutput.buffer, prfOutput.byteOffset, prfOutput.byteLength);
    const baseKey = await crypto.subtle.importKey("raw", u8, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_BIO_INFO },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
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

  async function idbSetRow(row) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.objectStore(STORE).put(row, ROW_KEY);
    });
  }

  /** Byt envelope men behåll webAuthn om den redan finns. */
  async function idbPutEnvelopeMerge(envelope) {
    const prev = await idbGet();
    const next = {
      envelope,
      updatedAt: new Date().toISOString(),
      ...(prev && validateWebAuthnBlob(prev.webAuthn) ? { webAuthn: prev.webAuthn } : {})
    };
    await idbSetRow(next);
  }

  /** Ny vault-rad (skapande / import) — utan biometrik. */
  async function idbPutEnvelopeFresh(envelope) {
    await idbSetRow({ envelope, updatedAt: new Date().toISOString() });
  }

  function getRpId() {
    try {
      return String(global.location?.hostname || "");
    } catch {
      return "";
    }
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

    /** Säker kontext + WebAuthn; PRF-kapabilitet om webbläsaren rapporterar den. */
    async isBiometricUnlockLikelySupported() {
      try {
        if (!global.isSecureContext) return false;
        if (typeof global.PublicKeyCredential === "undefined") return false;
        if (typeof global.PublicKeyCredential.getClientCapabilities === "function") {
          const caps = await global.PublicKeyCredential.getClientCapabilities();
          return caps.prf === true;
        }
        return true;
      } catch {
        return false;
      }
    },

    async hasBiometricUnlock() {
      const row = await idbGet();
      return validateWebAuthnBlob(row?.webAuthn);
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
     * Lås upp med WebAuthn + PRF (samma vault som lösenfras).
     */
    async unlockWithBiometric() {
      const row = await idbGet();
      if (!row?.envelope || !validateEnvelope(row.envelope)) return { ok: false, error: "no-vault" };
      const w = row.webAuthn;
      if (!validateWebAuthnBlob(w)) return { ok: false, error: "no-webauthn" };
      const rpId = getRpId();
      if (!rpId) return { ok: false, error: "no-rpid" };

      const challenge = randomBytes(32);
      const prfSalt = b64decode(w.prfSaltB64);
      let credId;
      try {
        credId = b64decode(w.credentialIdB64);
      } catch {
        return { ok: false, error: "bad-cred-id" };
      }

      let assertion;
      try {
        assertion = await global.navigator.credentials.get({
          publicKey: {
            challenge,
            rpId,
            allowCredentials: [{ type: "public-key", id: credId, transports: ["internal", "hybrid"] }],
            userVerification: "required",
            extensions: { prf: { eval: { first: prfSalt } } }
          }
        });
      } catch {
        return { ok: false, error: "webauthn-fail" };
      }

      if (!(assertion instanceof global.PublicKeyCredential)) return { ok: false, error: "bad-assertion" };

      const ext = assertion.getClientExtensionResults?.() || {};
      const prfOut = ext.prf && ext.prf.results && ext.prf.results.first;
      if (!prfOut) return { ok: false, error: "no-prf" };

      const env = row.envelope;
      try {
        const bioAes = await deriveBioAesFromPrf(prfOut);
        const iv = b64decode(w.wrap.ivB64);
        const ct = b64decode(w.wrap.ctB64);
        const rawBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, bioAes, ct);
        const raw = new Uint8Array(rawBuf);
        if (raw.length !== 32) return { ok: false, error: "bad-key-len" };

        const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        const data = await decryptObject(key, env);
        if (!BjorkVault.validateUnlockedPayload(data)) return { ok: false, error: "schema" };
        sessionCryptoKey = key;
        sessionSalt = b64decode(env.crypto.saltB64);
        sessionIterations = Number(env.crypto.iterations);
        return { ok: true, data };
      } catch {
        return { ok: false, error: "decrypt-fail" };
      }
    },

    /**
     * Kräver upplåst vault (lösenfras). Skapar passkey och sparar PRF-wrap av sessionsnyckeln.
     */
    async registerBiometricUnlock() {
      if (!sessionCryptoKey || !sessionSalt) return { ok: false, error: "locked" };
      const row = await idbGet();
      if (!row?.envelope) return { ok: false, error: "no-vault" };
      if (validateWebAuthnBlob(row.webAuthn)) return { ok: false, error: "already" };

      const rpId = getRpId();
      if (!rpId) return { ok: false, error: "no-rpid" };
      if (!(await BjorkVault.isBiometricUnlockLikelySupported())) return { ok: false, error: "unsupported" };

      const prfSalt = randomBytes(32);
      const challenge = randomBytes(32);
      const userId = randomBytes(16);

      let credential;
      try {
        credential = await global.navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: "Björklunds budget", id: rpId },
            user: { id: userId, name: "local-vault", displayName: "Lokal budget" },
            pubKeyCredParams: [
              { type: "public-key", alg: -7 },
              { type: "public-key", alg: -257 }
            ],
            authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
            extensions: { prf: { eval: { first: prfSalt } } }
          }
        });
      } catch {
        return { ok: false, error: "create-fail" };
      }

      if (!(credential instanceof global.PublicKeyCredential)) return { ok: false, error: "bad-credential" };

      const ext = credential.getClientExtensionResults?.() || {};
      const prfOut = ext.prf && ext.prf.results && ext.prf.results.first;
      if (!prfOut) return { ok: false, error: "no-prf" };

      try {
        const bioAes = await deriveBioAesFromPrf(prfOut);
        const raw = await crypto.subtle.exportKey("raw", sessionCryptoKey);
        const iv = randomBytes(12);
        const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, bioAes, raw);

        const webAuthn = {
          v: WEBAUTHN_BLOB_VERSION,
          credentialIdB64: b64encode(new Uint8Array(credential.rawId)),
          prfSaltB64: b64encode(prfSalt),
          wrap: {
            ivB64: b64encode(iv),
            ctB64: b64encode(new Uint8Array(ct))
          }
        };

        await idbSetRow({
          ...row,
          webAuthn,
          updatedAt: new Date().toISOString()
        });
        return { ok: true };
      } catch {
        return { ok: false, error: "wrap-fail" };
      }
    },

    /** Tar bort snabb upplåsning på enheten (lösenfras påverkas inte). Kräver upplåst vault. */
    async clearBiometricUnlock() {
      if (!sessionCryptoKey) return { ok: false, error: "locked" };
      const row = await idbGet();
      if (!row) return { ok: false, error: "no-row" };
      const next = { ...row };
      delete next.webAuthn;
      next.updatedAt = new Date().toISOString();
      await idbSetRow(next);
      return { ok: true };
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
        await idbPutEnvelopeFresh(env);
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
      await idbPutEnvelopeMerge(env);
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
        await idbPutEnvelopeFresh(envelopeJson);
        return { ok: true, data: data.state };
      } catch {
        return { ok: false, error: "decrypt-fail" };
      }
    }
  };

  global.BjorkVault = BjorkVault;
})(typeof window !== "undefined" ? window : globalThis);
